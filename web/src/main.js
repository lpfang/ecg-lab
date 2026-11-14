import './style.css';
import { loadIndex, loadCase } from './data.js';
import { computeLayout, hitTest } from './ecg/layout.js';
import { drawPaper, drawOverlay } from './ecg/paper.js';
import { QTC_FORMULAS } from './ecg/measures.js';
import { TOURS, fillTemplate, cursorTime, cursorAt, spotOf } from './tours.js';
import { locate, beatWindow } from './ecg/beats.js';
import { beatBaseline, LIMB_LEADS } from './vcg/vector.js';
import { renderAxes } from './views/axes2d.js';
import { PlanesView } from './views/planes.js';
import { buildPrimer, selectLead as primerSelect } from './views/primer.js';
import { buildAnatomy } from './views/anatomy.js';
import { FIGS as HEART_FIGS } from './content/anatomy.js';
import { PHASE_INFO } from './content/phases.js';
import { TERMS } from './content/terms.js';
import { searchTerms, tokens } from './content/search.js';
import { scpLabel } from './content/scp.js';
import { evaluateLVH, lvhApplicability } from './ecg/lvh.js';
import { REFS } from './content/refs.js';
import { COMPARE, refFor } from './content/compare.js';
import { QUIZ_SETS } from './quiz/bank.js';
import { TOL, gradeLocate, gradeEdge, gradeNumber, gradeAxis, inAnnotatedRange, wavesOf } from './quiz/grade.js';
import { rateTruth, axisTruth, vectorTruth, intervalTruth } from './quiz/answers.js';
import { vectorFigure } from './quiz/vectorFig.js';
import { HANDBOOK, chapterById, chaptersForTerm, termNames, termRegex } from './content/handbook.js';
import { axisWidget, qtcWidget, miWidget, linkTerms } from './views/handbook.js';
import { MI_TERRITORIES, GRID as MI_GRID, EXTRA_LEADS as MI_EXTRA } from './content/mi.js';
import { renderDrugNav, renderDrugChapter, renderDrugSearch, drugById, DRUG_CLASSES, addPinyinAll } from './views/drugbook.js';
import { medianBeat } from './ecg/median.js';
import { drawBeatCompare, drawRhythmCompare, beatRange, BEAT_SPEED, RHYTHM_SPEED } from './views/compare.js';
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
  caseBroken: false, // 新病例的面板渲染中途出错
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
  showRef: false, // 参照基线（PR 段零点与 TP 段）
  quizMark: null, // 测验：未标注区域遮罩、作答后显示的标准答案
  spot: null, // 导览聚光灯（心电图内）：{leads, t0?, t1?}
  cmpMode: lsGet('ecg-lab:cmpMode', 'overlay'), // 与正常对照：'overlay' 重叠 | 'side' 并排
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
    drawOverlay($('#overlay'), state.layout, state.ecg, state.pxPerMm, { ...state, refLines: refLines() });
    renderCaliperReadout();
    if (quiz.set) renderQuizPick();
  }
  if (parts.has('linked')) renderLinked();
  if (parts.has('paper') || parts.has('compare')) drawCompare();
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

/** 参照基线：光标所在心跳的 PR 段零点（本站读数所用）与其前 TP 段电位，各导联一条 */
function refLines() {
  if (!state.showRef || state.cursorMs == null) return null;
  const beats = state.ecg.meta.annotations?.beats ?? [];
  const loc = locate(beats, state.cursorMs);
  if (!loc) return null;
  const ctx = linkedContext();
  const prev = beats[loc.index - 1];
  const b = loc.beat;
  const tpStart = prev?.T ? prev.T.off + 20 : null;
  const tpEnd = (b.P ? b.P.on : b.QRS.on - 120) - 20;
  const tp = {};
  if (tpStart != null && tpEnd - tpStart >= 40) {
    for (const lead of state.ecg.meta.leads) {
      const xs = [];
      for (let t = tpStart; t <= tpEnd; t += 1000 / state.ecg.fs) xs.push(state.ecg.valueAt(lead, t));
      xs.sort((p, q) => p - q);
      tp[lead] = xs[xs.length >> 1];
    }
  }
  return { t0: loc.start, t1: loc.end, pr: ctx.baseline, tp: Object.keys(tp).length ? tp : null };
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
  const blocked = blockedPAt(state.cursorMs);
  const key =
    state.cursorMs == null
      ? 'none'
      : !ctx.loc
        ? `unannotated|${blocked}`
        : `${ctx.loc.phase}|${ctx.loc.index}|${state.level}|${blocked}`;
  if (key !== nowKey) {
    nowKey = key;
    box.innerHTML = nowText(ctx, tTxt);
  }
  const t = box.querySelector('.now-t');
  if (t) t.textContent = tTxt;
  renderReadout(readout);
}

/** 光标落在一个未下传的 P 波上时，返回它在 atrial.waves 中的序号，否则 -1 */
function blockedPAt(t) {
  const waves = state.ecg?.meta.annotations?.atrial?.waves;
  if (t == null || !waves) return -1;
  return waves.findIndex((w) => w.conducts == null && t >= w.on && t <= w.off);
}

/** 房室传导阻滞病例的补充说明（P 波为手工标注时才有） */
function avNote(blocked) {
  const atrial = state.ecg.meta.annotations?.atrial;
  if (!atrial) return '';
  if (blocked >= 0) {
    const w = atrial.waves[blocked];
    return (
      '<p class="af-note">光标处是一个<b>未下传的 P 波</b>：心房"通电"了，但信号没能通过房室结传到心室，所以它后面没有 QRS 波群。' +
      (w.hidden ? '这个 P 波被其他波遮住，位置是按前后 P 波的间隔推定的。' : '') +
      '（上方"此刻"的时相按 QRS 划分心搏，这里不适用。）</p>'
    );
  }
  return atrial.conduction === 'none'
    ? '<p class="af-note">本例为完全性房室传导阻滞：P 波与 QRS 波群各自规律出现、互不相关，所以本框不划分"P 波""PR 段"时相。节律条底部的红色 ✕ 标出每个 P 波。</p>'
    : '<p class="af-note">本例有部分 P 波没有下传到心室（节律条底部的红色 ✕），蓝色横线上的数字是每次下传的 PR 间期。</p>';
}

function nowText(ctx, tTxt) {
  if (state.cursorMs == null) return '<p class="muted">点击心电图上的任意位置，看看那一刻心脏在做什么。</p>';
  if (!ctx.loc) {
    return (
      `<p class="muted"><span class="now-t">${tTxt}</span>：这里没有可用的波形标注（记录首尾的心搏不完整）。</p>` +
      avNote(blockedPAt(state.cursorMs))
    );
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
    TP: (() => {
      if (state.cursorMs < b.QRS.on) {
        const prev = state.ecg.meta.annotations.beats[ctx.loc.index - 1];
        return `此处 TP 段约 ${ms(prev?.T && b.QRS.on - prev.T.off)}`;
      }
      return `本次心搏 TP 段约 ${ms(b.T && ctx.loc.end - b.T.off)}`;
    })(),
  }[ctx.loc.phase];
  return (
    `<div class="now-head"><span class="chip ${info.color ?? ''}">${info.name}</span>` +
    `<span class="en">${info.en}</span><span class="muted now-t">${tTxt}</span></div>` +
    levelBlock(info.plain, info.pro, true) +
    (state.ecg.meta.rhythm === 'AFIB'
      ? '<p class="af-note">本例为<a href="#" data-term="afib">心房颤动</a>：心房没有统一的"通电"，没有 P 波，QRS 之前只有细小不规则的颤动波，所以这里没有"P 波""PR 段"时相。</p>'
      : state.ecg.meta.rhythm === 'AFLT'
        ? '<p class="af-note">本例为心房扑动：心房以很快而规则的节律"通电"，没有正常 P 波，代之以锯齿状的扑动波（F 波），所以这里没有"P 波""PR 段"时相。</p>'
        : '') +
    avNote(blockedPAt(state.cursorMs)) +
    `<p class="muted small">${beatFacts}（${state.ecg.meta.annotations?.atrial && ['P', 'PR'].includes(ctx.loc.phase) ? 'P 波为手工标注' : '自动标注'}）</p>` +
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
  // 幅度归一化的病例（LUDB）：纵向只是相对幅度，不写 mV
  const amp = state.ecg?.meta.amplitudeNormalized ? `${state.gain} mm/单位相对幅度（不是真实 mV）` : `${state.gain} mm/mV`;
  $('#paper-scale').textContent = `${state.speed} mm/s · ${amp} · 原始数据（未滤波）`;
  // 增益下拉框的单位跟着改
  const unit = state.ecg?.meta.amplitudeNormalized ? 'mm/单位相对幅度' : 'mm/mV';
  for (const o of $('#gain').options) o.textContent = `${o.value} ${unit}`;
  const b = $('#calib-badge');
  b.textContent = state.calibrated ? '已校准' : '未校准';
  b.title = state.calibrated
    ? '已按银行卡校准屏幕尺寸，图上 1 mm 接近真实 1 mm'
    : '屏幕尺寸未校准：图上的 1 mm 只是近似值。点"屏幕校准"可以校准；测量数值不受影响。';
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
  // 房室传导阻滞：算法只给一个"代表性"PR，逐次 PR 不同或 P 波与 QRS 无关时这个数字没有意义
  const av = meta.annotations?.atrial?.conduction;
  $('#measure-warn').innerHTML = !av
    ? ''
    : av === 'none'
      ? '<p class="lvh-alert">本例 P 波与 QRS 互不相关（完全性房室传导阻滞），<b>表中算法给出的 PR 间期没有意义</b>。</p>'
      : '<p class="lvh-caution">本例有 P 波未下传，每次的 PR 间期不同；表中 PR 是算法给出的代表值，逐次 PR 见心电图节律条底部的蓝色数字。</p>';
  $('#measure-note').innerHTML =
    '间期由心电图机常用的自动分析算法测量（来自 PTB-XL+），未经人工校对；不同算法结果略有差异是正常的。' +
    'QTc 由本站按四种公式计算，结果不同，说明"换算方法"本身会影响结论。' +
    '"本站计算"的电轴用 I 与 aVF 的 QRS 净面积。点击项目名称查看解释。';
}

const fmt2 = (v) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(2));

