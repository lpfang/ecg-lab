import './style.css';
import { loadIndex, loadCase } from './data.js';
import { computeLayout, hitTest } from './ecg/layout.js';
import { drawPaper, drawOverlay } from './ecg/paper.js';
import { QTC_FORMULAS } from './ecg/measures.js';
import { locate, beatWindow } from './ecg/beats.js';
import { beatBaseline, LIMB_LEADS } from './vcg/vector.js';
import { renderAxes } from './views/axes2d.js';
import { PlanesView } from './views/planes.js';
import { buildPrimer, selectLead as primerSelect } from './views/primer.js';
import { PHASE_INFO } from './content/phases.js';
import { TERMS } from './content/terms.js';
import { REFS } from './content/refs.js';
import {
  loadCalibration,
  saveCalibration,
  clearCalibration,
  openCalibrationDialog,
} from './calibration.js';

const $ = (sel) => document.querySelector(sel);
const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** 只允许 https 链接，其余替换为 # */
const safeUrl = (u) => (/^https:\/\//.test(String(u)) ? esc(u) : '#');
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));

function lsGet(k, def) {
  try {
    return localStorage.getItem(k) ?? def;
  } catch {
    return def;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 隐私模式下忽略 */
  }
}

// ================================================================ 状态

const state = {
  index: null,
  caseId: null,
  ecg: null,
  speed: 25,
  gain: 10,
  ...loadCalibration(),
  showWaves: true,
  level: lsGet('ecg-lab:level', 'plain'), // 'plain' | 'pro'
  tool: 'cursor', // 'cursor' | 'caliper'
  cursorMs: null,
  selectedLead: 'II',
  caliper: null,
  playing: false,
  playRate: 0.2, // 慢动作速度：真实速度的 1/5 或 1/10
  show3d: { axes: true, heart: true },
  layout: null,
};

// 需要重画的部分：paper（静态层）、overlay（光标 / 卡尺）、linked（联动视图）
const dirty = new Set();
let frame = 0;
function invalidate(...parts) {
  parts.forEach((p) => dirty.add(p));
  if (!frame) frame = requestAnimationFrame(flush);
}
function set(patch, ...parts) {
  Object.assign(state, patch);
  invalidate(...parts);
}

function flush() {
  frame = 0;
  if (!state.ecg) return;
  const parts = new Set(dirty);
  dirty.clear();
  if (parts.has('paper')) {
    state.layout = computeLayout({ durationMs: state.ecg.durationMs, speed: state.speed, gain: state.gain });
    drawPaper($('#paper'), state.layout, state.ecg, state.pxPerMm, { showWaves: state.showWaves });
    renderStatus();
    parts.add('overlay');
  }
  if (parts.has('overlay')) {
    drawOverlay($('#overlay'), state.layout, state.ecg, state.pxPerMm, state);
    renderCaliperReadout();
  }
  if (parts.has('linked')) renderLinked();
}

// ================================================================ 联动：此刻、导联轴、3D

const baselineCache = new Map();
function linkedContext() {
  const ecg = state.ecg;
  const beats = ecg.meta.annotations?.beats ?? [];
  const loc = state.cursorMs == null ? null : locate(beats, state.cursorMs);
  if (!loc) return { ecg, loc: null, beat: null, t: state.cursorMs, selectedLead: state.selectedLead };
  const key = `${ecg.meta.id}:${loc.index}`;
  if (!baselineCache.has(key)) baselineCache.set(key, beatBaseline(ecg, loc.beat));
  return {
    ecg,
    loc,
    beat: loc.beat,
    win: beatWindow(beats, loc.index),
    baseline: baselineCache.get(key),
    t: state.cursorMs,
    selectedLead: state.selectedLead,
  };
}

function renderLinked() {
  const ctx = linkedContext();
  const { plane, readout } = renderAxes($('#axes-svg'), ctx);
  $('#axes-title').textContent = plane === 'frontal' ? '额面六轴系统（肢体导联）' : '水平面（胸导联，方向为示意）';
  $('#axes-what').dataset.primer = plane === 'frontal' ? 'frontal' : 'chest';
  renderNow(ctx, readout);
  planes.update(ctx);
  heart?.update({ ...ctx, showAxes: state.show3d.axes, showHeart: state.show3d.heart });
}

