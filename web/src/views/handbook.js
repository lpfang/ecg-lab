// 读片手册的两个交互演示（不合成心电波形，只用几何和公式）：
//   axis：拖动额面平均向量，看六个肢体导联 QRS 净振幅（= 向量在导联轴上的投影）怎样变化
//   qtc ：调心率和 QT，看四种 QTc 公式的结果怎样分开

import { FRONTAL_AXES } from '../vcg/vector.js';
import { QTC_FORMULAS } from '../ecg/measures.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const rad = (d) => (d * Math.PI) / 180;
/** 角度规范到 (−180, 180] */
export const normDeg = (d) => {
  let x = ((d % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
};
const fmtDeg = (d) => `${d < 0 ? '−' : d > 0 ? '+' : ''}${Math.abs(Math.round(d))}°`;

/** 电轴分区（AHA/ACCF/HRS 2009 第三部分） */
export function axisClass(deg) {
  const d = normDeg(deg);
  if (d >= -30 && d <= 90) return { id: 'normal', zh: '正常电轴' };
  if (d < -30 && d >= -90) return { id: 'left', zh: '电轴左偏' };
  if (d > 90) return { id: 'right', zh: '电轴右偏' };
  return { id: 'extreme', zh: '极度电轴偏移（"无人区"）' };
}

/** 各肢体导联的相对净振幅：cos(向量方向 − 导联轴方向)，范围 −1 … 1 */
export const leadProjections = (deg) =>
  FRONTAL_AXES.map((a) => ({
    lead: a.lead,
    axisDeg: a.deg,
    v: Math.cos(rad(deg - a.deg)),
  }));

// ---------------------------------------------------------------- 电轴

export function axisWidget(root, initial = 60) {
  root.innerHTML = `
    <div class="hbw-axis">
      <svg viewBox="0 0 260 260" class="hbw-dial" role="img" aria-label="额面六轴系统，可拖动向量"></svg>
      <div class="hbw-side">
        <label class="hbw-row">电轴 <input type="range" min="-180" max="180" step="1" value="${initial}" class="hbw-range"> <b class="hbw-deg"></b></label>
        <p class="hbw-class"></p>
        <div class="hbw-bars"></div>
        <p class="muted small">柱高 = 平均向量在该导联轴上的投影（假设向量大小不变，只看方向）：向上为正、向下为负，接近零的导联与向量垂直。可以拖动左图的箭头，或用滑块。</p>
      </div>
    </div>`;
  const svg = root.querySelector('svg');
  const C = 130;
  const R = 92;
  const pt = (d, r) => [C + r * Math.cos(rad(d)), C + r * Math.sin(rad(d))];
  // 分区底色：正常（−30…+90）浅绿
  const arc = (a0, a1, cls) => {
    const [x0, y0] = pt(a0, R);
    const [x1, y1] = pt(a1, R);
    const large = a1 - a0 > 180 ? 1 : 0;
    svg.append(
      el('path', {
        d: `M${C},${C} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`,
        class: cls,
      }),
    );
  };
  arc(-30, 90, 'hbw-zone-normal');
  arc(-90, -30, 'hbw-zone-left');
  arc(90, 180, 'hbw-zone-right');
  svg.append(el('circle', { cx: C, cy: C, r: R, class: 'hbw-ring' }));
  for (const a of FRONTAL_AXES) {
    const [x1, y1] = pt(a.deg, R);
    const [x2, y2] = pt(a.deg + 180, R);
    svg.append(el('line', { x1: x2, y1: y2, x2: C, y2: C, class: 'hbw-neg' }));
    svg.append(
      el('line', {
        x1: C,
        y1: C,
        x2: x1,
        y2: y1,
        class: 'hbw-pos',
        'data-lead': a.lead,
      }),
    );
    const [lx, ly] = pt(a.deg, R + 14);
    svg.append(el('text', { x: lx, y: ly + 4, class: 'hbw-lab', 'data-lead': a.lead }, a.lead));
  }
  svg.append(el('text', { x: C, y: 12, class: 'hbw-dir' }, '上'), el('text', { x: C, y: 256, class: 'hbw-dir' }, '下'));
  svg.append(
    el('text', { x: 8, y: C + 4, class: 'hbw-dir' }, '右'),
    el('text', { x: 252, y: C + 4, class: 'hbw-dir' }, '左'),
  );
  const vec = el('line', { x1: C, y1: C, class: 'hbw-vec' });
  const head = el('circle', { r: 7, class: 'hbw-head' });
  svg.append(vec, head);

  const range = root.querySelector('.hbw-range');
  const bars = root.querySelector('.hbw-bars');
  bars.innerHTML = FRONTAL_AXES.map(
    (a) =>
      `<div class="hbw-bar" data-lead="${a.lead}"><span class="hbw-bar-name">${a.lead}</span><span class="hbw-bar-track"><i></i></span><span class="hbw-bar-sign"></span></div>`,
  ).join('');

  const update = (deg) => {
    deg = normDeg(deg);
    range.value = Math.round(deg);
    const [x, y] = pt(deg, R - 8);
    vec.setAttribute('x2', x);
    vec.setAttribute('y2', y);
    head.setAttribute('cx', x);
    head.setAttribute('cy', y);
    root.querySelector('.hbw-deg').textContent = fmtDeg(deg);
    const cls = axisClass(deg);
    const proj = leadProjections(deg);
    const v = Object.fromEntries(proj.map((p) => [p.lead, p.v]));
    const sign = (x) => (Math.abs(x) < 0.17 ? '≈ 0' : x > 0 ? '向上' : '向下');
    root.querySelector('.hbw-class').innerHTML =
      `<b class="hbw-c-${cls.id}">${cls.zh}</b>　快速判断：I ${sign(v.I)}、aVF ${sign(v.aVF)}` +
      (v.I > 0.17 && v.aVF < -0.17 ? `，再看 II ${sign(v.II)}` : '');
    for (const p of proj) {
      const b = bars.querySelector(`[data-lead="${p.lead}"]`);
      const i = b.querySelector('i');
      i.style.height = `${Math.abs(p.v) * 50}%`;
      i.style.bottom = p.v >= 0 ? '50%' : `${50 - Math.abs(p.v) * 50}%`;
      i.className = p.v >= 0 ? 'pos' : 'neg';
      b.querySelector('.hbw-bar-sign').textContent = Math.abs(p.v) < 0.17 ? '≈0' : p.v > 0 ? '+' : '−';
    }
    // 与向量最接近的导联轴加粗
    const best = proj.reduce((a, b) => (b.v > a.v ? b : a));
    svg.querySelectorAll('[data-lead]').forEach((e) => e.classList.toggle('hl', e.dataset.lead === best.lead));
  };
  range.oninput = () => update(+range.value);
  let drag = false;
  const fromEvent = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 260 - C;
    const y = ((e.clientY - r.top) / r.height) * 260 - C;
    if (Math.hypot(x, y) < 6) return;
    update((Math.atan2(y, x) * 180) / Math.PI);
  };
  svg.addEventListener('pointerdown', (e) => {
    drag = true;
    svg.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  svg.addEventListener('pointermove', (e) => drag && fromEvent(e));
  svg.addEventListener('pointerup', () => (drag = false));
  update(initial);
  return { set: update };
}

// ---------------------------------------------------------------- QT / QTc

/** QTc 判读界值（AHA/ACCF/HRS 2009 第四部分）：男 > 450、女 > 460 ms 为延长 */
export const qtcLimit = (sex) => (sex === 'F' ? 460 : 450);

export function qtcTable(hr, qt) {
  const rr = 60000 / hr;
  return QTC_FORMULAS.map((f) => ({
    id: f.id,
    zh: f.zh,
    expr: f.expr,
    v: f.fn(qt, rr),
  }));
}

/**
 * @param preset 可选 {hr, qt, sex, label}：用当前病例的数值预填
 */
export function qtcWidget(root, preset = null) {
  const p = { hr: 75, qt: 380, sex: 'M', ...(preset ?? {}) };
  root.innerHTML = `
    <div class="hbw-qtc">
      <div class="hbw-inputs">
        <label class="hbw-row">心率 <input type="range" min="40" max="150" step="1" class="hbw-hr"> <b class="hbw-hr-v"></b> 次/分 <span class="muted small hbw-rr"></span></label>
        <label class="hbw-row">QT <input type="range" min="260" max="560" step="2" class="hbw-qt"> <b class="hbw-qt-v"></b> ms</label>
        <span class="hbw-row">性别
          <label><input type="radio" name="hbw-sex" value="M"> 男（&gt; 450 ms 为延长）</label>
          <label><input type="radio" name="hbw-sex" value="F"> 女（&gt; 460 ms）</label>
        </span>
        ${preset?.label ? `<p class="muted small">已按${preset.label}预填，可以自己调。</p>` : ''}
      </div>
      <div class="hbw-qtc-out"></div>
      <p class="muted small">QT 不变、只改心率时，四种公式的差别最明显：心率越偏离 60 次/分，Bazett 与其他公式差得越多。心率 60 次/分（RR = 1 s）时四种公式都等于 QT。</p>
    </div>`;
  const hr = root.querySelector('.hbw-hr');
  const qt = root.querySelector('.hbw-qt');
  hr.value = Math.round(p.hr);
  qt.value = Math.round(p.qt / 2) * 2;
  root.querySelector(`input[name="hbw-sex"][value="${p.sex === 'F' ? 'F' : 'M'}"]`).checked = true;
  const out = root.querySelector('.hbw-qtc-out');
  const SCALE = [300, 600]; // 条形图范围（ms）
  const pos = (v) => `${((Math.min(SCALE[1], Math.max(SCALE[0], v)) - SCALE[0]) / (SCALE[1] - SCALE[0])) * 100}%`;
  const update = () => {
    const h = +hr.value;
    const q = +qt.value;
    const sex = root.querySelector('input[name="hbw-sex"]:checked').value;
    const lim = qtcLimit(sex);
    root.querySelector('.hbw-hr-v').textContent = h;
    root.querySelector('.hbw-qt-v').textContent = q;
    root.querySelector('.hbw-rr').textContent = `（RR = ${Math.round(60000 / h)} ms）`;
    out.innerHTML =
      qtcTable(h, q)
        .map(
          (r) =>
            `<div class="hbw-q"><span class="hbw-q-name">${r.zh}<span class="muted small">${r.expr}</span></span>` +
            `<span class="hbw-q-track"><i class="${r.v > lim ? 'long' : ''}" style="width:${pos(r.v)}"></i><em style="left:${pos(lim)}"></em></span>` +
            `<b class="hbw-q-v ${r.v > lim ? 'long' : ''}">${Math.round(r.v)} ms</b></div>`,
        )
        .join('') +
      `<p class="muted small">竖线 = ${lim} ms（${sex === 'F' ? '女' : '男'}性 QTc 延长界值）；条形图范围 300–600 ms。</p>`;
  };
  hr.oninput = update;
  qt.oninput = update;
  root.querySelectorAll('input[name="hbw-sex"]').forEach((r) => (r.onchange = update));
  update();
}

// ---------------------------------------------------------------- 正文术语链接

/**
 * 在 root 的正文里，给每个术语第一次出现的地方加 data-term 链接。
 * 只处理文字节点；跳过已有链接、按钮、标题，不改动正文 HTML 本身。
 * @param ids 本章术语 id；@param regexOf id → 识别正则
 */
export function linkTerms(root, ids, regexOf) {
  const SKIP = 'a, button, h2, h3, h4, label';
  for (const id of ids) {
    const re = regexOf(id);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const m = re.exec(n.data);
      if (!m) continue;
      const word = n.splitText(m.index);
      word.splitText(m[0].length);
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'hb-term';
      a.dataset.term = id;
      word.replaceWith(a);
      a.append(word);
      break;
    }
  }
}