function renderLVH(meta) {
  const sex = meta.patient.sex;
  const srcs = (meta.amplitudes ?? [])
    .map((s) => ({ ...s, res: evaluateLVH(s.values, sex) }))
    .filter((s) => s.res);
  const codes = meta.diagnoses.map((d) => d.code);
  const app = lvhApplicability(codes);
  $('#lvh-warn').innerHTML =
    (app.invalid.length
      ? `<p class="lvh-alert">本例有${esc(app.invalid.join('、'))}：它本身会改变 QRS 的电压，<b>左心室肥厚电压标准不适用</b>。下面的数值仅供对照。</p>`
      : '') +
    (app.caution.length ? `<p class="lvh-caution">本例有${esc(app.caution.join('、'))}。</p>` : '') +
    (meta.amplitudeNormalized ? '<p class="lvh-alert">本例幅度已被逐导联归一化，不能计算电压标准。</p>' : '');
  if (!srcs.length || meta.amplitudeNormalized) {
    $('#lvh-table thead').innerHTML = '';
    $('#lvh-table tbody').innerHTML = '';
    $('#lvh-note').innerHTML = '<p class="muted">本例没有可用的振幅数据。</p>';
    return;
  }
  $('#lvh-table thead').innerHTML =
    `<tr><th>标准</th>${srcs.map((s) => `<th class="num src" title="${esc(s.label)}">${esc(SHORT_LABEL[s.id] ?? s.label)}</th>`).join('')}<th class="num">阈值</th></tr>`;
  $('#lvh-table tbody').innerHTML = srcs[0].res
    .map((c, i) => {
      const cells = srcs
        .map((s) => {
          const r = s.res[i];
          return `<td class="num${r.met ? ' met' : ''}">${fmt2(r.value)}${r.met ? ' ✓' : ''}</td>`;
        })
        .join('');
      return (
        `<tr><th>${esc(c.name)}<span class="en">${esc(c.formula)}</span></th>${cells}` +
        `<td class="unit">${c.op} ${c.threshold.toFixed(1)}${c.sexSpecific ? (c.sexAssumed ? '（按男性）' : sex === 'F' ? '（女）' : '（男）') : ''}</td></tr>`
      );
    })
    .join('');
  const metAny = srcs.some((s) => s.res.some((r) => r.met));
  $('#lvh-note').innerHTML =
    `<p>${
      metAny
        ? '✓ 表示达到该标准。达到电压标准<b>提示可能</b>有左心室肥厚，但电压也受年龄、体型、胸壁厚度等影响。'
        : '本例没有达到任何一项电压标准。注意：心电图诊断左心室肥厚的敏感性较低，<b>"没达到"不能排除</b>左心室肥厚，确诊通常靠超声心动图。'
    }</p>` +
    '<p class="muted">单位 mV。"本站"以每次心跳 QRS 起点前的 PR 段为零点，取各心跳中位数；R = QRS 内最高正向波，S = 第一个正向波之后最深的负向波（R′ 比 R 高时，中间的深 S 也算）。' +
    '不同来源对 R′、S′ 等多相波的处理不同，个别导联数值会有差异。<a href="#" data-term="lvh">了解左心室肥厚 →</a></p>';
}

const ST_LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

function renderST(meta) {
  const own = (meta.amplitudes ?? []).find((s) => s.id === 'area');
  const gl = (meta.amplitudes ?? []).find((s) => s.id === 'unig');
  if (!own) {
    $('#st-table thead').innerHTML = '';
    $('#st-table tbody').innerHTML = '';
    $('#st-note').textContent = '本例没有可用的 ST 数据。';
    return;
  }
  const cls = (v) => (v == null ? '' : v <= -0.05 ? 'dep' : v >= 0.1 ? 'elev' : '');
  $('#st-table thead').innerHTML =
    '<tr><th>导联</th><th class="num src" title="J 点 = QRS 终点">J 点</th><th class="num src">J + 80 ms</th>' +
    (gl ? '<th class="num src" title="Glasgow Uni-G">Glasgow<br>J + 80 ms</th>' : '') +
    '</tr>';
  const inT = own.values.II?.ST80inT ?? 0; // 各导联相同：J+80 落进 T 波的心搏比例
  const unconf = own.values.II?.ST80unconfirmed ?? 0; // 没有 T 波标注、无法确认的心搏比例（此时读数不着色）
  const st80 = (v) =>
    v.ST80 == null && inT
      ? `<td class="num muted" title="多数心搏的 J+80 ms 已落在 T 波上，这个时点读到的不是 ST 段">T 波内</td>`
      : unconf
        ? `<td class="num muted" title="固定时点读数：多数心搏没有 T 波标注，无法确认是否还在 ST 段">${fmt2(v.ST80)}?</td>`
        : `<td class="num ${cls(v.ST80)}">${fmt2(v.ST80)}</td>`;
  $('#st-table tbody').innerHTML = ST_LEADS.map((l) => {
    const v = own.values[l] ?? {};
    const g = gl?.values[l]?.ST80;
    return (
      `<tr><th>${l}</th><td class="num ${cls(v.STJ)}">${fmt2(v.STJ)}</td>${st80(v)}` +
      // Glasgow 是固定时点读数，可能落在 T 波上：只列数值对照，不做异常着色
      (gl ? `<td class="num">${fmt2(g)}</td>` : '') +
      '</tr>'
    );
  }).join('');
  $('#st-note').innerHTML =
    'ST 段相对于<a href="#" data-term="isoelectric">本次心跳 QRS 起点前的 PR 段</a>的偏移（mV），各心跳中位数。' +
    '<span class="dep-k">蓝色</span> = 压低 ≥ 0.05 mV，<span class="elev-k">红色</span> = 抬高 ≥ 0.1 mV，仅为醒目标记（Glasgow 一列不着色），<b>不是诊断标准</b>' +
    '（ST 异常的判定阈值随导联、性别、年龄不同）。勾选心电图上方的"参照基线"可以看到零点在哪里。' +
    (inT
      ? `<br>本例 ${Math.round(inT * 100)}% 的心跳在 J 点后 80 ms 已进入 T 波（心率快或 ST 段短时常见）。` +
        (own.values.II?.ST80 == null
          ? '本站这一列不给数值，请以 J 点读数为准。'
          : '本站"J + 80 ms"只用了还没进入 T 波的心跳。') +
        'Glasgow 一列是算法按固定时点给出的，仅供对照。'
      : '') +
    (unconf
      ? `<br>本例 ${Math.round(unconf * 100)}% 的心跳没有 T 波标注，无法确认 J 点后 80 ms 是否还在 ST 段。` +
        '本站"J + 80 ms"一列是固定时点读数（带"?"），不做异常着色，请以 J 点读数为准。'
      : '');
}

// ================================================================ 与正常心电图对照

const caseCache = new Map(); // 正常对照病例：加载一次，反复使用
const medianCache = new Map();
let cmp = null; // {id, cfg, ref:{id,label}, cur, refEcg, curMb, refMb}

function loadCached(id) {
  if (!caseCache.has(id)) caseCache.set(id, loadCase(id).catch((e) => (caseCache.delete(id), Promise.reject(e))));
  return caseCache.get(id);
}
// 看 P 波时：按 P 波起点对齐，取 P 波起点前 40 ms 到后 200 ms；
// P 波只有 0.1 s 左右，按真实尺寸画只有指甲盖大，所以走纸 100 mm/s 并放大 3 倍显示
const P_WINDOW = { align: 'P', pre: 40, post: 200 };
const P_VIEW = { speed: 100, zoom: 3 };
function medianOf(id, ecg, focus) {
  const key = `${id}:${focus ?? ''}`;
  if (!medianCache.has(key)) medianCache.set(key, medianBeat(ecg, focus === 'P' ? P_WINDOW : undefined));
  return medianCache.get(key);
}

/** 对照表的数值来源：Glasgow 算法，没有时用 GE 算法（两份心电图用同一种算法比较） */
function algoValues(meta, kind) {
  const list = meta[kind] ?? [];
  return (list.find((a) => a.id === 'unig') ?? list.find((a) => a.id === '12sl'))?.values ?? {};
}
const rrRange = (meta) => {
  const b = meta.annotations?.beats ?? [];
  const rr = b.slice(1).map((x, i) => x.QRS.on - b[i].QRS.on);
  return rr.length ? [Math.min(...rr), Math.max(...rr)] : [null, null];
};

async function renderCompare(ecg) {
  const id = state.caseId;
  const cfg = COMPARE[id];
  const card = $('#compare-card');
  cmp = null;
  card.hidden = !cfg;
  if (!cfg) return;
  const ref = refFor(ecg.meta.patient.sex);
  $('#cmp-ref-label').textContent = ref.label;
  $('#cmp-ref-open').dataset.case = ref.id;
  $('#cmp-mode').hidden = cfg.mode !== 'beat';
  $('#cmp-align').hidden = cfg.mode !== 'beat';
  $('#cmp-scale').textContent =
    cfg.focus === 'P'
      ? `P 波放大显示：1 小格 = ${1000 / P_VIEW.speed} ms × ${(1 / cfg.gain).toFixed(2)} mV`
      : cfg.mode === 'beat'
        ? `${BEAT_SPEED} mm/s · ${cfg.gain} mm/mV` + (cfg.gain > 10 ? '（纵向放大一倍）' : '')
        : `${RHYTHM_SPEED} mm/s · ${cfg.gain} mm/mV · 10 秒`;
  $('#cmp-figs').innerHTML = '';
  $('#cmp-text').innerHTML = '';
  $('#cmp-table').innerHTML = '';
  $('#cmp-msg').hidden = false;
  $('#cmp-msg').textContent = '正在加载正常对照…';
  let refEcg;
  try {
    refEcg = await loadCached(ref.id);
  } catch (e) {
    if (state.caseId !== id) return;
    $('#cmp-msg').textContent = `正常对照加载失败：${e.message}`;
    return;
  }
  if (state.caseId !== id) return; // 已换病例
  $('#cmp-msg').hidden = true;
  cmp = { id, cfg, ref, cur: ecg, refEcg };
  if (cfg.mode === 'beat') {
    cmp.curMb = medianOf(id, ecg, cfg.focus);
    cmp.refMb = medianOf(ref.id, refEcg, cfg.focus);
    $('#cmp-align-text').textContent = cfg.focus === 'P' ? '两个 P 波按起点对齐' : '两个心跳按 QRS 起点对齐';
  }
  $('#cmp-figs').innerHTML = cfg.leads.map(() => '<canvas></canvas>').join('');
  renderCompareText();
  renderCompareTable();
  drawCompare();
}

