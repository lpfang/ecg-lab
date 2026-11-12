// 三个平面同时对照：额面（从前看）、水平面（从上看）、矢状面（从左看）。
// 向量由 12 导联经 Kors 矩阵重建（X 左、Y 下、Z 后）。三个图用同一比例尺，大小可直接比较。
//
// 屏幕坐标（x 向右、y 向下）与观察方向：
//   额面   从前看：右 = 患者左（X），下 = 患者下（Y）
//   水平面 从上看：右 = 患者左（X），下 = 患者前（−Z）
//   矢状面 从左看：右 = 患者后（Z），下 = 患者下（Y）

import { korsVector, leadValuesAt } from '../vcg/vector.js';
import { WAVE_COLORS } from '../ecg/paper.js';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 150;
const C = SIZE / 2;
const R = 62;

export const PLANES = [
  { id: 'frontal', name: '额面', view: '从前看', map: (k) => [k.X, k.Y], labels: ['右', '左', '上', '下'] },
  { id: 'horizontal', name: '水平面', view: '从上看', map: (k) => [k.X, -k.Z], labels: ['右', '左', '后', '前'] },
  { id: 'sagittal', name: '矢状面', view: '从左看', map: (k) => [k.Z, k.Y], labels: ['前', '后', '上', '下'] },
];

const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

export function phaseColor(beat, t) {
  if (beat.P && t >= beat.P.on && t <= beat.P.off) return WAVE_COLORS.P.line;
  if (t >= beat.QRS.on && t <= beat.QRS.off) return WAVE_COLORS.QRS.line;
  if (beat.T && t >= beat.T.on && t <= beat.T.off) return WAVE_COLORS.T.line;
  return '#9ca3af';
}

/**
 * 沿环画小箭头（三角形），指向画线方向。pts: [{t, x, y}]（屏幕坐标），间距按时间等分。
 * QRS 每 10 ms、P / T 每 20 ms。
 */
export function arrowMarks(pts, beat, size = 4) {
  const out = [];
  const at = (t) => {
    const i = Math.min(pts.length - 2, Math.max(0, Math.floor((t - pts[0].t) / (pts[1].t - pts[0].t))));
    const f = Math.min(1, Math.max(0, (t - pts[i].t) / (pts[i + 1].t - pts[i].t)));
    return [pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f];
  };
  for (const [w, step] of [
    [beat.P, 20],
    [beat.QRS, 10],
    [beat.T, 20],
  ]) {
    if (!w) continue;
    for (let t = w.on + step / 2; t < w.off - 2; t += step) {
      const [x, y] = at(t);
      const [x2, y2] = at(t + 2);
      const len = Math.hypot(x2 - x, y2 - y);
      if (len < 0.15) continue; // 几乎不动时方向不确定
      const ux = (x2 - x) / len;
      const uy = (y2 - y) / len;
      const pts3 = [
        [x + ux * size, y + uy * size],
        [x - ux * size * 0.6 - uy * size * 0.6, y - uy * size * 0.6 + ux * size * 0.6],
        [x - ux * size * 0.6 + uy * size * 0.6, y - uy * size * 0.6 - ux * size * 0.6],
      ];
      out.push(el('polygon', { points: pts3.map((p) => p.join(',')).join(' '), fill: phaseColor(beat, t) }));
    }
  }
  return out;
}

/** 屏幕坐标（y 向下）下的旋转方向：鞋带公式面积 > 0 为顺时针 */
export function rotation(pts) {
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += pts[i - 1].x * pts[i].y - pts[i].x * pts[i - 1].y;
  return a > 0 ? '顺时针' : '逆时针';
}

export class PlanesView {
  constructor(container) {
    this.container = container;
    this.key = null;
  }

  /** @param ctx {ecg, beat, win, baseline, t} */
  update(ctx) {
    const key = ctx.beat ? `${ctx.ecg.meta.id}:${ctx.win.start}` : null;
    if (key !== this.key) {
      this.key = key;
      this.build(ctx);
    }
    if (!ctx.beat) return;
    const k = korsVector(leadValuesAt(ctx.ecg, ctx.t, ctx.baseline));
    for (const p of this.views) {
      const [x, y] = p.plane.map(k);
      const sx = C + x * this.scale;
      const sy = C + y * this.scale;
      p.vec.setAttribute('x2', sx);
      p.vec.setAttribute('y2', sy);
      p.dot.setAttribute('cx', sx);
      p.dot.setAttribute('cy', sy);
    }
  }

  build(ctx) {
    this.container.replaceChildren();
    this.views = [];
    if (!ctx.beat) {
      this.container.textContent = '把时间光标移到有标注的心搏上';
      return;
    }
    const raw = [];
    let maxMag = 1;
    for (let t = ctx.win.start; t <= ctx.win.end; t += 4) {
      const k = korsVector(leadValuesAt(ctx.ecg, t, ctx.baseline));
      maxMag = Math.max(maxMag, Math.hypot(k.X, k.Y, k.Z));
      raw.push({ t, k });
    }
    this.scale = R / maxMag; // 三个平面共用比例尺
    const b = ctx.beat;
    for (const plane of PLANES) {
      const pts = raw.map(({ t, k }) => {
        const [x, y] = plane.map(k);
        return { t, x: C + x * this.scale, y: C + y * this.scale };
      });
      const qrs = pts.filter((p) => p.t >= b.QRS.on && p.t <= b.QRS.off).map((p) => ({ x: p.x - C, y: p.y - C }));
      const fig = document.createElement('figure');
      fig.className = 'plane';
      const svg = el('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'img', 'aria-label': `${plane.name}向量环` });
      const [l, r, u, d] = plane.labels;
      svg.append(
        el('line', { x1: 8, y1: C, x2: SIZE - 8, y2: C, class: 'pl-axis' }),
        el('line', { x1: C, y1: 8, x2: C, y2: SIZE - 8, class: 'pl-axis' }),
        el('text', { x: 3, y: C - 3, class: 'pl-dir' }, l),
        el('text', { x: SIZE - 3, y: C - 3, class: 'pl-dir', 'text-anchor': 'end' }, r),
        el('text', { x: C + 3, y: 10, class: 'pl-dir' }, u),
        el('text', { x: C + 3, y: SIZE - 3, class: 'pl-dir' }, d),
      );
      for (let i = 1; i < pts.length; i++) {
        svg.append(
          el('line', {
            x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y,
            stroke: phaseColor(b, pts[i].t), 'stroke-width': 1.4,
          }),
        );
      }
      svg.append(...arrowMarks(pts, b, 3.5));
      const vec = el('line', { x1: C, y1: C, x2: C, y2: C, class: 'pl-vec' });
      const dot = el('circle', { cx: C, cy: C, r: 2.6, class: 'pl-dot' });
      svg.append(vec, dot);
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${plane.name}</b>（${plane.view}）<br><span class="muted">QRS 环${rotation(qrs)}</span>`;
      fig.append(svg, cap);
      this.container.append(fig);
      this.views.push({ plane, vec, dot });
    }
  }
}