// 通俗模式下"专业说明"是否展开：记住用户的选择，换时相重建文字后保持不变
let proMoreOpen = false;

function levelBlock(plain, pro, remember = false) {
  const open = remember && proMoreOpen ? ' open' : '';
  return (
    `<p>${plain}</p>` +
    (state.level === 'pro'
      ? `<p class="pro">${pro}</p>`
      : `<details class="pro-more"${open}${remember ? ' data-remember' : ''}><summary>专业说明</summary><p class="pro">${pro}</p></details>`)
  );
}

// "此刻"框分两部分，避免播放时文字忽长忽短造成抖动：
//   左侧讲解：只在时相、心搏或讲解深度变化时重建（也不会把用户展开的"专业说明"收起）
//   右侧读数：版式固定，每帧只更新数字和标记，数字等宽、带符号
let nowKey = null;
let readKey = null;

/** 带符号、等宽的电压：+1.30 / −0.05（用真正的减号，与加号等宽） */
const signed = (mV) => `${mV < 0 ? '−' : '+'}${Math.abs(mV).toFixed(2)}`;

function renderNow(ctx, readout) {
  const box = $('#now-body');
  const tTxt = state.cursorMs == null ? '' : `${(state.cursorMs / 1000).toFixed(3)} s`;
  const key =
    state.cursorMs == null ? 'none' : !ctx.loc ? 'unannotated' : `${ctx.loc.phase}|${ctx.loc.index}|${state.level}`;
  if (key !== nowKey) {
    nowKey = key;
    box.innerHTML = nowText(ctx, tTxt);
  }
  const t = box.querySelector('.now-t');
  if (t) t.textContent = tTxt;
  renderReadout(readout);
}

function nowText(ctx, tTxt) {
  if (state.cursorMs == null) return '<p class="muted">点击心电图上的任意位置，看看那一刻心脏在做什么。</p>';
  if (!ctx.loc) {
    return `<p class="muted"><span class="now-t">${tTxt}</span>：这里没有可用的波形标注（记录首尾的心搏不完整）。</p>`;
  }
  const info = PHASE_INFO[ctx.loc.phase];
  const b = ctx.beat;
  const ms = (x) => (x == null || Number.isNaN(x) ? '—' : `${Math.round(x)} ms`);
  // 每个时相都给一条本次心搏的实测，行数固定
  const beatFacts = {
    P: `本次心搏 P 波时限 ${ms(b.P && b.P.off - b.P.on)}`,
    PR: `本次心搏 PR 间期 ${ms(b.P && b.QRS.on - b.P.on)}`,
    QRS: `本次心搏 QRS 时限 ${ms(b.QRS.off - b.QRS.on)}`,
    ST: `本次心搏 ST 段时长 ${ms(b.T && b.T.on - b.QRS.off)}`,
    T: `本次心搏 QT 间期 ${ms(b.T && b.T.off - b.QRS.on)}`,
    TP: `本次心搏 TP 段约 ${ms(b.T && ctx.loc.end - b.T.off)}`,
  }[ctx.loc.phase];
  return (
    `<div class="now-head"><span class="chip ${info.color ?? ''}">${info.name}</span>` +
    `<span class="en">${info.en}</span><span class="muted now-t">${tTxt}</span></div>` +
    levelBlock(info.plain, info.pro, true) +
    `<p class="muted small">${beatFacts}（自动标注）</p>` +
    (info.term ? `<p class="small"><a href="#" data-term="${info.term}">了解「${TERMS[info.term].zh}」→</a></p>` : '')
  );
}