function drawCompare() {
  if (!cmp || cmp.id !== state.caseId) return;
  const { cfg } = cmp;
  const canvases = $('#cmp-figs').querySelectorAll('canvas');
  if (cfg.mode === 'beat') {
    // 看 P 波时，纵向范围只按 P 波定（到两者中较晚的 P 波终点后 20 ms）
    const pEnd = Math.max(cmp.curMb.waves.P?.off ?? 0, cmp.refMb.waves.P?.off ?? 0) + 20;
    const range = beatRange([cmp.curMb, cmp.refMb], cfg.leads, cfg.focus === 'P' ? pEnd : Infinity);
    cfg.leads.forEach((lead, i) =>
      drawBeatCompare(canvases[i], {
        lead,
        cur: cmp.curMb,
        ref: cmp.refMb,
        gain: cfg.gain,
        range,
        mode: state.cmpMode,
        pxPerMm: state.pxPerMm,
        ...(cfg.focus === 'P' ? P_VIEW : {}),
      }),
    );
  } else {
    cfg.leads.forEach((lead, i) =>
      drawRhythmCompare(canvases[i], {
        lead,
        cur: cmp.cur,
        ref: cmp.refEcg,
        refLabel: cmp.ref.label,
        gain: cfg.gain,
        pxPerMm: state.pxPerMm,
      }),
    );
  }
}

function renderCompareText() {
  if (!cmp) return;
  $('#cmp-text').innerHTML = levelBlock(cmp.cfg.plain, cmp.cfg.pro);
  const n = cmp.curMb?.nBeats;
  $('#cmp-note').innerHTML =
    (cmp.cfg.mode === 'beat'
      ? `图中每个心跳都是"中位心搏"：把一份记录里的各次心跳（本例 ${n} 次、正常对照 ${cmp.refMb.nBeats} 次）按${cmp.cfg.focus === 'P' ? ' P 波' : ' QRS '}起点对齐，逐点取中位数，并以 PR 段为零点。` +
        '这样偶发的干扰被压低，更像"典型的一次心跳"。'
      : '图中是 10 秒原始记录（未取中位数）。') +
    '正常对照只是<b>一个人</b>的正常心电图：正常人之间的波形本来就有差别，年龄、性别、体型都会影响电压，所以重点看<b>差别的方向和大小</b>，而不是两条线是否完全重合。';
}

function renderCompareTable() {
  const { cfg, cur, refEcg } = cmp;
  const m = [algoValues(refEcg.meta, 'measurements'), algoValues(cur.meta, 'measurements')];
  const a = [algoValues(refEcg.meta, 'amplitudes'), algoValues(cur.meta, 'amplitudes')];
  const row = (label, vals, f, unit, diff) =>
    `<tr><th>${label}</th>${vals.map((v, i) => `<td class="num${i && diff ? ' diff' : ''}">${f(v)}</td>`).join('')}<td class="unit">${unit}</td></tr>`;
  const ms = (v) => fmt(v);
  const mv = (v) => fmt2(v);
  const smv = (v) => (v == null ? '—' : signed(v));
  const big = (k, d) => {
    const [x, y] = [m[0][k], m[1][k]];
    return x != null && y != null && Math.abs(y - x) >= d;
  };
  const G = [
    ['心率', 'HR_bpm', '次/分', 15],
    ['PR 间期', 'PR_ms', 'ms', 40],
    ['P 波时限', 'P_ms', 'ms', 20],
    ['QRS 时限', 'QRS_ms', 'ms', 20],
    ['QT 间期', 'QT_ms', 'ms', 40],
    ['额面电轴', 'axis_deg', '°', 45],
  ];
  let html = '<thead><tr><th></th><th class="num">正常对照</th><th class="num">本例</th><th></th></tr></thead><tbody>';
  html += G.map(([zh, k, u, d]) => row(zh, [m[0][k], m[1][k]], ms, u, big(k, d))).join('');
  if (cfg.mode === 'rhythm') {
    const r = [rrRange(refEcg.meta), rrRange(cur.meta)];
    html += row('心跳间隔（最短–最长）', r, (v) => (v[0] == null ? '—' : `${v[0]}–${v[1]}`), 'ms', r[1][1] - r[1][0] > 120);
  } else {
    html += '<tr class="sep"><th colspan="4">各导联振幅（mV）</th></tr>';
    for (const lead of cfg.leads) {
      const v = [a[0][lead] ?? {}, a[1][lead] ?? {}];
      const d = (k, th) => v[0][k] != null && v[1][k] != null && Math.abs(v[1][k] - v[0][k]) >= th;
      html += row(`${lead} R 波`, [v[0].R, v[1].R], mv, 'mV', d('R', 0.5));
      html += row(`${lead} S 波`, [v[0].S, v[1].S], mv, 'mV', d('S', 0.5));
      html += row(`${lead} ST（J 点后 80 ms）`, [v[0].ST80, v[1].ST80], smv, 'mV', d('ST80', 0.1));
    }
  }
  $('#cmp-table').innerHTML = html + '</tbody>';
  $('#cmp-table-note').textContent =
    '数值来自 Glasgow 自动分析算法（PTB-XL+），两份心电图用同一算法测量；加粗表示与正常对照差别较大（仅供阅读时提示，不是诊断标准）。';
}

function renderCaseInfo(meta, entry) {
  $('#case-title').textContent = entry?.title ?? meta.id;
  $('#case-summary').textContent = entry?.summary ?? '';
  const sex = { F: '女', M: '男' }[meta.patient.sex] ?? meta.patient.sex ?? '—';
  $('#case-patient').textContent = `${meta.patient.age ?? '—'} 岁 · ${sex}`;
  $('#case-diag').innerHTML = meta.diagnoses
    .map(
      (d) =>
        `<li>${d.code ? `<code>${esc(d.code)}</code> ` : ''}${esc(scpLabel(d))}<span class="en">${esc(d.description)}</span>` +
        `${d.likelihood ? `<span class="muted">（可信度 ${esc(d.likelihood)}%）</span>` : ''}</li>`,
    )
    .join('');
  $('#case-validated').textContent = meta.validatedByCardiologist
    ? '诊断标签经心内科医生确认（数据库标注）。'
    : '诊断标签未经人工确认。';
  $('#amp-warning').hidden = !meta.amplitudeNormalized;
  $('#wave-source').textContent = meta.annotations?.source ?? '本例没有波形标注';
  const atrial = meta.annotations?.atrial;
  $('#av-legend').hidden = !atrial;
  $('#av-method').textContent = atrial ? `P 波标注方法：${atrial.method}。` : '';

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
  const dvTxt = `${dv >= 0 ? '+' : ''}${dv.toFixed(2)}`;
  // 高度差只在同一导联内有意义；LUDB 等幅度归一化的病例只能给相对幅度
  const height =
    c.a.lead && c.a.lead === c.b.lead
      ? state.ecg?.meta.amplitudeNormalized
        ? ` · 高度差 <b>${dvTxt}</b><span class="muted">（相对幅度：本例幅度已归一化，不是真实 mV）</span>`
        : ` · 高度差 <b>${dvTxt} mV</b>`
      : ' · <span class="muted">两点不在同一导联，不比较高度</span>';
  $('#caliper-text').innerHTML =
    `时间差 <b>${dt.toFixed(0)} ms</b>` +
    // 测验中不替用户换算心率（会直接给出心率题的答案）
    (dt > 200 && !quiz.set ? `（若为 RR 间期，心率 = 60000 ÷ ${dt.toFixed(0)} = <b>${(60000 / dt).toFixed(0)} 次/分</b>）` : '') +
    height;
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
    const p = { t: h.tMs, mV: h.mV, lead: h.cell.lead };
    set({ caliper: { row: h.cell.row, a: p, b: p, march: $('#caliper-march').checked } }, 'overlay');
  } else {
    set({ cursorMs: h.tMs, selectedLead: h.cell.lead }, 'overlay', 'linked');
  }
}
function onPointerMove(ev) {
  const h = pointerHit(ev);
  const out = $('#hover-readout');
  out.textContent = h
    ? `${h.cell.lead} 导联 · ${(h.tMs / 1000).toFixed(3)} s · 光标高度 ${h.mV.toFixed(2)}${
        state.ecg?.meta.amplitudeNormalized ? '（相对幅度）' : ' mV'
      }`
    : '点击波形放置时间光标';
  if (!dragging || !h) return;
  if (state.tool === 'caliper') {
    if (!state.caliper) return; // 拖动中按了 Esc 或切换了病例
    const row = state.caliper.row;
    // 卡尺限制在按下时的那一行；电压按该行基线计算
    const r = state.layout.rows[row];
    const rect = $('#overlay').getBoundingClientRect();
    const yMm = (ev.clientY - rect.top) / state.pxPerMm;
    const lead = h.cell.row === row ? h.cell.lead : null; // 拖到别的行时，终点所在导联按"不同"处理
    set({ caliper: { ...state.caliper, b: { t: h.tMs, mV: (r.baselineMm - yMm) / state.gain, lead } } }, 'overlay');
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
    if (quiz.set) return; // 测验中不播放：会带着光标自己移动
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
    termChapters(id) +
    (refs ? `<details class="refs"><summary>出处</summary><ul>${refs}</ul><p class="muted">出处根据公开文献整理，尚未逐条核对原文。</p></details>` : '')
  );
}

/** "心电图手册中讲到"：从各章的 terms 反查 */
function termChapters(id) {
  const chs = chaptersForTerm(id);
  if (!chs.length) return '';
  const cur = $('#handbook').open ? hb.chapter : null;
  return (
    '<p class="term-hb">心电图手册中讲到：' +
    chs
      .map((c) =>
        c.id === cur
          ? `<span class="muted">${esc(c.title)}（本章）</span>`
          : `<a href="#" data-hb-read="${c.id}">${esc(c.title)}</a>`,
      )
      .join('、') +
    '</p>'
  );
}

/**
 * 术语弹窗。模态对话框（手册、读图入门、术语表）处在浏览器的顶层，页面里的弹窗会被挡住，
 * 所以弹窗挂到链接所在的对话框里，用 fixed 定位。
 */
function openTerm(id, anchor) {
  const pop = $('#term-pop');
  const host = anchor.closest('dialog') ?? document.body;
  if (pop.parentElement !== host) host.append(pop);
  pop.classList.toggle('in-dlg', host !== document.body);
  pop.innerHTML = termHtml(id) + '<button class="pop-close" aria-label="关闭">×</button>';
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(380, window.innerWidth - 32);
  pop.style.width = `${w}px`;
  const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left));
  if (host === document.body) {
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  } else {
    // 对话框里：放在链接下方，放不下就放到上方
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom + 6}px`;
    const h = pop.offsetHeight;
    if (r.bottom + 6 + h > window.innerHeight - 8) pop.style.top = `${Math.max(8, r.top - 6 - h)}px`;
  }
  pop.querySelector('.pop-close').onclick = () => (pop.hidden = true);
}

/** 打开读图入门，滚动到指定小节，并高亮当前选中的导联 */
/** fromChapter：从心电图手册某章打开时，窗口顶部显示"回到手册" */
function openPrimer(section, fromChapter = null) {
  hb.primerFrom = fromChapter;
  $('#primer-back').hidden = !fromChapter;
  const body = $('#primer-body');
  buildPrimer(body, state.level); // 每次按当前讲解深度重建
  $('#primer').showModal();
  primerSelect(body, state.selectedLead, state.level);
  const target = body.querySelector(`#pr-sec-${section}`);
  if (target) target.scrollIntoView({ block: 'start' });
}

