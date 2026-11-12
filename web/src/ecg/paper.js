// Canvas 心电图纸：网格、标定脉冲、导联名、波形。
// 绘制坐标一律用 mm，乘以 pxPerMm（屏幕校准）和 devicePixelRatio 得到设备像素。

import { PAPER } from './layout.js';

const COLORS = {
  paper: '#fffaf8',
  minor: '#f5c9c4',
  major: '#e58f88',
  trace: '#111',
  label: '#333',
};

export function drawPaper(canvas, lay, ecg, pxPerMm) {
  const dpr = window.devicePixelRatio || 1;
  const wPx = lay.widthMm * pxPerMm;
  const hPx = lay.heightMm * pxPerMm;
  canvas.style.width = `${wPx}px`;
  canvas.style.height = `${hPx}px`;
  canvas.width = Math.round(wPx * dpr);
  canvas.height = Math.round(hPx * dpr);
  const ctx = canvas.getContext('2d');
  const s = pxPerMm * dpr; // mm → 设备像素
  ctx.setTransform(s, 0, 0, s, 0, 0);

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, lay.widthMm, lay.heightMm);
  drawGrid(ctx, lay, s);

  for (const row of lay.rows) drawCalPulse(ctx, lay, row.baselineMm, s);
  for (const cell of lay.cells) drawCell(ctx, lay, cell, ecg, s);
}

function drawGrid(ctx, lay, s) {
  // 线宽以设备像素计，避免缩放后过粗或过细
  const lines = (step, color, widthPx) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx / s;
    ctx.beginPath();
    for (let x = 0; x <= lay.widthMm + 1e-6; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, lay.heightMm);
    }
    for (let y = 0; y <= lay.heightMm + 1e-6; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(lay.widthMm, y);
    }
    ctx.stroke();
  };
  // 小格太密时（< 3 设备像素）不画，避免一片糊
  if (PAPER.minorMm * s >= 3) lines(PAPER.minorMm, COLORS.minor, 1);
  lines(PAPER.majorMm, COLORS.major, 1.5);
}

function drawCalPulse(ctx, lay, baselineMm, s) {
  const x0 = 2;
  const w = (PAPER.calPulseMs / 1000) * lay.speed;
  const h = lay.gain; // 1 mV
  ctx.strokeStyle = COLORS.trace;
  ctx.lineWidth = 1.6 / s;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(0.5, baselineMm);
  ctx.lineTo(x0, baselineMm);
  ctx.lineTo(x0, baselineMm - h);
  ctx.lineTo(x0 + w, baselineMm - h);
  ctx.lineTo(x0 + w, baselineMm);
  ctx.lineTo(PAPER.marginLeftMm, baselineMm);
  ctx.stroke();
}

function drawCell(ctx, lay, cell, ecg, s) {
  const { fs } = ecg;
  const x = ecg.lead(cell.lead);
  const i0 = Math.max(0, Math.floor((cell.t0 / 1000) * fs));
  const i1 = Math.min(x.length - 1, Math.ceil((cell.t1 / 1000) * fs));
  const offset = ecg.offset(cell.lead); // µV，去掉直流偏移
  const mmPerSample = lay.speed / fs;
  const mmPerUv = lay.gain / 1000;

  ctx.save();
  // 允许波形超出本行（高电压时与真实心电图纸一样会重叠），但不超出纸面
  ctx.beginPath();
  ctx.rect(cell.xMm, 0, cell.widthMm, lay.heightMm);
  ctx.clip();
  ctx.strokeStyle = COLORS.trace;
  ctx.lineWidth = 1.4 / s;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    const px = cell.xMm + (i - (cell.t0 / 1000) * fs) * mmPerSample;
    const py = cell.baselineMm - (x[i] - offset) * mmPerUv;
    if (i === i0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // 导联名
  ctx.fillStyle = COLORS.label;
  ctx.font = `600 ${3.2}px system-ui, sans-serif`;
  ctx.fillText(cell.lead, cell.xMm + 1, cell.topMm + 4);

  // 列分隔短竖线（标准心电图纸的导联切换标记）
  if (!cell.rhythm && cell.col > 0) {
    ctx.strokeStyle = COLORS.trace;
    ctx.lineWidth = 1.4 / s;
    ctx.beginPath();
    ctx.moveTo(cell.xMm, cell.baselineMm - 2.5);
    ctx.lineTo(cell.xMm, cell.baselineMm + 2.5);
    ctx.stroke();
  }
}
