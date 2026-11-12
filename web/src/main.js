import './style.css';
import { loadIndex, loadCase } from './data.js';
import { computeLayout, hitTest } from './ecg/layout.js';
import { drawPaper } from './ecg/paper.js';
import { qtcBazett, qtcFridericia } from './ecg/measures.js';
import {
  loadCalibration,
  saveCalibration,
  clearCalibration,
  openCalibrationDialog,
} from './calibration.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  index: null,
  caseId: null,
  ecg: null,
  speed: 25, // mm/s
  gain: 10, // mm/mV
  ...loadCalibration(), // pxPerMm, calibrated
  layout: null,
};

// ---------------------------------------------------------------- 重绘（rAF 合并）

let pending = false;
function render() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    if (!state.ecg) return;
    state.layout = computeLayout({
      durationMs: state.ecg.durationMs,
      speed: state.speed,
      gain: state.gain,
    });
    drawPaper($('#paper'), state.layout, state.ecg, state.pxPerMm);
    renderStatus();
  });
}

function renderStatus() {
  $('#paper-scale').textContent = `${state.speed} mm/s · ${state.gain} mm/mV · 原始数据（未滤波）`;
  const b = $('#calib-badge');
  b.textContent = state.calibrated ? '尺寸已校准' : '尺寸未校准（近似）';
  b.classList.toggle('warn', !state.calibrated);
}

// ---------------------------------------------------------------- 测量面板

const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));

const MEASURE_ROWS = [
  ['心率', 'Heart rate', (v) => v.HR_bpm, '次/分'],
  ['PR 间期', 'PR interval', (v) => v.PR_ms, 'ms'],
  ['QRS 时限', 'QRS duration', (v) => v.QRS_ms, 'ms'],
  ['QT 间期', 'QT interval', (v) => v.QT_ms, 'ms'],
  ['QTc（Bazett）', 'QTc, Bazett', (v) => qtcBazett(v.QT_ms, v.RR_ms), 'ms'],
  ['QTc（Fridericia）', 'QTc, Fridericia', (v) => qtcFridericia(v.QT_ms, v.RR_ms), 'ms'],
  ['额面 QRS 电轴', 'Frontal QRS axis', (v) => v.axis_deg, '°'],
];

function renderMeasurements(meta) {
  // 每个来源（算法 / 人工标注）一列，并排显示，便于看出差异
  const srcs = meta.measurements;
  const head =
    `<tr><th></th>${srcs.map((s) => `<th class="num src">${escapeHtml(s.label)}</th>`).join('')}<th></th></tr>`;
  const body = MEASURE_ROWS.map(([zh, en, get, unit]) => {
    const vals = srcs.map((s) => get(s.values));
    if (vals.every((v) => v == null)) return '';
    return (
      `<tr><th>${zh}<span class="en">${en}</span></th>` +
      vals.map((v) => `<td class="num">${fmt(v)}</td>`).join('') +
      `<td class="unit">${unit}</td></tr>`
    );
  }).join('');
  $('#measure-table thead').innerHTML = head;
  $('#measure-table tbody').innerHTML = body;
  const kinds = new Set(srcs.map((s) => s.kind));
  $('#measure-note').textContent = kinds.has('algorithm')
    ? '由心电图机常用的自动分析算法测量（来自 PTB-XL+），未经人工校对。两种算法结果不同是正常现象，' +
      '说明"边界在哪里"本身有一定主观性。QTc 由本站按公式计算。'
    : '由医生人工标注计算，取各心搏的中位数。';
}