/** 打开心脏结构图（fig = ext / int / cond）；fromChapter 同读图入门 */
function openAnatomy(fig, fromChapter = null) {
  if (!HEART_FIGS[fig]) fig = 'ext';
  hb.anatomyFrom = fromChapter;
  $('#anatomy-back').hidden = !fromChapter;
  buildAnatomy($('#anatomy-body'), fig, (key) => {
    // 切图时网址跟着变，刷新或复制链接都回到当前这幅
    const u = new URL(location.href);
    u.searchParams.set('heart', key);
    history.replaceState(null, '', u);
  });
  $('#anatomy').showModal();
  $('#anatomy-body').scrollTop = 0;
}

function openGlossary() {
  const d = $('#glossary');
  $('#gl-q').value = '';
  renderGlossary('');
  d.showModal();
  $('#gl-q').focus();
}

function renderGlossary(query) {
  const total = Object.keys(TERMS).length;
  const ids = searchTerms(TERMS, query);
  const body = $('#glossary-body');
  body.innerHTML = ids.length
    ? ids.map((id) => `<section class="gl-item">${termHtml(id, true)}</section>`).join('')
    : `<p class="gl-empty muted">没有找到包含"${esc(query.trim())}"的术语。可以换个说法，或试试英文、缩写。</p>`;
  $('#gl-count').textContent = tokens(query).length ? `找到 ${ids.length} 条（共 ${total} 条）` : `共 ${total} 条`;
  highlight(body, tokens(query));
  body.scrollTop = 0;
}

/** 在已渲染的文字里给关键字加底色（只处理文字节点，不碰标签） */
function highlight(root, ks) {
  if (!ks.length) return;
  const re = new RegExp(ks.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const text = n.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(re)) {
      frag.append(text.slice(last, m.index));
      const mark = document.createElement('mark');
      mark.textContent = m[0];
      frag.append(mark);
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    n.replaceWith(frag);
  }
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
/** 病例已加载并且各面板都渲染成功（渲染中途出错时 caseId 已是新病例，但不算就绪） */
const caseReady = (id) => state.caseId === id && !state.caseBroken;

/**
 * @param retry 失败时波形区"重试"按钮要做的事：导览、测验、演示传入各自的步骤级重试，
 *   免得只重载病例而上层流程停在失败状态
 */
async function selectCase(id, retry = () => selectCase(id)) {
  const token = ++loadToken;
  stopPlay();
  $('#paper-msg').hidden = false;
  $('#paper-msg').textContent = '正在加载病例…';
  try {
    const ecg = await loadCase(id);
    if (token !== loadToken) return null; // 被更新的加载取代（不是失败）
    const beats = ecg.meta.annotations?.beats ?? [];
    const first = beats[Math.min(2, beats.length - 1)];
    state.caseBroken = true; // 下面全部完成才清除
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
    renderCaseInfo(ecg.meta, state.index.cases.find((c) => c.id === id));
    renderMeasurements(ecg.meta);
    renderLVH(ecg.meta);
    renderST(ecg.meta);
    renderCompare(ecg);
    state.caseBroken = false;
    document.body.classList.remove('case-stale');
    $('#paper-msg').hidden = true; // 各面板都更新完再收起提示；中途出错时提示和重试按钮仍可见
    // 测验中下拉框只显示"测验中"：病例标题会泄露诊断题的答案
    $('#case-select').value = quiz.set ? QUIZ_OPT : id;
    // 测验中地址栏不写病例编号（编号可以查到诊断）
    if (!quiz.set) {
      const u = new URL(location.href);
      u.searchParams.set('case', id);
      history.replaceState(null, '', u);
    }
    return true;
  } catch (e) {
    if (token !== loadToken) return null;
    console.error(e);
    $('#paper-msg').hidden = false;
    $('#paper-msg').innerHTML = `病例加载失败：${esc(e.message)} <button id="retry">重试</button>`;
    if (state.caseBroken) {
      // 波形已换成新病例，但右侧面板可能还是上一个病例的：先藏起来，免得把旧数值当成新病例的
      document.body.classList.add('case-stale');
      if (!quiz.set) {
        const u = new URL(location.href);
        u.searchParams.set('case', state.caseId);
        history.replaceState(null, '', u);
      }
    }
    // 下拉框退回到仍在显示的病例，免得和波形对不上
    if (!quiz.set && state.caseId) $('#case-select').value = state.caseId;
    $('#retry').onclick = () => retry();
    return false;
  }
}

/** 作废正在进行的病例加载（例如加载中途退出导览），并收起"正在加载"提示 */
function cancelPendingLoad() {
  loadToken++;
  if (state.ecg) $('#paper-msg').hidden = true;
  // 下拉框可能已经选了那个被作废的病例：退回到正在显示的病例
  if (!quiz.set && state.caseId) $('#case-select').value = state.caseId;
}

// ================================================================ 导览（步骤为数据，播放器统一执行）

const tour = { def: null, index: -1, saved: null, token: 0 };

/** 界面控件与 state 同步（导览会改设置） */
function syncControls() {
  $('#show-waves').checked = state.showWaves;
  $('#show-ref').checked = state.showRef;
  $('#speed').value = String(state.speed);
  document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === state.tool));
  $('#overlay').classList.toggle('caliper', state.tool === 'caliper');
  $('#caliper-march').checked = !!state.caliper?.march;
}

function setMtab(name) {
  document.querySelectorAll('[data-mtab]').forEach((x) => x.classList.toggle('on', x.dataset.mtab === name));
  document.querySelectorAll('[data-mpane]').forEach((p) => (p.hidden = p.dataset.mpane !== name));
}
const currentMtab = () => document.querySelector('[data-mtab].on')?.dataset.mtab ?? 'intervals';

/**
 * 聚光灯：sel 为一个或几个面板（CSS 选择器）。这些面板保持原样，其余面板调暗作为背景
 * （仍可点击，鼠标经过时保持调暗）。sel 为空则不调暗任何面板。
 */