function renderReadout(r) {
  const box = $('#now-read');
  const lead = r?.lead ?? state.selectedLead;
  const exact = r ? r.exact : LIMB_LEADS.includes(lead);
  const key = `${lead}|${exact}|${state.level}`;
  if (key !== readKey) {
    readKey = key;
    const pro = state.level === 'pro';
    box.innerHTML =
      `<div class="nr-title"><b>${lead}</b> 导联 · 此刻</div>` +
      `<div class="nr-row"><span class="nr-k">导联电压</span><span class="nr-v" data-f="volt"></span></div>` +
      `<div class="nr-row"><span class="nr-k">波形位置</span><span class="nr-badge" data-f="pos"></span></div>` +
      (pro
        ? exact
          ? `<div class="nr-row"><span class="nr-k">投影 × 系数</span><span class="nr-v" data-f="proj"></span></div>`
          : `<div class="nr-row"><span class="nr-k">示意轴投影</span><span class="nr-badge" data-f="projSign"></span></div>`
        : '') +
      `<p class="nr-note">${
        pro
          ? exact
            ? '额面向量在导联轴上的投影 × 系数，始终等于该导联的电压（Einthoven / Goldberger 关系）。'
            : '水平面向量由 Kors 矩阵重建；胸导联方向为示意，投影只看正负，不等于导联电压。'
          : `电向量箭头偏向 ${lead} 导联正极一侧 → 波形在基线上方；偏向负极一侧 → 在基线下方；箭头很短或与导联轴垂直 → 贴近基线。`
      }</p>` +
      (exact ? '' : '<p class="nr-warn" data-f="warn">此刻示意方向与实测符号不一致：胸导联的真实方向因人而异。</p>');
  }
  const f = (name) => box.querySelector(`[data-f="${name}"]`);
  const v = r?.actual_mV;
  const tiny = v == null || Math.abs(v) < 0.05;
  f('volt').textContent = v == null ? '—' : `${signed(v)} mV`;
  const pos = f('pos');
  pos.textContent = v == null ? '—' : tiny ? '贴近基线' : v > 0 ? '基线上方' : '基线下方';
  pos.className = `nr-badge ${v == null ? '' : tiny ? 'zero' : v > 0 ? 'pos' : 'neg'}`;
  if (f('proj')) f('proj').textContent = r ? `${signed(r.projected_mV)} mV` : '—';
  if (f('projSign')) {
    const p = r?.projected_mV;
    f('projSign').textContent = p == null ? '—' : p >= 0 ? '正' : '负';
    f('projSign').className = `nr-badge ${p == null ? '' : p >= 0 ? 'pos' : 'neg'}`;
  }
  // 预留位置，只切换可见性，不改变高度
  if (f('warn')) f('warn').classList.toggle('show', !!r && !tiny && Math.sign(r.projected_mV) !== Math.sign(v));
}

// ================================================================ 状态栏、测量、病例信息

function renderStatus() {
  $('#paper-scale').textContent = `${state.speed} mm/s · ${state.gain} mm/mV · 原始数据（未滤波）`;
  const b = $('#calib-badge');
  b.textContent = state.calibrated ? '尺寸已校准' : '尺寸未校准（近似）';
  b.classList.toggle('warn', !state.calibrated);
}

const MEASURE_ROWS = [
  ['heartRate', '心率', 'Heart rate', (v) => v.HR_bpm, '次/分'],
  ['prInterval', 'PR 间期', 'PR interval', (v) => v.PR_ms, 'ms'],
  ['qrs', 'QRS 时限', 'QRS duration', (v) => v.QRS_ms, 'ms'],
  ['qtInterval', 'QT 间期', 'QT interval', (v) => v.QT_ms, 'ms'],
  ...QTC_FORMULAS.map((f) => ['qtc', `QTc（${f.zh}）`, f.expr, (v) => f.fn(v.QT_ms, v.RR_ms), 'ms']),
  ['axis', '额面 QRS 电轴', 'Frontal QRS axis', (v) => v.axis_deg, '°'],
];

// 右栏较窄，列名用简称，鼠标悬停显示全称
const SHORT_LABEL = { '12sl': 'GE 12SL', unig: 'Glasgow', area: '本站', ludb: '人工标注' };

