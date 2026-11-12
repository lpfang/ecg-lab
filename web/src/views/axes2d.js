// 二维导联轴图：
//   额面六轴系统（肢体导联）：向量由 I 与 aVF 精确计算，投影 × 系数 = 导联电压
//   水平面（胸导联）：向量由 Kors 重建，导联方向为示意
// SVG 坐标：x 向右 = 患者左侧；y 向下 = 额面的下方 / 水平面的前方。

import {
  FRONTAL_AXES,
  CHEST_AXES,
  LIMB_LEADS,
  frontalVector,
  projectFrontal,
  korsVector,
  horizontalVector,
  projectHorizontal,
  leadValuesAt,
} from '../vcg/vector.js';
import { WAVE_COLORS } from '../ecg/paper.js';
import { arrowMarks } from './planes.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 140; // 中心
const R = 112; // 轴线半径

const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

/** 本心搏的向量环（平面），以及缩放系数 */
function loopOf(ecg, win, baseline, plane) {
  const pts = [];
  for (let t = win.start; t <= win.end; t += 4) {
    const vals = leadValuesAt(ecg, t, baseline);
    pts.push({ t, v: plane === 'frontal' ? frontalVector(vals) : horizontalVector(korsVector(vals)) });
  }
  const maxMag = Math.max(1, ...pts.map((p) => Math.hypot(p.v.x, p.v.y)));
  return { pts, scale: (0.92 * R) / maxMag };
}

function phaseColor(beat, t) {
  if (beat.P && t >= beat.P.on && t <= beat.P.off) return WAVE_COLORS.P.line;
  if (t >= beat.QRS.on && t <= beat.QRS.off) return WAVE_COLORS.QRS.line;
  if (beat.T && t >= beat.T.on && t <= beat.T.off) return WAVE_COLORS.T.line;
  return '#9ca3af';
}

/**
 * @param svg <svg> 元素
 * @param ctx {ecg, beat, win, baseline, t, selectedLead}
 * @returns {plane, readout}
 */
export function renderAxes(svg, ctx) {
  const { ecg, beat, win, baseline, t, selectedLead } = ctx;
  const plane = LIMB_LEADS.includes(selectedLead) ? 'frontal' : 'horizontal';
  const axes = plane === 'frontal' ? FRONTAL_AXES : CHEST_AXES;
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 280 280');

  // 参考圆与方位
  svg.append(el('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: '#e5e1dc' }));
  const dirs =
    plane === 'frontal'
      ? [['左', 274, C + 4, 'end'], ['右', 6, C + 4, 'start'], ['上', C, 12, 'middle'], ['下', C, 276, 'middle']]
      : [['左', 274, C + 4, 'end'], ['右', 6, C + 4, 'start'], ['后', C, 12, 'middle'], ['前', C, 276, 'middle']];
  for (const [txt, x, y, anchor] of dirs) {
    svg.append(el('text', { x, y, 'text-anchor': anchor, class: 'ax-dir' }, txt));
  }

  // 导联轴：正半轴实线，负半轴虚线
  for (const ax of axes) {
    const r = (ax.deg * Math.PI) / 180;
    const ux = Math.cos(r);
    const uy = Math.sin(r);
    const sel = ax.lead === selectedLead;
    svg.append(
      el('line', {
        x1: C - ux * R, y1: C - uy * R, x2: C, y2: C,
        class: sel ? 'ax-neg sel' : 'ax-neg',
      }),
      el('line', { x1: C, y1: C, x2: C + ux * R, y2: C + uy * R, class: sel ? 'ax-pos sel' : 'ax-pos' }),
    );
    const lx = C + ux * (R + 12);
    const ly = C + uy * (R + 12) + 4;
    const lab = el('text', { x: lx, y: ly, 'text-anchor': 'middle', class: sel ? 'ax-lab sel' : 'ax-lab' }, `${ax.lead}+`);
    lab.dataset.lead = ax.lead;
    svg.append(lab);
  }

  if (!beat) {
    svg.append(el('text', { x: C, y: C - 8, 'text-anchor': 'middle', class: 'ax-hint' }, '把时间光标移到'));
    svg.append(el('text', { x: C, y: C + 10, 'text-anchor': 'middle', class: 'ax-hint' }, '有标注的心搏上'));
    return { plane, readout: null };
  }

  // 向量环（本心搏）
  const { pts, scale } = loopOf(ecg, win, baseline, plane);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    svg.append(
      el('line', {
        x1: C + a.v.x * scale, y1: C + a.v.y * scale, x2: C + b.v.x * scale, y2: C + b.v.y * scale,
        stroke: phaseColor(beat, b.t), 'stroke-width': 1.2, 'stroke-opacity': 0.55,
      }),
    );
  }

  // 画线方向
  svg.append(...arrowMarks(pts.map((p) => ({ t: p.t, x: C + p.v.x * scale, y: C + p.v.y * scale })), beat, 4.5));

  // 此刻的向量
  const vals = leadValuesAt(ecg, t, baseline);
  const v = plane === 'frontal' ? frontalVector(vals) : horizontalVector(korsVector(vals));
  const tip = { x: C + v.x * scale, y: C + v.y * scale };

  // 选中导联上的投影
  let readout = null;
  const ax = axes.find((a) => a.lead === selectedLead);
  if (ax) {
    const r = (ax.deg * Math.PI) / 180;
    const ux = Math.cos(r);
    const uy = Math.sin(r);
    const dot = v.x * ux + v.y * uy; // 投影长度（与导联电压同单位）
    const foot = { x: C + dot * scale * ux, y: C + dot * scale * uy };
    svg.append(el('line', { x1: tip.x, y1: tip.y, x2: foot.x, y2: foot.y, class: 'proj-drop' }));
    svg.append(
      el('line', { x1: C, y1: C, x2: foot.x, y2: foot.y, class: dot >= 0 ? 'proj-bar pos' : 'proj-bar neg' }),
    );
    const projected = plane === 'frontal' ? projectFrontal(v, ax) : projectHorizontal(v, ax);
    readout = {
      lead: ax.lead,
      projected_mV: projected / 1000,
      actual_mV: vals[ax.lead] / 1000,
      exact: plane === 'frontal',
      sign: dot >= 0 ? 'pos' : 'neg',
    };
  }

  // 箭头
  svg.append(el('line', { x1: C, y1: C, x2: tip.x, y2: tip.y, class: 'vec' }));
  const ang = Math.atan2(tip.y - C, tip.x - C);
  const ah = 7;
  if (Math.hypot(tip.x - C, tip.y - C) > ah) {
    svg.append(
      el('polygon', {
        points: [
          [tip.x, tip.y],
          [tip.x - ah * Math.cos(ang - 0.4), tip.y - ah * Math.sin(ang - 0.4)],
          [tip.x - ah * Math.cos(ang + 0.4), tip.y - ah * Math.sin(ang + 0.4)],
        ].map((p) => p.join(',')).join(' '),
        class: 'vec-head',
      }),
    );
  }
  svg.append(el('circle', { cx: C, cy: C, r: 2.5, fill: '#444' }));
  return { plane, readout };
}
