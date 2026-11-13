// "与正常心电图对照"的绘图：
//   drawBeatCompare   一个导联的中位心搏，本例与正常对照重叠或并排（50 mm/s）
//   drawRhythmCompare 一个导联的 10 秒节律条，正常对照在上、本例在下（25 mm/s）
// 坐标一律用 mm，与主心电图纸同一套网格和屏幕校准。

import { setupCanvas, drawGrid } from '../ecg/paper.js';
import { medianAt } from '../ecg/median.js';

// 正常对照用青绿（不透明）：与黑色的本例、粉红网格反差都大，两线重合处也能分清
export const CMP_COLORS = { cur: '#111', ref: '#0d9488', mark: '#7c3aed', divider: '#374151' };
export const BEAT_SPEED = 50; // mm/s：单个心跳放大一倍，细节更清楚
export const RHYTHM_SPEED = 25;

const LABEL_MM = 6; // 顶部文字行
const PAD_MM = 2;

/**
 * 两个中位心搏在若干导联上的最高 / 最低电压（µV），让同一组小图用同一个纵向范围。
 * untilMs：只统计这个时刻（相对对齐点）之前的部分——看 P 波时不让 QRS 把纵向范围撑大，
 * QRS 超出图框的部分被截去。
 */
export function beatRange(mbs, leads, untilMs = Infinity) {
  let hi = 0;
  let lo = 0;
  for (const mb of mbs)
    for (const l of leads)
      mb.leads[l].forEach((v, i) => {
        if (-mb.pre + i * mb.step > untilMs) return;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      });
  return { hi, lo };
}

const snap5 = (mm) => Math.ceil(mm / 5) * 5;

