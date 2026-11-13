// Canvas 心电图纸。两层：
//   静态层（drawPaper）：网格、标定脉冲、导联名、波段着色、波形
//   叠加层（drawOverlay）：时间光标、卡尺 —— 拖动时只重画这一层
// 绘制坐标一律用 mm，乘以 pxPerMm（屏幕校准）和 devicePixelRatio 得到设备像素。

import { PAPER } from './layout.js';

export const WAVE_COLORS = {
  P: { band: 'rgba(37, 99, 235, 0.13)', line: '#1d4ed8' },
  QRS: { band: 'rgba(220, 38, 38, 0.11)', line: '#b91c1c' },
  T: { band: 'rgba(5, 150, 105, 0.13)', line: '#047857' },
};

const COLORS = {
  paper: '#fffaf8',
  gap: '#ffffff',
  selected: '#dc2626', // 选中导联的方框：红色实线（加粗，在粉红网格上才看得清）
  divider: '#ea580c', // 橙色：与粉红网格、黑色波形都区分得开
  minor: '#f5c9c4',
  major: '#e58f88',
  trace: '#111',
  label: '#333',
  cursor: '#7c3aed',
  caliper: '#0f766e',
};

export function setupCanvas(canvas, lay, pxPerMm) {
  const dpr = window.devicePixelRatio || 1;
  const wPx = lay.widthMm * pxPerMm;
  const hPx = lay.heightMm * pxPerMm;
  canvas.style.width = `${wPx}px`;
  canvas.style.height = `${hPx}px`;
  const w = Math.round(wPx * dpr);
  const h = Math.round(hPx * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  const s = pxPerMm * dpr; // mm → 设备像素
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  return { ctx, s };
}

/**
 * @param opts {showWaves:boolean}
 */
export function drawPaper(canvas, lay, ecg, pxPerMm, opts = {}) {
  const { ctx, s } = setupCanvas(canvas, lay, pxPerMm);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, lay.widthMm, lay.heightMm);
  drawGrid(ctx, lay, s);
  // 导联之间的间隙：盖掉网格，留白
  ctx.fillStyle = COLORS.gap;
  for (const g of lay.gaps ?? []) ctx.fillRect(g.x, g.y, g.w, g.h);
  for (const row of lay.rows) drawCalPulse(ctx, lay, row.baselineMm, s);
  const waves = opts.showWaves ? ecg.meta.annotations?.waves : null;
  for (const cell of lay.cells) drawCell(ctx, lay, cell, ecg, s, waves?.[cell.lead]);
  // 分割线画在最上面：画在下面会被波段底色冲淡
  drawColumnDividers(ctx, lay, s);
}

/** 12 导联各行中，左右两列之间的垂直分割线（节律条是连续的一条，不画） */
function drawColumnDividers(ctx, lay, s) {
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 2.2 / s;
  ctx.beginPath();
  for (const c of lay.cells) {
    if (c.rhythm || c.col === 0) continue;
    ctx.moveTo(c.xMm, c.topMm);
    ctx.lineTo(c.xMm, c.topMm + c.heightMm);
  }
  ctx.stroke();
}

export function drawGrid(ctx, lay, s) {
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
  if (PAPER.minorMm * s >= 3) lines(PAPER.minorMm, COLORS.minor, 1);
  lines(PAPER.majorMm, COLORS.major, 1.5);
}

function drawCalPulse(ctx, lay, baselineMm, s) {
  const x0 = PAPER.calPulseLeadMm;
  const w = lay.calPulseWidthMm; // 200 ms
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
  // 脉冲后的基线停在波形起点前 1 mm，留出空隙，避免与第一个波连在一起
  ctx.lineTo(lay.marginLeftMm - 1, baselineMm);
  ctx.stroke();
}

/** 时间（ms）→ 该格子内的 x（mm） */
export function xOf(lay, cell, t) {
  return cell.xMm + ((t - cell.t0) / 1000) * lay.speed;
}