function renderMeasurements(meta) {
  const srcs = meta.measurements;
  $('#measure-table thead').innerHTML =
    `<tr><th></th>${srcs
      .map((s) => `<th class="num src" title="${esc(s.label)}">${esc(SHORT_LABEL[s.id] ?? s.label)}</th>`)
      .join('')}<th></th></tr>`;
  $('#measure-table tbody').innerHTML = MEASURE_ROWS.map(([term, zh, en, get, unit]) => {
    const vals = srcs.map((s) => get(s.values));
    if (vals.every((v) => v == null)) return '';
    return (
      `<tr><th><a href="#" data-term="${term}">${zh}</a><span class="en">${en}</span></th>` +
      vals.map((v) => `<td class="num">${fmt(v)}</td>`).join('') +
      `<td class="unit">${unit}</td></tr>`
    );
  }).join('');
  $('#measure-note').innerHTML =
    '间期由心电图机常用的自动分析算法测量（来自 PTB-XL+），未经人工校对；不同算法结果略有差异是正常的。' +
    'QTc 由本站按四种公式计算，结果不同，说明"换算方法"本身会影响结论。' +
    '"本站计算"的电轴用 I 与 aVF 的 QRS 净面积。点击项目名称查看解释。';
}

function renderCaseInfo(meta, entry) {
  $('#case-title').textContent = entry?.title ?? meta.id;
  $('#case-summary').textContent = entry?.summary ?? '';
  const sex = { F: '女', M: '男' }[meta.patient.sex] ?? meta.patient.sex ?? '—';
  $('#case-patient').textContent = `${meta.patient.age ?? '—'} 岁 · ${sex}`;
  $('#case-diag').innerHTML = meta.diagnoses
    .map(
      (d) =>
        `<li>${d.code ? `<code>${esc(d.code)}</code> ` : ''}${esc(d.description)}` +
        `${d.likelihood ? `<span class="muted">（可信度 ${esc(d.likelihood)}%）</span>` : ''}</li>`,
    )
    .join('');
  $('#case-validated').textContent = meta.validatedByCardiologist
    ? '诊断标签经心内科医生确认（数据库标注）。'
    : '诊断标签未经人工确认。';
  $('#amp-warning').hidden = !meta.amplitudeNormalized;
  $('#wave-source').textContent = meta.annotations?.source ?? '本例没有波形标注';

  const counts = { error: 0, warn: 0, info: 0 };
  meta.issues.forEach((i) => counts[i.level]++);
  $('#case-quality').innerHTML =
    `<summary>数据质量：${counts.error} 个错误，${counts.warn} 个警告，${counts.info} 条提示</summary>` +
    `<ul>${meta.issues
      .map((i) => `<li class="${esc(i.level)}">${i.lead ? `<b>${esc(i.lead)}</b> ` : ''}${esc(i.msg)}</li>`)
      .join('')}</ul>`;

  const s = meta.source;
  const ref = (x) =>
    `<a href="${safeUrl(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>（${esc(x.license)}）` +
    `<br><span class="cite">${esc(x.citation)}</span>`;
  $('#case-source').innerHTML =
    `<p>${ref(s)}<br>记录：${esc(s.record)}。${esc(s.annotation)}。</p>` +
    (s.derived ? `<p>${ref(s.derived)}</p>` : '') +
    `<p class="cite">${esc(s.physionet)}</p>`;
}

// ================================================================ 卡尺

function renderCaliperReadout() {
  const box = $('#caliper-readout');
  const c = state.caliper;
  box.hidden = state.tool !== 'caliper';
  if (box.hidden) return;
  if (!c?.a || !c?.b) {
    $('#caliper-text').textContent = '在波形上按住鼠标拖动，测量两点之间的时间和电压。';
    return;
  }
  const dt = Math.abs(c.b.t - c.a.t);
  const dv = c.b.mV - c.a.mV;
  $('#caliper-text').innerHTML =
    `时间差 <b>${dt.toFixed(0)} ms</b>` +
    (dt > 200 ? `（若为 RR 间期，心率 = 60000 ÷ ${dt.toFixed(0)} = <b>${(60000 / dt).toFixed(0)} 次/分</b>）` : '') +
    ` · 高度差 <b>${dv >= 0 ? '+' : ''}${dv.toFixed(2)} mV</b>`;
}

// ================================================================ 指针与键盘

function pointerHit(ev) {
  if (!state.layout) return null; // 首次绘制完成前（例如页面在后台）忽略指针
  const rect = $('#overlay').getBoundingClientRect();
  return hitTest(state.layout, (ev.clientX - rect.left) / state.pxPerMm, (ev.clientY - rect.top) / state.pxPerMm);
}