function trace(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

/**
 * @param o {lead, cur, ref（中位心搏）, gain, range:{hi,lo}, mode:'overlay'|'side', pxPerMm,
 *            speed（mm/s，默认 50）, zoom（显示放大倍数，默认 1：与真实心电图纸同尺寸）}
 */
export function drawBeatCompare(canvas, o) {
  const { cur, ref, lead, gain, mode } = o;
  const speed = o.speed ?? BEAT_SPEED;
  const winMs = cur.pre + cur.post;
  const winMm = (winMs / 1000) * speed;
  const nWin = mode === 'side' ? 2 : 1;
  const fz = 1 / (o.zoom ?? 1); // 放大显示时文字不跟着放大
  const labelMm = LABEL_MM * fz;
  const baselineMm = snap5(labelMm + (o.range.hi * gain) / 1000 + 1);
  const lay = {
    widthMm: snap5(PAD_MM * 2 + winMm * nWin),
    heightMm: snap5(baselineMm + (-o.range.lo * gain) / 1000 + 4),
  };
  const { ctx, s } = setupCanvas(canvas, lay, o.pxPerMm * (o.zoom ?? 1));
  ctx.fillStyle = '#fffaf8';
  ctx.fillRect(0, 0, lay.widthMm, lay.heightMm);
  drawGrid(ctx, lay, s);

  const x0 = (w) => PAD_MM + w * winMm;
  const pts = (mb, w) => {
    const out = [];
    for (let t = -mb.pre; t <= mb.post; t += mb.step)
      out.push([x0(w) + ((t + mb.pre) / 1000) * speed, baselineMm - (medianAt(mb, lead, t) * gain) / 1000]);
    return out;
  };

  // QRS 起点（对齐点）
  ctx.save();
  ctx.strokeStyle = CMP_COLORS.mark;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1 / s;
  ctx.setLineDash([1.2, 1]);
  for (let w = 0; w < nWin; w++) {
    const x = x0(w) + (cur.pre / 1000) * speed;
    ctx.beginPath();
    ctx.moveTo(x, labelMm);
    ctx.lineTo(x, lay.heightMm);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, labelMm, lay.widthMm, lay.heightMm - labelMm);
  ctx.clip();
  ctx.lineJoin = 'round';
  // 正常对照（蓝，半透明，稍粗，压在下面）
  ctx.save();
  ctx.strokeStyle = CMP_COLORS.ref;
  ctx.lineWidth = (mode === 'side' ? 1.5 : 2.4) / s;
  trace(ctx, pts(ref, 0));
  ctx.restore();
  // 本例（黑）
  ctx.strokeStyle = CMP_COLORS.cur;
  ctx.lineWidth = 1.5 / s;
  trace(ctx, pts(cur, mode === 'side' ? 1 : 0));
  ctx.restore();

  // 文字
  ctx.font = `600 ${3.4 * fz}px system-ui, sans-serif`;
  ctx.fillStyle = '#333';
  ctx.fillText(lead, PAD_MM * fz, 4.2 * fz);
  if (mode === 'side') {
    ctx.font = `600 ${2.8 * fz}px system-ui, sans-serif`;
    ctx.fillStyle = CMP_COLORS.ref;
    ctx.fillText('正常对照', x0(0) + 9 * fz, 4.2 * fz);
    ctx.fillStyle = CMP_COLORS.cur;
    ctx.fillText('本例', x0(1) + 3 * fz, 4.2 * fz);
    // 分割线：深灰、加粗，左右两个心跳一眼分开
    ctx.strokeStyle = CMP_COLORS.divider;
    ctx.lineWidth = 2.5 / s;
    ctx.beginPath();
    ctx.moveTo(x0(1), 0);
    ctx.lineTo(x0(1), lay.heightMm);
    ctx.stroke();
  }
}

/** 10 秒节律条的纵向范围：取 1% / 99% 分位，个别伪迹不会把整条压扁 */
function stripRange(ecgs, lead) {
  let hi = 0;
  let lo = 0;
  for (const e of ecgs) {
    const a = e.lead(lead);
    const off = e.offset(lead);
    const sorted = Float32Array.from(a, (v) => v - off).sort();
    hi = Math.max(hi, sorted[Math.floor(sorted.length * 0.995)]);
    lo = Math.min(lo, sorted[Math.floor(sorted.length * 0.005)]);
  }
  return { hi, lo };
}

/**
 * @param o {lead, cur, ref（loadCase 的结果）, refLabel, gain, pxPerMm}
 */
export function drawRhythmCompare(canvas, o) {
  const { cur, ref, lead, gain } = o;
  const durMs = Math.min(cur.durationMs, ref.durationMs);
  const r = stripRange([cur, ref], lead);
  const upMm = (r.hi * gain) / 1000 + 1;
  const downMm = (-r.lo * gain) / 1000 + 2;
  const stripMm = snap5(LABEL_MM + upMm + downMm);
  const lay = { widthMm: snap5(PAD_MM * 2 + (durMs / 1000) * RHYTHM_SPEED), heightMm: stripMm * 2 };
  const { ctx, s } = setupCanvas(canvas, lay, o.pxPerMm);
  ctx.fillStyle = '#fffaf8';
  ctx.fillRect(0, 0, lay.widthMm, lay.heightMm);
  drawGrid(ctx, lay, s);

  const strips = [
    { ecg: ref, color: CMP_COLORS.ref, label: `正常对照（${o.refLabel}）` },
    { ecg: cur, color: CMP_COLORS.cur, label: '本例' },
  ];
  strips.forEach((st, k) => {
    const top = k * stripMm;
    const base = top + LABEL_MM + upMm;
    const a = st.ecg.lead(lead);
    const off = st.ecg.offset(lead);
    const n = Math.min(a.length, Math.floor((durMs / 1000) * st.ecg.fs));
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([PAD_MM + (i / st.ecg.fs) * RHYTHM_SPEED, base - ((a[i] - off) * gain) / 1000]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, lay.widthMm, stripMm);
    ctx.clip();
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 1.4 / s;
    ctx.lineJoin = 'round';
    trace(ctx, pts);
    ctx.restore();
    ctx.font = '600 3.2px system-ui, sans-serif';
    ctx.fillStyle = st.color;
    ctx.fillText(`${lead} · ${st.label}`, PAD_MM, top + 4.2);
  });
  ctx.strokeStyle = CMP_COLORS.divider;
  ctx.lineWidth = 2.5 / s;
  ctx.beginPath();
  ctx.moveTo(0, stripMm);
  ctx.lineTo(lay.widthMm, stripMm);
  ctx.stroke();
}