function renderCaseInfo(meta, entry) {
  $('#case-title').textContent = entry?.title ?? meta.id;
  $('#case-summary').textContent = entry?.summary ?? '';
  const sex = { F: '女', M: '男' }[meta.patient.sex] ?? meta.patient.sex ?? '—';
  $('#case-patient').textContent = `${meta.patient.age ?? '—'} 岁 · ${sex}`;
  $('#case-diag').innerHTML = meta.diagnoses
    .map(
      (d) =>
        `<li>${d.code ? `<code>${escapeHtml(d.code)}</code> ` : ''}${escapeHtml(d.description)}` +
        `${d.likelihood ? `<span class="muted">（可信度 ${d.likelihood}%）</span>` : ''}</li>`,
    )
    .join('');
  $('#case-validated').textContent = meta.validatedByCardiologist
    ? '诊断标签经心内科医生确认（数据库标注）。'
    : '诊断标签未经人工确认。';
  $('#amp-warning').hidden = !meta.amplitudeNormalized;

  const counts = { error: 0, warn: 0, info: 0 };
  meta.issues.forEach((i) => counts[i.level]++);
  const q = $('#case-quality');
  q.innerHTML =
    `<summary>数据质量：${counts.error} 个错误，${counts.warn} 个警告，${counts.info} 条提示</summary>` +
    `<ul>${meta.issues
      .map((i) => `<li class="${i.level}">${i.lead ? `<b>${i.lead}</b> ` : ''}${escapeHtml(i.msg)}</li>`)
      .join('')}</ul>`;

  const s = meta.source;
  const ref = (x) =>
    `<a href="${x.url}" target="_blank" rel="noopener">${escapeHtml(x.name)}</a>（${escapeHtml(x.license)}）` +
    `<br><span class="cite">${escapeHtml(x.citation)}</span>`;
  $('#case-source').innerHTML =
    `<p>${ref(s)}<br>记录：${escapeHtml(s.record)}。${escapeHtml(s.annotation)}。</p>` +
    (s.derived ? `<p>${ref(s.derived)}</p>` : '') +
    `<p class="cite">${escapeHtml(s.physionet)}</p>`;
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------------------------------------------------------------- 病例加载（带令牌，可作废）

let loadToken = 0;
async function selectCase(id) {
  const token = ++loadToken;
  $('#paper-msg').hidden = false;
  $('#paper-msg').textContent = '正在加载病例…';
  try {
    const ecg = await loadCase(id);
    if (token !== loadToken) return; // 用户已切换到别的病例
    state.caseId = id;
    state.ecg = ecg;
    $('#paper-msg').hidden = true;
    const entry = state.index.cases.find((c) => c.id === id);
    renderCaseInfo(ecg.meta, entry);
    renderMeasurements(ecg.meta);
    const u = new URL(location.href);
    u.searchParams.set('case', id);
    history.replaceState(null, '', u);
    render();
  } catch (e) {
    if (token !== loadToken) return;
    console.error(e);
    $('#paper-msg').innerHTML = `病例加载失败：${escapeHtml(e.message)} <button id="retry">重试</button>`;
    $('#retry').onclick = () => selectCase(id);
  }
}

// ---------------------------------------------------------------- 悬停读数

function onHover(ev) {
  const lay = state.layout;
  if (!lay) return;
  const rect = ev.currentTarget.getBoundingClientRect();
  const xMm = (ev.clientX - rect.left) / state.pxPerMm;
  const yMm = (ev.clientY - rect.top) / state.pxPerMm;
  const h = hitTest(lay, xMm, yMm);
  const out = $('#hover-readout');
  if (!h) {
    out.textContent = '把鼠标移到波形上查看时间和电压';
    return;
  }
  out.textContent = `${h.cell.lead} 导联 · ${(h.tMs / 1000).toFixed(3)} s · 光标高度 ${h.mV.toFixed(2)} mV`;
}

// ---------------------------------------------------------------- 启动

async function boot() {
  $('#speed').onchange = (e) => {
    state.speed = Number(e.target.value);
    render();
  };
  $('#gain').onchange = (e) => {
    state.gain = Number(e.target.value);
    render();
  };
  $('#calib-btn').onclick = () =>
    openCalibrationDialog(state.pxPerMm, (ppm) => {
      if (ppm == null) {
        clearCalibration();
        Object.assign(state, loadCalibration());
      } else {
        saveCalibration(ppm);
        Object.assign(state, { pxPerMm: ppm, calibrated: true });
      }
      render();
    });
  $('#paper').addEventListener('mousemove', onHover);
  $('#case-select').onchange = (e) => selectCase(e.target.value);

  try {
    state.index = await loadIndex();
  } catch (e) {
    $('#paper-msg').innerHTML = `病例列表加载失败：${escapeHtml(e.message)} <button onclick="location.reload()">重试</button>`;
    return;
  }
  const sel = $('#case-select');
  sel.innerHTML = state.index.cases
    .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
    .join('');
  const want = new URLSearchParams(location.search).get('case');
  let id = state.index.cases[0]?.id;
  if (want && state.index.cases.some((c) => c.id === want)) id = want;
  else if (want) toast(`找不到病例 "${want}"，已打开默认病例`);
  sel.value = id;
  selectCase(id);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 5000);
}

boot();