let dragging = false;
function onPointerDown(ev) {
  const h = pointerHit(ev);
  if (!h) return;
  dragging = true;
  $('#overlay').setPointerCapture(ev.pointerId);
  stopPlay();
  if (state.tool === 'caliper') {
    const p = { t: h.tMs, mV: h.mV };
    set({ caliper: { row: h.cell.row, a: p, b: p, march: $('#caliper-march').checked } }, 'overlay');
  } else {
    set({ cursorMs: h.tMs, selectedLead: h.cell.lead }, 'overlay', 'linked');
  }
}
function onPointerMove(ev) {
  const h = pointerHit(ev);
  const out = $('#hover-readout');
  out.textContent = h
    ? `${h.cell.lead} 导联 · ${(h.tMs / 1000).toFixed(3)} s · 光标高度 ${h.mV.toFixed(2)} mV`
    : '点击波形放置时间光标';
  if (!dragging || !h) return;
  if (state.tool === 'caliper') {
    if (!state.caliper) return; // 拖动中按了 Esc 或切换了病例
    const row = state.caliper.row;
    // 卡尺限制在按下时的那一行；电压按该行基线计算
    const r = state.layout.rows[row];
    const rect = $('#overlay').getBoundingClientRect();
    const yMm = (ev.clientY - rect.top) / state.pxPerMm;
    set({ caliper: { ...state.caliper, b: { t: h.tMs, mV: (r.baselineMm - yMm) / state.gain } } }, 'overlay');
  } else {
    set({ cursorMs: h.tMs, selectedLead: h.cell.lead }, 'overlay', 'linked');
  }
}
function onPointerUp() {
  dragging = false;
}

function onKey(ev) {
  if (ev.target instanceof Element && ev.target.closest('input, select, textarea, dialog, button')) return;
  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
    if (state.cursorMs == null) return;
    const step = (ev.shiftKey ? 40 : 4) * (ev.key === 'ArrowLeft' ? -1 : 1);
    const t = Math.min(state.ecg.durationMs - 1, Math.max(0, state.cursorMs + step));
    set({ cursorMs: t }, 'overlay', 'linked');
    ev.preventDefault();
  } else if (ev.key === ' ') {
    state.playing ? stopPlay() : startPlay();
    ev.preventDefault();
  } else if (ev.key === 'Escape') {
    dragging = false;
    set({ caliper: null }, 'overlay');
  }
}

// ================================================================ 慢动作播放

let playRaf = 0;
/** 播放范围：第一个心搏开始到最后一个心搏结束（含首个 P 波与末个 T 波） */
function playRange() {
  const beats = state.ecg.meta.annotations?.beats ?? [];
  if (!beats.length) return [0, state.ecg.durationMs];
  const first = beats[0];
  const last = beats[beats.length - 1];
  return [first.P ? first.P.on : first.QRS.on - 120, Math.min(state.ecg.durationMs, (last.T ? last.T.off : last.QRS.off) + 150)];
}

function startPlay() {
  if (!state.ecg) return;
  const caseId = state.caseId;
  const range = playRange();
  if (state.cursorMs == null || state.cursorMs < range[0] || state.cursorMs >= range[1]) state.cursorMs = range[0];
  state.playing = true;
  $('#play-btn').textContent = '⏸ 暂停';
  let last = performance.now();
  const step = (now) => {
    if (state.caseId !== caseId) return stopPlay(); // 播放中切换了病例
    const dt = Math.min(100, now - last);
    last = now;
    let t = state.cursorMs + dt * state.playRate; // 每帧读取，播放中切换速度立即生效
    if (t >= range[1]) t = range[0];
    set({ cursorMs: t }, 'overlay', 'linked');
    playRaf = requestAnimationFrame(step);
  };
  playRaf = requestAnimationFrame(step);
}
function stopPlay() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(playRaf);
  $('#play-btn').textContent = '▶ 慢动作播放';
}

// ================================================================ 术语弹窗与术语表