/** 电压（µV，已去偏移）→ y（mm） */
export function yOf(lay, cell, uV) {
  return cell.baselineMm - (uV * lay.gain) / 1000;
}

function tracePath(ctx, lay, cell, ecg, tA, tB) {
  const { fs } = ecg;
  const x = ecg.lead(cell.lead);
  const off = ecg.offset(cell.lead);
  const i0 = Math.max(0, Math.floor((tA / 1000) * fs));
  const i1 = Math.min(x.length - 1, Math.ceil((tB / 1000) * fs));
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    const px = xOf(lay, cell, (i / fs) * 1000);
    const py = yOf(lay, cell, x[i] - off);
    if (i === i0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

function drawCell(ctx, lay, cell, ecg, s, waves) {
  ctx.save();
  // 波形可以超出本行（高电压时与真实心电图纸一样会重叠），但不超出本列
  ctx.beginPath();
  ctx.rect(cell.xMm, 0, cell.widthMm, lay.heightMm);
  ctx.clip();

  const inCell = (waves ?? []).filter((w) => w.off > cell.t0 && w.on < cell.t1);
  // 波段底色：只占本行高度
  for (const w of inCell) {
    ctx.fillStyle = WAVE_COLORS[w.type].band;
    const xa = xOf(lay, cell, Math.max(w.on, cell.t0));
    const xb = xOf(lay, cell, Math.min(w.off, cell.t1));
    ctx.fillRect(xa, cell.topMm + 0.5, xb - xa, cell.heightMm - 1);
  }

  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.4 / s;
  ctx.strokeStyle = COLORS.trace;
  tracePath(ctx, lay, cell, ecg, cell.t0, cell.t1);
  ctx.stroke();

  // 波段内的波形用对应颜色重描
  ctx.lineWidth = 1.7 / s;
  for (const w of inCell) {
    ctx.strokeStyle = WAVE_COLORS[w.type].line;
    tracePath(ctx, lay, cell, ecg, Math.max(w.on, cell.t0), Math.min(w.off, cell.t1));
    ctx.stroke();
  }
  // 节律条上标出波名：P、T 在第一行，QRS 在第二行（PR 段很短，同一行会挤在一起）
  if (cell.rhythm) {
    ctx.font = `600 2.6px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const w of inCell) {
      ctx.fillStyle = WAVE_COLORS[w.type].line;
      ctx.fillText(w.type, xOf(lay, cell, (w.on + w.off) / 2), cell.topMm + (w.type === 'QRS' ? 6 : 3));
    }
    ctx.textAlign = 'start';
  }
  ctx.restore();

  ctx.fillStyle = COLORS.label;
  ctx.font = `600 3.2px system-ui, sans-serif`;
  ctx.fillText(cell.lead, cell.xMm + 1, cell.topMm + (cell.rhythm ? 7 : 4));

}

/**
 * 叠加层：时间光标 + 卡尺。
 * @param st {cursorMs, selectedLead, caliper:{row, a:{t,mV}, b:{t,mV}, march:boolean}|null}
 */
export function drawOverlay(canvas, lay, ecg, pxPerMm, st) {
  const { ctx, s } = setupCanvas(canvas, lay, pxPerMm);

  // 参照基线：本次心跳的 PR 段零点（紫色虚线）与 TP 段电位（灰色虚线）
  const ref = st.refLines;
  if (ref) {
    for (const cell of lay.cells) {
      const a = Math.max(ref.t0, cell.t0);
      const z = Math.min(ref.t1, cell.t1);
      if (z <= a) continue;
      const line = (uV, color, dash, label) => {
        if (uV == null) return;
        const y = yOf(lay, cell, uV - ecg.offset(cell.lead));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2 / s;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(xOf(lay, cell, a), y);
        ctx.lineTo(xOf(lay, cell, z), y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (label && cell.rhythm) {
          ctx.fillStyle = color;
          ctx.font = '2.4px system-ui, sans-serif';
          ctx.fillText(label, xOf(lay, cell, z) + 0.8, y + (label.startsWith('TP') ? 2.6 : -0.6));
        }
      };
      line(ref.tp?.[cell.lead], '#78716c', [0.8, 0.8], 'TP 段');
      line(ref.pr?.[cell.lead], COLORS.cursor, [1.6, 0.8], 'PR 段零点');
    }
  }

  if (st.cursorMs != null) {
    for (const cell of lay.cells) {
      if (st.cursorMs < cell.t0 || st.cursorMs >= cell.t1) continue;
      const x = xOf(lay, cell, st.cursorMs);
      const sel = cell.lead === st.selectedLead;
      ctx.strokeStyle = COLORS.cursor;
      ctx.globalAlpha = sel ? 1 : 0.55;
      ctx.lineWidth = (sel ? 1.6 : 1) / s;
      ctx.beginPath();
      ctx.moveTo(x, cell.topMm + 1);
      ctx.lineTo(x, cell.topMm + cell.heightMm - 1);
      ctx.stroke();
      // 光标与波形交点
      const v = ecg.valueAt(cell.lead, st.cursorMs) - ecg.offset(cell.lead);
      ctx.fillStyle = COLORS.cursor;
      ctx.beginPath();
      ctx.arc(x, yOf(lay, cell, v), (sel ? 0.9 : 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 选中的导联加框
    for (const cell of lay.cells) {
      if (cell.lead !== st.selectedLead || cell.rhythm) continue;
      // 线宽按屏幕像素算（2.8 px），不随缩放变细；方框向内收半个线宽，四条边完整可见
      const w = 2.8 / s;
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = w;
      ctx.strokeRect(cell.xMm + w / 2, cell.topMm + w / 2, cell.widthMm - w, cell.heightMm - w);
    }
  }

  const c = st.caliper;
  if (c?.a && c?.b) drawCaliper(ctx, lay, c, s);
}

function drawCaliper(ctx, lay, c, s) {
  const row = lay.rows[c.row];
  const cells = lay.cells.filter((x) => x.row === c.row);
  const cellAt = (t) => cells.find((x) => t >= x.t0 && t < x.t1) ?? cells[cells.length - 1];
  const X = (t) => xOf(lay, cellAt(t), t);
  const Y = (mV) => row.baselineMm - mV * lay.gain;
  const top = row.top + 1;
  const bottom = row.top + PAPER.rowMvSpan * lay.gain - 1;
  const dt = c.b.t - c.a.t;

  ctx.strokeStyle = COLORS.caliper;
  ctx.fillStyle = COLORS.caliper;
  ctx.lineWidth = 1.3 / s;
  const vline = (t, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(X(t), top);
    ctx.lineTo(X(t), bottom);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  vline(c.a.t);
  vline(c.b.t);
  // 复制平移：按同样宽度向两侧重复，检查节律是否规整
  if (c.march && Math.abs(dt) > 40) {
    ctx.setLineDash([1, 1]);
    const rowStart = cells[0].t0;
    const rowEnd = cells[cells.length - 1].t1;
    for (let t = c.b.t + dt; dt > 0 ? t < rowEnd : t > rowStart; t += dt) vline(t, 0.7);
    for (let t = c.a.t - dt; dt > 0 ? t > rowStart : t < rowEnd; t -= dt) vline(t, 0.7);
    ctx.setLineDash([]);
  }
  // 横向标尺与电压差
  const yMid = top + 2;
  ctx.beginPath();
  ctx.moveTo(X(c.a.t), yMid);
  ctx.lineTo(X(c.b.t), yMid);
  ctx.stroke();
  ctx.setLineDash([0.8, 0.8]);
  ctx.beginPath();
  ctx.moveTo(X(c.a.t) - 1.5, Y(c.a.mV));
  ctx.lineTo(X(c.a.t) + 1.5, Y(c.a.mV));
  ctx.moveTo(X(c.b.t) - 1.5, Y(c.b.mV));
  ctx.lineTo(X(c.b.t) + 1.5, Y(c.b.mV));
  ctx.stroke();
  ctx.setLineDash([]);
}