function setFocus(sel) {
  document.querySelectorAll('.tour-focus').forEach((e) => e.classList.remove('tour-focus'));
  const els = (Array.isArray(sel) ? sel : sel ? [sel] : []).map((x) => document.querySelector(x)).filter(Boolean);
  for (const el of els) el.classList.add('tour-focus');
  document.body.classList.toggle('tour-dim', els.length > 0);
  els[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openTourMenu() {
  $('#tour-list').innerHTML = TOURS.map(
    (t) =>
      `<section class="tour-item"><h4>${esc(t.title)}</h4><p class="muted small">${esc(t.audience)} · ${t.steps.length} 步</p>` +
      `<button class="primary" data-start-tour="${t.id}">开始</button></section>`,
  ).join('');
  $('#tour-menu').showModal();
}

function startTour(id) {
  $('#hb-demo').hidden = true;
  hb.demoToken++;
  const def = TOURS.find((t) => t.id === id);
  if (!def) {
    toast(`找不到导览 "${id}"`);
    const u = new URL(location.href);
    u.searchParams.delete('tour');
    history.replaceState(null, '', u);
    return;
  }
  if (!tour.saved && quiz.saved) {
    // 测验刚退出、还在恢复中：沿用测验保存的用户设置，不把测验锁定的设置当成用户设置
    tour.saved = quiz.saved;
    quiz.saved = null;
  }
  if (!tour.saved) {
    // 进入导览时保存用户设置，退出时恢复（迁移经验：进入某种模式保存，退出还原）。
    // 上一次退出还在恢复中时 saved 尚未清空，沿用它，不把导览改过的设置当成用户设置
    tour.saved = {
      caseId: state.caseId,
      showWaves: state.showWaves,
      showRef: state.showRef,
      speed: state.speed,
      cursorMs: state.cursorMs,
      selectedLead: state.selectedLead,
      caliper: state.caliper,
      tool: state.tool,
      mtab: currentMtab(),
    };
  }
  tour.def = def;
  $('#tour-panel').hidden = false;
  document.body.classList.add('touring');
  $('#tour-title').textContent = def.title;
  const u = new URL(location.href);
  u.searchParams.set('tour', id);
  history.replaceState(null, '', u);
  goStep(0);
}

/** 第 i 步的有效设置：病例、导联沿用此前最近一步，view 从第 0 步累积合并（往回翻也一致） */
function effectiveStep(def, i) {
  const eff = { view: {} };
  for (let k = 0; k <= i; k++) {
    const st = def.steps[k];
    if (st.case) eff.case = st.case;
    if (st.lead) eff.lead = st.lead;
    Object.assign(eff.view, st.view ?? {});
  }
  return { ...def.steps[i], case: eff.case, lead: eff.lead, view: eff.view };
}

async function goStep(i) {
  const def = tour.def;
  if (!def || i < 0 || i >= def.steps.length) return;
  const token = ++tour.token; // 只有最新一次请求可以改界面
  stopPlay();
  const step = effectiveStep(def, i);
  $('#tour-step-title').textContent = step.title;
  $('#tour-count').textContent = `${i + 1} / ${def.steps.length}`;
  if (step.case && !caseReady(step.case)) {
    $('#tour-body').innerHTML = '<p class="muted">正在加载病例…</p>';
    // 加载期间禁用翻页，避免按旧的 tour.index 计算下一步
    $('#tour-prev').disabled = true;
    $('#tour-next').disabled = true;
    const ok = await selectCase(step.case, () => goStep(i));
    if (token !== tour.token) return; // 用户已翻到别的步骤或退出
    $('#tour-next').disabled = false;
    $('#tour-prev').disabled = tour.index <= 0;
    if (ok === null) return; // 被别的加载取代，不算失败
    if (!ok) {
      // 失败时停在原来的步骤，并提供重试
      $('#tour-body').innerHTML = '<p class="lvh-alert">病例加载失败。<button id="tour-retry">重试</button></p>';
      $('#tour-retry').onclick = () => goStep(i);
      return;
    }
  } else {
    // 沿用当前病例时，作废还在路上的旧请求（如刚在下拉框里选了别的病例），免得它晚到后换掉导览正在讲的病例
    cancelPendingLoad();
  }
  tour.index = i;
  const beats = state.ecg.meta.annotations?.beats ?? [];
  const v = step.view;
  const patch = {
    showWaves: v.showWaves ?? state.showWaves,
    showRef: v.showRef ?? state.showRef,
    speed: v.speed ?? state.speed,
    selectedLead: step.lead ?? state.selectedLead,
    cursorMs: 'cursor' in step ? cursorAt(state.ecg.meta, step.cursor) : state.cursorMs,
    caliper: null,
    tool: 'cursor',
    spot: spotOf(step.spot, beats, state.ecg.durationMs),
  };
  if (step.caliper && beats[step.caliper.to]) {
    const ta = beats[step.caliper.from].QRS.peak;
    const tb = beats[step.caliper.to].QRS.peak;
    patch.caliper = { row: 3, a: { t: ta, mV: 0, lead: 'II' }, b: { t: tb, mV: 0, lead: 'II' }, march: !!step.caliper.march }; // 第 4 行是 II 导联节律条
    patch.tool = 'caliper';
  }
  set(patch, 'paper', 'linked');
  syncControls();
  if (v.mtab) setMtab(v.mtab);
  renderTourText(step, i);
  setFocus(step.focus);
  if (step.play) startPlay();
}

function renderTourText(step, i) {
  if (step.case && step.case !== state.caseId) return; // 数据与讲解不属于同一病例时不填写
  const meta = state.ecg.meta;
  const own = meta.amplitudes?.find((a) => a.id === 'area');
  const lvhBy = Object.fromEntries((meta.amplitudes ?? []).map((a) => [a.id, evaluateLVH(a.values, meta.patient.sex)]));
  const ctx = { meta, lvh: own ? lvhBy.area : null, lvhBy };
  const fill = (t) => (t ? fillTemplate(t, ctx) : '');
  $('#tour-body').innerHTML =
    `<p>${fill(step.plain)}</p>` +
    (step.pro
      ? state.level === 'pro' || tour.def.proOpen
        ? `<p class="pro">${fill(step.pro)}</p>`
        : `<details class="pro-more"><summary>专业说明</summary><p class="pro">${fill(step.pro)}</p></details>`
      : '');
  const ch = step.read && chapterById(step.read);
  if (ch) $('#tour-body').insertAdjacentHTML('beforeend', `<p class="small"><a href="#" data-hb-read="${ch.id}">心电图手册：${esc(ch.title)} →</a></p>`);
  const last = i === tour.def.steps.length - 1;
  $('#tour-prev').disabled = i === 0;
  $('#tour-next').hidden = last;
  const nt = $('#tour-next-tour');
  nt.hidden = !(last && step.next);
  if (step.next) {
    nt.textContent = step.next.label;
    nt.onclick = () => startTour(step.next.tour);
  }
  if (last && !step.next) {
    $('#tour-next').hidden = false;
    $('#tour-next').textContent = '完成';
  } else {
    $('#tour-next').textContent = '下一步 →';
  }
}

async function exitTour({ keepCase = false } = {}) {
  if (!tour.def) return;
  tour.token++;
  cancelPendingLoad(); // 导览步骤的病例还在加载时退出，不能让它晚到后覆盖恢复的设置
  stopPlay();
  const saved = tour.saved;
  tour.def = null;
  tour.index = -1;
  $('#tour-panel').hidden = true;
  document.body.classList.remove('touring');
  setFocus(null);
  set({ spot: null }, 'overlay');
  const u = new URL(location.href);
  u.searchParams.delete('tour');
  history.replaceState(null, '', u);
  if (!saved) return;
  const { mtab, caseId, cursorMs, selectedLead, caliper, ...view } = saved;
  let caseRestored = false;
  if (!keepCase && caseId && caseId !== state.caseId) {
    const ok = await selectCase(caseId);
    // 恢复期间又开始了新导览或测验：以最新操作为准（saved 已交给它）
    if (tour.def || quiz.set) return;
    caseRestored = ok === true;
  } else if (!keepCase) {
    caseRestored = true;
  }
  tour.saved = null;
  // 病例恢复成功才恢复光标等与病例相关的设置；显示设置总是恢复
  set(caseRestored ? { ...view, cursorMs, selectedLead, caliper } : view, 'paper', 'linked');
  syncControls();
  setMtab(mtab);
}


// ================================================================ 心电图手册

const hb = { chapter: null, demoToken: 0, demoLoading: false, demoFailed: false, primerFrom: null, anatomyFrom: null };

const HEART_LINK = { ext: '看图认识心脏外观和冠状动脉', int: '看图认识心脏的四个腔室和心壁', cond: '看图认识心脏的传导系统' };

function openHandbook(id) {
  const ch = chapterById(id) ?? chapterById(hb.chapter) ?? HANDBOOK[0].chapters[0];
  hb.chapter = ch.id;
  $('#hb-nav').innerHTML =
    '<p class="hb-nav-primer"><a href="#" data-heart="ext">先认识心脏：腔室、血管、传导系统<span class="muted small">心脏结构</span></a></p>' +
    '<p class="hb-nav-primer"><a href="#" data-primer="intro">图解：12 导联是怎么来的<span class="muted small">读图入门</span></a></p>' +
    HANDBOOK.map(
    (part) =>
      `<section><h4>${esc(part.title)}<span class="muted small">${esc(part.sub)}</span></h4><ol>` +
      part.chapters
        .map((c) => `<li><a href="#" data-hb="${c.id}" class="${c.id === ch.id ? 'on' : ''}">${esc(c.title)}</a></li>`)
        .join('') +
      '</ol></section>',
  ).join('');
  const refs = (ch.refs ?? [])
    .map((r) => REFS[r])
    .filter(Boolean)
    .map((r) => `<li>${esc(r.text)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</li>`)
    .join('');
  const tours = (ch.tours ?? []).map((tid) => TOURS.find((t) => t.id === tid)).filter(Boolean);
  const label = (id) => state.index?.cases.find((c) => c.id === id)?.title ?? id;
  $('#hb-body').innerHTML =
    `<h2>${esc(ch.title)} <span class="en">${esc(ch.en)}</span></h2>` +
    `<div class="hb-text">${ch.body}</div>` +
    (ch.terms?.length
      ? `<p class="hb-terms">本章术语：${ch.terms
          .filter((t) => TERMS[t])
          .map((t) => `<a href="#" data-term="${t}">${esc(TERMS[t].zh)}</a>`)
          .join('')}</p>`
      : '') +
    (ch.widget ? `<section class="hb-widget"><h3>动手试一试</h3><div id="hb-widget"></div></section>` : '') +
    `<section class="hb-demos"><h3>在图上演示</h3><ul>` +
    ch.demos
      .map(
        (d, i) =>
          `<li><button class="hb-demo-btn" data-demo="${i}">▶ ${esc(d.label)}</button>` +
          `<span class="muted small">${esc(label(d.case))}</span></li>`,
      )
      .join('') +
    '</ul>' +
    (ch.heart ? `<p><a href="#" data-heart="${ch.heart}">${HEART_LINK[ch.heart]}：心脏结构图 →</a></p>` : '') +
    (ch.primer ? `<p><a href="#" data-primer="${ch.primer}">看图了解 12 个导联：读图入门 →</a></p>` : '') +
    (tours.length
      ? `<p class="hb-tours">相关导览：${tours.map((t) => `<button data-hb-tour="${t.id}">${esc(t.title)} →</button>`).join(' ')}</p>`
      : '') +
    '</section>' +
    (refs ? `<details class="refs"><summary>出处</summary><ul>${refs}</ul><p class="muted">出处根据公开文献整理，尚未逐条核对原文。</p></details>` : '') +
    '<p class="muted small hb-disclaimer">本手册未经心血管专科医生审定，仅供学习，不能用于诊断。</p>';
  linkTerms($('#hb-body .hb-text'), ch.terms ?? [], (t) => termRegex(termNames(t)));
  $('#term-pop').hidden = true;
  if (ch.widget === 'axis') axisWidget($('#hb-widget'), 60);
  if (ch.widget === 'mi') miWidget($('#hb-widget'), MI_TERRITORIES, MI_GRID, MI_EXTRA);
  if (ch.widget === 'qtc') {
    // 用当前病例预填（有 QT 和心率时）
    const m = state.ecg?.meta;
    const v = m?.measurements.find((x) => x.id === 'unig' && x.values.QT_ms && x.values.HR_bpm)?.values;
    const title = state.index?.cases.find((c) => c.id === state.caseId)?.title;
    qtcWidget($('#hb-widget'), v ? { hr: v.HR_bpm, qt: v.QT_ms, sex: m.patient.sex, label: `当前病例（${title}）` } : null);
  }
  const d = $('#handbook');
  if (!d.open) d.showModal();
  $('#hb-body').scrollTop = 0;
  const u = new URL(location.href);
  u.searchParams.set('read', ch.id);
  history.replaceState(null, '', u);
}

// ================================================================ 降压药手册

const dg = { chapter: null };

/** id：章节 id、'search'，或 'drug:<药物 id>'（打开该药所在类别的章节并滚动到卡片） */
function openDrugbook(id) {
  let target = id ?? dg.chapter ?? 'd-why';
  let card = null;
  if (target.startsWith('drug:')) {
    const d = drugById(target.slice(5));
    card = d?.id ?? null;
    target = (d && DRUG_CLASSES.find((c) => c.id === d.cls)?.chapter) ?? 'search';
  }
  const body = $('#dg-body');
  let ch = renderDrugChapter(body, target);
  if (!ch) ch = renderDrugChapter(body, (target = 'd-why'));
  dg.chapter = target;
  renderDrugNav($('#dg-nav'), target);
  if (target === 'search') {
    const q = $('#dg-q');
    renderDrugSearch(body, '');
    let composing = false;
    q.addEventListener('compositionstart', () => (composing = true));
    q.addEventListener('compositionend', () => {
      composing = false;
      renderDrugSearch(body, q.value);
    });
    q.addEventListener('input', () => !composing && renderDrugSearch(body, q.value));
  } else {
    linkTerms(body.querySelector('.hb-text'), ch.terms ?? [], (t) => termRegex(termNames(t)));
    addPinyinAll(body);
  }
  $('#term-pop').hidden = true;
  const d = $('#drugbook');
  if (!d.open) d.showModal();
  body.scrollTop = 0;
  if (card) {
    const el = body.querySelector(`#drug-${card}`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.classList.add('flash');
    }
  }
  if (target === 'search') $('#dg-q').focus();
  const u = new URL(location.href);
  u.searchParams.set('drug', card ? `drug:${card}` : target);
  history.replaceState(null, '', u);
}

/** 关闭对话框，并去掉网址里对应的直达参数（Esc 关闭时由 close 事件处理） */
const DLG_PARAM = { handbook: 'read', drugbook: 'drug', anatomy: 'heart' };
function closeDlg(id) {
  const d = $(`#${id}`);
  if (d.open) d.close();
  if (DLG_PARAM[id]) {
    const u = new URL(location.href);
    u.searchParams.delete(DLG_PARAM[id]);
    history.replaceState(null, '', u);
  }
}

function closeHandbook() {
  closeDlg('handbook');
}

/** 关掉演示提示条，并作废演示还没完成的加载和定位（否则迟到的请求还会换病例、改视图） */
function stopDemo() {
  $('#hb-demo').hidden = true;
  hb.demoToken++;
  if (hb.demoLoading) cancelPendingLoad();
  hb.demoLoading = false;
  // 演示加载失败后关掉演示：波形区属于这个演示的错误和重试也一并收起。
  // 若新病例已画上但面板渲染失败，仍要留着提示，重试改为只重新加载病例、不再打开演示。
  if (hb.demoFailed) {
    hb.demoFailed = false;
    if (state.caseBroken) $('#retry').onclick = () => selectCase(state.caseId);
    else if (state.ecg) $('#paper-msg').hidden = true;
  }
}

/** "在图上演示"：关闭手册，加载病例并定位；顶部提示条说明看什么 */
async function runDemo(chId, i) {
  const ch = chapterById(chId);
  const demo = ch?.demos[i];
  if (!demo) return;
  const token = ++hb.demoToken;
  hb.demoLoading = false;
  hb.demoFailed = false;
  closeHandbook();
  if (tour.def) await exitTour({ keepCase: true });
  if (token !== hb.demoToken) return;
  $('#hb-demo-label').textContent = demo.label;
  $('#hb-demo-note').textContent = '正在加载病例…';
  $('#hb-demo').hidden = false;
  if (!caseReady(demo.case)) {
    hb.demoLoading = true;
    const ok = await selectCase(demo.case, () => runDemo(chId, i));
    if (token !== hb.demoToken) return;
    hb.demoLoading = false;
    if (!ok) {
      $('#hb-demo-note').textContent = '病例加载失败，请回到手册重试。';
      hb.demoFailed = true;
      return;
    }
  } else {
    cancelPendingLoad(); // 演示沿用当前病例：作废之前还没完成的病例请求，免得它晚到后换掉演示的病例
  }
  const v = demo.view ?? {};
  set(
    {
      showWaves: v.showWaves ?? true,
      showRef: v.showRef ?? false,
      selectedLead: demo.lead ?? state.selectedLead,
      cursorMs: demo.cursor ? cursorAt(state.ecg.meta, demo.cursor) : state.cursorMs,
      caliper: null,
      tool: 'cursor',
    },
    'paper',
    'linked',
  );
  syncControls();
  setMtab(v.mtab ?? 'intervals');
  $('#hb-demo-note').textContent = demo.note;
  const target = document.querySelector(demo.scroll ?? '.paper-wrap');
  (target && !target.hidden ? target : $('.paper-wrap')).scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ================================================================ 测验（题目为数据，判分按物理单位）

const QUIZ_OPT = '__quiz'; // 测验中下拉框显示的占位选项
const quiz = { set: null, index: -1, results: [], saved: null, token: 0, pickedOpt: null, done: false, ready: false, opts: null, vector: null };
const WAVE_ZH = { P: 'P 波', QRS: 'QRS 波群', T: 'T 波' };
const EDGE_ZH = { on: '起点', off: '终点' };
const fmtS = (ms) => `${(ms / 1000).toFixed(3)} s`;
/** 角度：负号用真正的减号（−），与全站一致 */
const fmtDeg = (d) => `${d < 0 ? '−' : ''}${Math.abs(Math.round(d))}°`;

function openQuizMenu() {
  $('#quiz-list').innerHTML = QUIZ_SETS.map(
    (q) =>
      `<section class="tour-item"><h4>${esc(q.title)}</h4><p class="muted small">${esc(q.audience)} · ${q.questions.length} 道题</p>` +
      `<p class="small">${q.intro}</p><button class="primary" data-start-quiz="${q.id}">开始</button></section>`,
  ).join('');
  $('#quiz-menu').showModal();
}

async function startQuiz(id) {
  const qset = QUIZ_SETS.find((q) => q.id === id);
  if (!qset) {
    toast(`找不到测验 "${id}"`);
    const u = new URL(location.href);
    u.searchParams.delete('quiz');
    history.replaceState(null, '', u);
    return;
  }
  if (tour.def) await exitTour({ keepCase: true });
  if (!quiz.saved && tour.saved) {
    // 导览刚退出、还在恢复中：沿用导览保存的用户设置
    quiz.saved = tour.saved;
    tour.saved = null;
  }
  if (!quiz.saved) {
    quiz.saved = {
      caseId: state.caseId,
      showWaves: state.showWaves,
      showRef: state.showRef,
      speed: state.speed,
      gain: state.gain,
      cursorMs: state.cursorMs,
      selectedLead: state.selectedLead,
      caliper: state.caliper,
      tool: state.tool,
    };
  }
  quiz.set = qset;
  quiz.results = [];
  document.body.classList.add('quizzing');
  $('#quiz-panel').hidden = false;
  $('#qz-title').textContent = qset.title;
  $('#case-select').disabled = true;
  $('#case-select').value = QUIZ_OPT;
  $('#tour-btn').disabled = true;
  $('#hb-btn').disabled = true; // 手册演示会换病例、打开着色
  $('#hb-demo').hidden = true;
  stopPlay();
  // 作答锁定：关掉波段着色与参照基线（它们会直接标出 P / QRS / T 的位置）
  set({ showWaves: false, showRef: false }, 'paper', 'overlay');
  syncControls();
  const u = new URL(location.href);
  u.searchParams.set('quiz', id);
  u.searchParams.delete('case'); // 病例编号可以查到诊断
  history.replaceState(null, '', u);
  goQuestion(0);
}
/** LUDB 只标注了中间一段：其余部分盖灰色，提示不在这里作答 */
function unannotatedMask(meta) {
  const r = meta.annotations?.annotatedRangeMs;
  if (!r || !meta.measurements?.some((m) => m.kind === 'manual')) return [];
  return [
    { t0: 0, t1: r[0] },
    { t0: r[1], t1: meta.durationMs },
  ];
}

async function goQuestion(i) {
  const q = quiz.set.questions[i];
  const token = ++quiz.token;
  quiz.index = i;
  quiz.pickedOpt = null;
  quiz.done = false;
  quiz.ready = false; // 病例加载、题面准备好之前不接受作答（否则会按上一题的病例判分）
  stopPlay();
  set({ quizMark: null, cursorMs: null, caliper: null }, 'overlay');
  $('#qz-count').textContent = `第 ${i + 1} / ${quiz.set.questions.length} 题`;
  renderQuizScore();
  $('#qz-prompt').innerHTML = '正在加载…';
  $('#qz-answer').innerHTML = '';
  $('#qz-feedback').hidden = true;
  $('#qz-fig').hidden = true;
  $('#qz-hint').hidden = true;
  $('#qz-submit').hidden = false;
  $('#qz-submit').disabled = true;
  $('#qz-next').hidden = true;
  if (!caseReady(q.case)) {
    const ok = await selectCase(q.case, () => goQuestion(i));
    if (token !== quiz.token || !quiz.set) return;
    if (!ok) {
      $('#qz-prompt').innerHTML = '病例加载失败。<button id="qz-retry">重试</button>　也可以跳过这一题。';
      $('#qz-retry').onclick = () => goQuestion(i);
      $('#qz-next').hidden = false;
      return;
    }
  } else {
    cancelPendingLoad(); // 同上：这道题沿用当前病例
  }
  const timed = ['locate', 'edge'].includes(q.type);
  set(
    {
      cursorMs: null,
      caliper: null,
      tool: timed ? 'cursor' : state.tool,
      selectedLead: q.lead ?? 'II',
      quizMark: timed || q.type === 'interval' ? { mask: unannotatedMask(state.ecg.meta) } : null,
    },
    'overlay',
  );
  syncControls();
  $('#qz-prompt').innerHTML = q.prompt;
  if (q.hint) {
    $('#qz-hint').hidden = false;
    $('#qz-hint').open = false;
    $('#qz-hint div').innerHTML = q.hint;
  }
  renderQuizAnswer(q);
  quiz.ready = true;
  renderQuizPick();
}

function renderQuizScore() {
  const n = quiz.results.filter(Boolean).length;
  const right = quiz.results.filter((r) => r?.ok).length;
  $('#qz-score').textContent = n ? `答对 ${right} / ${n}` : '';
}

function renderQuizAnswer(q) {
  const box = $('#qz-answer');
  if (q.type === 'choice' || q.type === 'vector') {
    let opts;
    if (q.type === 'vector') {
      const r = vectorTruth(state.ecg, q.at);
      quiz.vector = r;
      if (!r) {
        box.textContent = '这道题的数据无法计算，请跳过。';
        $('#qz-next').hidden = false;
        $('#qz-submit').hidden = true;
        return;
      }
      $('#qz-fig').hidden = false;
      $('#qz-fig').innerHTML = vectorFigure(r.deg);
      opts = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'].map((l) => ({ text: l, correct: l === r.lead }));
    } else {
      // 打乱选项顺序（Fisher–Yates，正确答案不总在第一个）
      opts = [...q.options];
      for (let k = opts.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [opts[k], opts[j]] = [opts[j], opts[k]];
      }
    }
    quiz.opts = opts;
    box.innerHTML = opts.map((o, k) => `<button class="qz-opt" data-opt="${k}">${o.text}</button>`).join('');
  } else if (['interval', 'rate', 'axis'].includes(q.type)) {
    const unit = q.type === 'rate' ? '次/分' : q.type === 'axis' ? '°' : 'ms';
    const range = q.type === 'axis' ? 'min="-180" max="180"' : 'min="0" max="1000"';
    box.innerHTML = `<input type="number" id="qz-num" ${range} step="1" inputmode="numeric" /> <span>${unit}</span>`;
    $('#qz-num').addEventListener('input', () => ($('#qz-submit').disabled = $('#qz-num').value === ''));
    $('#qz-num').addEventListener('keydown', (e) => e.key === 'Enter' && !$('#qz-submit').disabled && submitQuiz());
  } else {
    box.innerHTML = '';
  }
}

/** 定位题：显示当前选中的位置（光标），未选时不能提交 */
function renderQuizPick() {
  const q = quiz.set?.questions[quiz.index];
  if (!q || !quiz.ready) return;
  if (quiz.done || !['locate', 'edge'].includes(q.type)) {
    if (q && !quiz.done && !['locate', 'edge'].includes(q.type)) $('#qz-status').textContent = '';
    return;
  }
  const t = state.cursorMs;
  if (t == null) {
    $('#qz-status').textContent =
      '在图上点一下放置紫色光标，可用 ←/→ 键微调；放好后按"提交"。' +
      (state.quizMark?.mask?.length ? '记录开头和结尾的灰色区域没有人工标注，请在中间部分作答。' : '');
    $('#qz-submit').disabled = true;
    return;
  }
  const wrongLead = state.selectedLead !== q.lead;
  const outside = !inAnnotatedRange(state.ecg.meta, t);
  const range = state.ecg.meta.annotations?.annotatedRangeMs ?? [0, 0];
  $('#qz-status').innerHTML =
    `已选：<b>${state.selectedLead}</b> 导联 ${fmtS(t)}` +
    (wrongLead ? `　<span class="warn-text">题目问的是 ${q.lead} 导联，请在 ${q.lead} 导联上点。</span>` : '') +
    (outside
      ? `　<span class="warn-text">这里在灰色区域内：医生只标注了 ${fmtS(range[0])} 到 ${fmtS(range[1])} 之间的部分，灰色区域无法判分。请换一个灰色区域以外的波。</span>`
      : '');
  $('#qz-submit').disabled = wrongLead || outside;
}

function submitQuiz() {
  const q = quiz.set?.questions[quiz.index];
  if (!q || quiz.done || !quiz.ready || !caseReady(q.case)) return;
  const meta = state.ecg.meta;
  if (['locate', 'edge'].includes(q.type)) {
    // 再检查一遍（按钮状态只是界面提示）
    if (state.cursorMs == null || state.selectedLead !== q.lead || !inAnnotatedRange(meta, state.cursorMs)) return;
  }
  let ok = false;
  let detail = '';
  let mark = null;
  const num = () => Number($('#qz-num')?.value);
  switch (q.type) {
    case 'choice':
    case 'vector': {
      const k = quiz.pickedOpt;
      if (k == null || !quiz.opts?.[k]) return;
      ok = !!quiz.opts[k].correct;
      document.querySelectorAll('.qz-opt').forEach((b, j) => {
        b.disabled = true;
        if (quiz.opts[j].correct) b.classList.add('right');
        else if (j === k) b.classList.add('wrong');
      });
      if (q.type === 'vector') {
        const r = quiz.vector;
        $('#qz-fig').innerHTML = vectorFigure(r.deg, { reveal: r.lead });
        detail = `这个向量指向约 ${fmtDeg(r.deg)}，最接近 <b>${r.lead}</b>（${fmtDeg(r.ranked[0].axisDeg)}），相差 ${Math.round(r.ranked[0].off)}°。`;
      }
      break;
    }
    case 'locate': {
      const r = gradeLocate(meta, q.lead, q.wave, state.cursorMs);
      if (!r) return;
      ok = r.ok;
      detail = ok
        ? `你点在 ${fmtS(state.cursorMs)}，落在一个 ${WAVE_ZH[q.wave]}上。`
        : `你点在 ${fmtS(state.cursorMs)}，离最近的 ${WAVE_ZH[q.wave]}还有 ${Math.round(r.distMs)} ms。`;
      detail += `图上绿色底色是医生标注的 ${q.lead} 导联全部 ${WAVE_ZH[q.wave]}。`;
      mark = { spans: wavesOf(meta, q.lead, q.wave) };
      break;
    }
    case 'edge': {
      const r = gradeEdge(meta, q.lead, q.wave, q.edge, state.cursorMs);
      if (!r) return;
      ok = r.ok;
      const e = Math.round(r.errMs);
      detail =
        `医生标注的${EDGE_ZH[q.edge]}在 ${fmtS(r.truth)}，你点在 ${fmtS(state.cursorMs)}，` +
        `${e === 0 ? '完全一致' : `${e > 0 ? '晚了' : '早了'} ${Math.abs(e)} ms`}（容差 ±${r.tolMs} ms）。图上绿色竖线是全部标注的${EDGE_ZH[q.edge]}。`;
      mark = { points: wavesOf(meta, q.lead, q.wave).map((w) => w[q.edge]) };
      break;
    }
    case 'interval': {
      const v = num();
      const truth = intervalTruth(meta, q.lead, q.kind);
      const tol = q.kind === 'QT' ? TOL.qtMs : TOL.intervalMs;
      const r = truth && gradeNumber(v, truth.median, tol);
      if (!r) return;
      ok = r.ok;
      detail =
        `医生在 ${q.lead} 导联逐拍标注，${truth.n} 个心搏的 ${q.kind} 中位数为 <b>${Math.round(truth.median)} ms</b>` +
        `（各拍 ${Math.round(truth.min)}–${Math.round(truth.max)} ms）。你的答案 ${v} ms，相差 ${Math.abs(Math.round(r.err))} ms（容差 ±${tol} ms）。` +
        '图上绿色竖线标出了每个心搏的起点和终点。';
      const P = wavesOf(meta, q.lead, 'P');
      const Q = wavesOf(meta, q.lead, 'QRS');
      const T = wavesOf(meta, q.lead, 'T');
      const pts =
        q.kind === 'PR'
          ? [...P.map((w) => w.on), ...Q.map((w) => w.on)]
          : q.kind === 'QRS'
            ? Q.flatMap((w) => [w.on, w.off])
            : [...Q.map((w) => w.on), ...T.map((w) => w.off)];
      mark = { points: pts };
      break;
    }
    case 'rate': {
      const v = num();
      const truth = rateTruth(meta);
      const r = truth && gradeNumber(v, truth.bpm, TOL.hrBpm);
      if (!r) return;
      ok = r.ok;
      detail = `本例心率约 <b>${Math.round(truth.bpm)} 次/分</b>（${truth.source}）。你的答案 ${v} 次/分（容差 ±${TOL.hrBpm}）。`;
      break;
    }
    case 'axis': {
      const v = num();
      const truth = axisTruth(meta);
      const r = truth && gradeAxis(v, truth.deg);
      if (!r) return;
      ok = r.ok;
      detail =
        `本例电轴约 <b>${fmtDeg(truth.deg)}</b>（Glasgow 算法 ${fmtDeg(truth.unig)}，本站按 I、aVF 的 QRS 面积计算 ${fmtDeg(truth.area)}）。` +
        `你的答案 ${fmtDeg(v)}，相差 ${Math.abs(Math.round(r.err))}°（容差 ±${r.tol}°）。`;
      break;
    }
  }
  quiz.done = true;
  quiz.results[quiz.index] = { ok };
  if (mark) set({ quizMark: { ...state.quizMark, lead: q.lead, ...mark } }, 'overlay');
  const fb = $('#qz-feedback');
  fb.hidden = false;
  fb.className = `qz-feedback ${ok ? 'ok' : 'bad'}`;
  fb.innerHTML = `<span class="verdict">${ok ? '✓ 正确' : '✗ 不对'}</span>　${detail}<br>${q.explain}`;
  if ($('#qz-num')) $('#qz-num').disabled = true;
  $('#qz-status').textContent = '';
  $('#qz-submit').hidden = true;
  const last = quiz.index === quiz.set.questions.length - 1;
  $('#qz-next').hidden = false;
  $('#qz-next').textContent = last ? '查看成绩' : '下一题 →';
  renderQuizScore();
  $('#qz-next').focus();
}

function finishQuiz() {
  quiz.token++;
  const qs = quiz.set.questions;
  const right = quiz.results.filter((r) => r?.ok).length;
  const skipped = qs.length - quiz.results.filter(Boolean).length;
  $('#qz-count').textContent = '完成';
  const plain = (h) => h.replace(/<[^>]+>/g, '');
  // 三种结果：答对、答错、跳过（病例没加载出来就跳过的题不算答错）
  const mark = (r) => (!r ? ['skip', '－'] : r.ok ? ['ok', '✓'] : ['bad', '✗']);
  $('#qz-prompt').innerHTML =
    `<b>答对 ${right} / ${qs.length - skipped} 题。</b>` +
    (skipped ? `<span class="muted">（另有 ${skipped} 题跳过，未计分）</span>` : '') +
    `<ol class="qz-summary small">${qs
      .map((q, i) => {
        const [cls, sym] = mark(quiz.results[i]);
        return `<li class="${cls}">${sym} ${esc(plain(q.prompt))}${cls === 'skip' ? '<span class="muted">（跳过）</span>' : ''}</li>`;
      })
      .join('')}</ol>`;
  $('#qz-answer').innerHTML = `<button class="primary" id="qz-again">再做一次</button><button id="qz-done">退出测验</button>`;
  $('#qz-again').onclick = () => startQuiz(quiz.set.id);
  $('#qz-done').onclick = () => exitQuiz();
  $('#qz-feedback').hidden = true;
  $('#qz-fig').hidden = true;
  $('#qz-hint').hidden = true;
  $('#qz-submit').hidden = true;
  $('#qz-next').hidden = true;
  $('#qz-status').textContent = '';
  set({ quizMark: null }, 'overlay');
}

async function exitQuiz() {
  if (!quiz.set) return;
  quiz.token++;
  quiz.ready = false;
  cancelPendingLoad();
  stopPlay();
  const saved = quiz.saved;
  quiz.set = null;
  quiz.index = -1;
  $('#quiz-panel').hidden = true;
  document.body.classList.remove('quizzing');
  const u = new URL(location.href);
  u.searchParams.delete('quiz');
  history.replaceState(null, '', u);
  set({ quizMark: null }, 'overlay');
  const unlock = () => {
    $('#case-select').disabled = false;
    $('#case-select').value = state.caseId;
    $('#tour-btn').disabled = false;
    $('#hb-btn').disabled = false;
    const v = new URL(location.href);
    v.searchParams.set('case', state.caseId);
    history.replaceState(null, '', v);
  };
  if (!saved) return unlock();
  const { caseId, cursorMs, selectedLead, caliper, gain, ...view } = saved;
  let caseRestored = true;
  if (caseId && caseId !== state.caseId) {
    caseRestored = (await selectCase(caseId)) === true;
    // 恢复期间又开始了新测验或导览：以最新操作为准（saved 已交给它或仍归测验）
    if (quiz.set) return;
    if (tour.def) return unlock();
  }
  quiz.saved = null;
  set(caseRestored ? { ...view, gain, cursorMs, selectedLead, caliper } : { ...view, gain }, 'paper', 'linked');
  $('#gain').value = String(gain);
  syncControls();
  unlock();
}

// ================================================================ 启动

function bindControls() {
  $('#speed').onchange = (e) => set({ speed: Number(e.target.value) }, 'paper');
  $('#gain').onchange = (e) => set({ gain: Number(e.target.value) }, 'paper');
  $('#show-waves').onchange = (e) => set({ showWaves: e.target.checked }, 'paper');
  $('#show-ref').onchange = (e) => set({ showRef: e.target.checked }, 'overlay');
  for (const b of document.querySelectorAll('[data-mtab]')) {
    b.onclick = () => {
      document.querySelectorAll('[data-mtab]').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('[data-mpane]').forEach((p) => (p.hidden = p.dataset.mpane !== b.dataset.mtab));
    };
  }
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
      renderCompareText();
      if (tour.def && tour.index >= 0) renderTourText(effectiveStep(tour.def, tour.index), tour.index);
      $('#term-pop').hidden = true;
    };
  }
  $('#glossary-btn').onclick = openGlossary;
  for (const b of document.querySelectorAll('[data-cmode]')) {
    b.classList.toggle('on', b.dataset.cmode === state.cmpMode);
    b.onclick = () => {
      lsSet('ecg-lab:cmpMode', b.dataset.cmode);
      document.querySelectorAll('[data-cmode]').forEach((x) => x.classList.toggle('on', x === b));
      set({ cmpMode: b.dataset.cmode }, 'compare');
    };
  }
  $('#cmp-ref-open').onclick = async (e) => {
    e.preventDefault();
    const id = e.currentTarget.dataset.case;
    if (tour.def) await exitTour({ keepCase: true });
    selectCase(id);
  };
  $('#tour-btn').onclick = openTourMenu;
  $('#tour-menu-close').onclick = () => $('#tour-menu').close();
  $('#tour-list').addEventListener('click', (e) => {
    const id = e.target.closest('[data-start-tour]')?.dataset.startTour;
    if (id) {
      $('#tour-menu').close();
      startTour(id);
    }
  });
  $('#tour-prev').onclick = () => goStep(tour.index - 1);
  $('#tour-next').onclick = () => (tour.index >= tour.def.steps.length - 1 ? exitTour() : goStep(tour.index + 1));
  $('#tour-exit').onclick = exitTour;
  $('#quiz-btn').onclick = openQuizMenu;
  $('#quiz-menu-close').onclick = () => $('#quiz-menu').close();
  $('#quiz-list').addEventListener('click', (e) => {
    const id = e.target.closest('[data-start-quiz]')?.dataset.startQuiz;
    if (id) {
      $('#quiz-menu').close();
      startQuiz(id);
    }
  });
  $('#qz-answer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b || quiz.done) return;
    quiz.pickedOpt = Number(b.dataset.opt);
    document.querySelectorAll('.qz-opt').forEach((x) => x.classList.toggle('picked', x === b));
    $('#qz-submit').disabled = false;
  });
  $('#qz-submit').onclick = submitQuiz;
  $('#qz-next').onclick = () => {
    // 只有作答后（或病例加载失败、允许跳过时）才能进入下一题
    if (!quiz.set || $('#qz-next').hidden) return;
    quiz.index >= quiz.set.questions.length - 1 ? finishQuiz() : goQuestion(quiz.index + 1);
  };
  $('#qz-exit').onclick = () => exitQuiz();
  $('#primer-back').onclick = () => {
    const ch = hb.primerFrom;
    $('#primer').close();
    openHandbook(ch);
  };
  $('#anatomy-back').onclick = () => {
    const ch = hb.anatomyFrom;
    closeDlg('anatomy');
    openHandbook(ch);
  };
  $('#anatomy-close').onclick = () => closeDlg('anatomy');
  $('#anatomy').addEventListener('close', () => {
    const u = new URL(location.href);
    u.searchParams.delete('heart');
    history.replaceState(null, '', u);
  });
  $('#heart-btn').onclick = () => openAnatomy('ext');
  $('#hb-btn').onclick = () => openHandbook(hb.chapter);
  $('#dg-btn').onclick = () => openDrugbook(dg.chapter);
  $('#drugbook-close').onclick = () => closeDlg('drugbook');
  $('#drugbook').addEventListener('close', () => {
    const u = new URL(location.href);
    u.searchParams.delete('drug');
    history.replaceState(null, '', u);
  });
  $('#handbook-close').onclick = closeHandbook;
  $('#handbook').addEventListener('close', () => {
    const u = new URL(location.href);
    u.searchParams.delete('read');
    history.replaceState(null, '', u);
  });
  $('#hb-nav').addEventListener('click', (e) => {
    const a = e.target.closest('[data-hb]');
    if (!a) return;
    e.preventDefault();
    openHandbook(a.dataset.hb);
  });
  $('#hb-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]');
    if (b) return runDemo(hb.chapter, +b.dataset.demo);
    const t = e.target.closest('[data-hb-tour]');
    if (t) {
      closeHandbook();
      $('#hb-demo').hidden = true;
      startTour(t.dataset.hbTour);
    }
  });
  $('#hb-demo-back').onclick = () => {
    stopDemo();
    openHandbook(hb.chapter);
  };
  $('#hb-demo-close').onclick = stopDemo;
  $('#primer-close').onclick = () => $('#primer').close();
  // 对话框关闭或其中内容滚动时，收起挂在对话框里的术语弹窗
  for (const id of ['handbook', 'primer', 'glossary', 'drugbook', 'anatomy']) $(`#${id}`).addEventListener('close', () => ($('#term-pop').hidden = true));
  document.addEventListener(
    'scroll',
    (e) => {
      const pop = $('#term-pop');
      if (!pop.hidden && pop.classList.contains('in-dlg') && !pop.contains(e.target)) pop.hidden = true;
    },
    true,
  );
  // 读图入门、术语表：最大化 / 还原（各自记住选择，下次打开保持）
  for (const [dlg, key] of [
    ['primer', 'ecg-lab:primerMax'],
    ['anatomy', 'ecg-lab:anatomyMax'],
    ['glossary', 'ecg-lab:glossaryMax'],
    ['handbook', 'ecg-lab:handbookMax'],
    ['drugbook', 'ecg-lab:drugbookMax'],
  ]) {
    const d = $(`#${dlg}`);
    const btn = $(`#${dlg}-max`);
    const setMax = (on) => {
      d.classList.toggle('max', on);
      btn.textContent = on ? '⤡ 还原' : '⤢ 最大化';
      btn.title = on ? '还原为普通窗口' : '最大化窗口';
    };
    setMax(lsGet(key, '0') === '1');
    btn.onclick = () => {
      const on = !d.classList.contains('max');
      lsSet(key, on ? '1' : '0');
      setMax(on);
    };
  }
  // toggle 事件不冒泡，用捕获阶段监听
  $('#now-body').addEventListener(
    'toggle',
    (e) => {
      if (e.target.matches?.('details[data-remember]')) proMoreOpen = e.target.open;
    },
    true,
  );
  $('#glossary-close').onclick = () => $('#glossary').close();
  // 中文输入法拼写过程中不检索，选定汉字后再检索
  let glTimer = 0;
  const glSearch = () => {
    clearTimeout(glTimer);
    glTimer = setTimeout(() => renderGlossary($('#gl-q').value), 120);
  };
  $('#gl-q').addEventListener('input', (e) => !e.isComposing && glSearch());
  $('#gl-q').addEventListener('compositionend', glSearch);
  $('#gl-q').addEventListener('keydown', (e) => {
    // Esc：先清空搜索框，再按一次才关闭术语表
    if (e.key === 'Escape' && e.target.value) {
      e.preventDefault();
      e.target.value = '';
      renderGlossary('');
    }
  });

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
    const rd = e.target.closest('[data-hb-read]');
    if (rd) {
      e.preventDefault();
      $('#term-pop').hidden = true;
      for (const id of ['glossary', 'primer', 'drugbook', 'anatomy']) if ($(`#${id}`).open) closeDlg(id);
      openHandbook(rd.dataset.hbRead);
      return;
    }
    const dc = e.target.closest('[data-drug-ch], [data-drug]');
    if (dc) {
      e.preventDefault();
      $('#term-pop').hidden = true;
      for (const id of ['glossary', 'primer', 'handbook', 'anatomy']) if ($(`#${id}`).open) closeDlg(id);
      openDrugbook(dc.dataset.drugCh ?? `drug:${dc.dataset.drug}`);
      return;
    }
    const ht = e.target.closest('[data-heart]');
    if (ht) {
      e.preventDefault();
      $('#term-pop').hidden = true;
      for (const id of ['glossary', 'primer', 'drugbook']) if ($(`#${id}`).open) closeDlg(id);
      const fromHb = $('#handbook').open ? hb.chapter : null;
      if (fromHb) closeHandbook();
      openAnatomy(ht.dataset.heart, fromHb);
      return;
    }
    const pr = e.target.closest('[data-primer]');
    if (pr) {
      e.preventDefault();
      $('#term-pop').hidden = true;
      if ($('#glossary').open) $('#glossary').close();
      if ($('#anatomy').open) closeDlg('anatomy');
      const fromHb = $('#handbook').open ? hb.chapter : null;
      if (fromHb) closeHandbook();
      openPrimer(pr.dataset.primer, fromHb);
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
  const groups = [];
  for (const c of state.index.cases) {
    if (c.quizOnly) continue; // 测验专用病例（LUDB）不出现在列表里
    let g = groups.find((x) => x.name === (c.group ?? '其他'));
    if (!g) groups.push((g = { name: c.group ?? '其他', cases: [] }));
    g.cases.push(c);
  }
  sel.innerHTML = groups
    .map(
      (g) =>
        `<optgroup label="${esc(g.name)}">` +
        g.cases.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('') +
        '</optgroup>',
    )
    .join('') +
    // 隐藏的选项：测验加载这些病例时，下拉框仍能显示标题
    state.index.cases
      .filter((c) => c.quizOnly)
      .map((c) => `<option value="${esc(c.id)}" hidden>${esc(c.title)}</option>`)
      .join('') +
    `<option value="${QUIZ_OPT}" hidden>测验中（病例名称已隐藏）</option>`;
  sel.onchange = async (e) => {
    const id = e.target.value;
    $('#hb-demo').hidden = true; // 手动换病例：手册演示的说明不再适用
    hb.demoToken++;
    if (tour.def) await exitTour({ keepCase: true }); // 导览讲的是原来的病例，手动换病例即结束导览
    selectCase(id);
  };
  const want = new URLSearchParams(location.search).get('case');
  const wantQuizParam = new URLSearchParams(location.search).get('quiz');
  let id = state.index.cases.find((c) => !c.quizOnly)?.id;
  if (want && state.index.cases.some((c) => c.id === want && !c.quizOnly)) id = want;
  else if (want && !wantQuizParam) toast(`找不到病例 "${want}"，已打开默认病例`);
  sel.value = id;
  await selectCase(id);
  loadHeart();
  const wantTour = new URLSearchParams(location.search).get('tour');
  if (wantTour) startTour(wantTour); // 无效 id 会提示
  const wantQuiz = new URLSearchParams(location.search).get('quiz');
  if (wantQuiz && !wantTour) startQuiz(wantQuiz);
  const wantRead = new URLSearchParams(location.search).get('read');
  if (wantRead && !wantQuiz) openHandbook(wantRead);
  const wantDrug = new URLSearchParams(location.search).get('drug');
  if (wantDrug && !wantQuiz && !wantRead) openDrugbook(wantDrug);
  const wantHeart = new URLSearchParams(location.search).get('heart');
  if (wantHeart && !wantTour && !wantQuiz && !wantRead && !wantDrug) openAnatomy(wantHeart);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 5000);
}

boot();