function termHtml(id, full = false) {
  const t = TERMS[id];
  if (!t) return '';
  const refs = (t.refs ?? [])
    .map((r) => REFS[r])
    .filter(Boolean)
    .map((r) => `<li>${esc(r.text)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</li>`)
    .join('');
  return (
    `<h4>${t.zh} <span class="en">${t.en}</span></h4>` +
    (full || state.level === 'pro'
      ? `<p>${t.plain}</p><p class="pro">${t.pro}</p>`
      : levelBlock(t.plain, t.pro)) +
    (t.primer ? `<p><a href="#" data-primer="${t.primer}">看图了解：读图入门 →</a></p>` : '') +
    (refs ? `<details class="refs"><summary>出处</summary><ul>${refs}</ul><p class="muted">出处根据公开文献整理，尚未逐条核对原文。</p></details>` : '')
  );
}

function openTerm(id, anchor) {
  const pop = $('#term-pop');
  pop.innerHTML = termHtml(id) + '<button class="pop-close" aria-label="关闭">×</button>';
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(380, window.innerWidth - 32);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(16, Math.min(window.innerWidth - w - 16, r.left + window.scrollX))}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  pop.querySelector('.pop-close').onclick = () => (pop.hidden = true);
}

/** 打开读图入门，滚动到指定小节，并高亮当前选中的导联 */
function openPrimer(section) {
  const body = $('#primer-body');
  buildPrimer(body, state.level); // 每次按当前讲解深度重建
  $('#primer').showModal();
  primerSelect(body, state.selectedLead, state.level);
  const target = body.querySelector(`#pr-sec-${section}`);
  if (target) target.scrollIntoView({ block: 'start' });
}

function openGlossary() {
  const d = $('#glossary');
  $('#glossary-body').innerHTML = Object.keys(TERMS)
    .map((id) => `<section class="gl-item">${termHtml(id, true)}</section>`)
    .join('');
  d.showModal();
}

// ================================================================ 3D（懒加载，失败不影响其他功能）

let heart = null;
const planes = new PlanesView(document.querySelector('#planes'));
let heartLoading = null;
function loadHeart() {
  if (heart || heartLoading) return;
  const box = $('#heart-view');
  const msg = $('#heart-msg');
  msg.hidden = false;
  msg.textContent = '正在加载 3D 视图…';
  heartLoading = import('./views/heart3d.js')
    .then(({ Heart3D }) => {
      heart = new Heart3D(box);
      msg.hidden = true;
      invalidate('linked');
    })
    .catch((e) => {
      console.error(e);
      msg.innerHTML = `3D 视图加载失败：${esc(e.message)} <button id="heart-retry">重试</button>`;
      $('#heart-retry').onclick = () => loadHeart();
    })
    .finally(() => (heartLoading = null));
}

// ================================================================ 病例加载（带令牌，可作废）

let loadToken = 0;
async function selectCase(id) {
  const token = ++loadToken;
  stopPlay();
  $('#paper-msg').hidden = false;
  $('#paper-msg').textContent = '正在加载病例…';
  try {
    const ecg = await loadCase(id);
    if (token !== loadToken) return;
    const beats = ecg.meta.annotations?.beats ?? [];
    const first = beats[Math.min(2, beats.length - 1)];
    set(
      {
        caseId: id,
        ecg,
        caliper: null,
        // 默认光标放在第 3 个心搏的 R 波上，让联动视图一开始就有内容
        cursorMs: first ? first.QRS.peak ?? first.QRS.on : null,
        selectedLead: 'II',
      },
      'paper',
      'linked',
    );
    $('#paper-msg').hidden = true;
    renderCaseInfo(ecg.meta, state.index.cases.find((c) => c.id === id));
    renderMeasurements(ecg.meta);
    const u = new URL(location.href);
    u.searchParams.set('case', id);
    history.replaceState(null, '', u);
  } catch (e) {
    if (token !== loadToken) return;
    console.error(e);
    $('#paper-msg').innerHTML = `病例加载失败：${esc(e.message)} <button id="retry">重试</button>`;
    $('#retry').onclick = () => selectCase(id);
  }
}

// ================================================================ 启动

function bindControls() {
  $('#speed').onchange = (e) => set({ speed: Number(e.target.value) }, 'paper');
  $('#gain').onchange = (e) => set({ gain: Number(e.target.value) }, 'paper');
  $('#show-waves').onchange = (e) => set({ showWaves: e.target.checked }, 'paper');
  $('#calib-btn').onclick = () =>
    openCalibrationDialog(state.pxPerMm, (ppm) => {
      if (ppm == null) {
        clearCalibration();
        set(loadCalibration(), 'paper');
      } else {
        saveCalibration(ppm);
        set({ pxPerMm: ppm, calibrated: true }, 'paper');
      }
    });
  for (const b of document.querySelectorAll('[data-tool]')) {
    b.onclick = () => {
      set({ tool: b.dataset.tool }, 'overlay');
      document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
      $('#overlay').classList.toggle('caliper', state.tool === 'caliper');
    };
  }
  $('#caliper-march').onchange = (e) =>
    state.caliper && set({ caliper: { ...state.caliper, march: e.target.checked } }, 'overlay');
  $('#caliper-clear').onclick = () => set({ caliper: null }, 'overlay');
  $('#play-btn').onclick = () => (state.playing ? stopPlay() : startPlay());
  for (const b of document.querySelectorAll('[data-rate]')) {
    b.onclick = () => {
      state.playRate = Number(b.dataset.rate);
      document.querySelectorAll('[data-rate]').forEach((x) => x.classList.toggle('on', x === b));
    };
  }

  for (const b of document.querySelectorAll('[data-level]')) {
    b.classList.toggle('on', b.dataset.level === state.level);
    b.onclick = () => {
      lsSet('ecg-lab:level', b.dataset.level);
      document.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('on', x === b));
      set({ level: b.dataset.level }, 'linked');
      $('#term-pop').hidden = true;
    };
  }
  $('#glossary-btn').onclick = openGlossary;
  $('#primer-btn').onclick = () => openPrimer('intro');
  $('#primer-close').onclick = () => $('#primer').close();
  // toggle 事件不冒泡，用捕获阶段监听
  $('#now-body').addEventListener(
    'toggle',
    (e) => {
      if (e.target.matches?.('details[data-remember]')) proMoreOpen = e.target.open;
    },
    true,
  );
  $('#glossary-close').onclick = () => $('#glossary').close();

  for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => heart?.setView(b.dataset.view);
  $('#show-axes').onchange = (e) => set({ show3d: { ...state.show3d, axes: e.target.checked } }, 'linked');
  $('#show-heart').onchange = (e) => set({ show3d: { ...state.show3d, heart: e.target.checked } }, 'linked');

  // 导联轴图上点导联名 = 选中该导联
  $('#axes-svg').addEventListener('click', (e) => {
    const lead = e.target.closest('[data-lead]')?.dataset.lead;
    if (lead) set({ selectedLead: lead }, 'overlay', 'linked');
  });

  const ov = $('#overlay');
  ov.addEventListener('pointerdown', onPointerDown);
  ov.addEventListener('pointermove', onPointerMove);
  ov.addEventListener('pointerup', onPointerUp);
  ov.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKey);

  document.addEventListener('click', (e) => {
    const pr = e.target.closest('[data-primer]');
    if (pr) {
      e.preventDefault();
      $('#term-pop').hidden = true;
      if ($('#glossary').open) $('#glossary').close();
      openPrimer(pr.dataset.primer);
      return;
    }
    const a = e.target.closest('[data-term]');
    if (a) {
      e.preventDefault();
      openTerm(a.dataset.term, a);
    } else if (!e.target.closest('#term-pop')) {
      $('#term-pop').hidden = true;
    }
  });
}

async function boot() {
  bindControls();
  try {
    state.index = await loadIndex();
  } catch (e) {
    $('#paper-msg').innerHTML = `病例列表加载失败：${esc(e.message)} <button onclick="location.reload()">重试</button>`;
    return;
  }
  const sel = $('#case-select');
  sel.innerHTML = state.index.cases.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  sel.onchange = (e) => selectCase(e.target.value);
  const want = new URLSearchParams(location.search).get('case');
  let id = state.index.cases[0]?.id;
  if (want && state.index.cases.some((c) => c.id === want)) id = want;
  else if (want) toast(`找不到病例 "${want}"，已打开默认病例`);
  sel.value = id;
  await selectCase(id);
  loadHeart();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 5000);
}

boot();
