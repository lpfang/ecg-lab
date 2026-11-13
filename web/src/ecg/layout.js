// 心电图纸排版：全部以 mm 和 ms 为单位，与屏幕像素无关。

/** 标准 12 导联 3×4 排版（每列 2.5 s）+ II 导联 10 s 节律条 */
export const STANDARD_3x4 = {
  id: '3x4+II',
  columns: 4,
  rows: [
    ['I', 'aVR', 'V1', 'V4'],
    ['II', 'aVL', 'V2', 'V5'],
    ['III', 'aVF', 'V3', 'V6'],
  ],
  rhythm: ['II'],
};

export const PAPER = {
  minorMm: 1,
  majorMm: 5,
  calPulseLeadMm: 2, // 标定脉冲前的基线
  calPulseGapMm: 3, // 标定脉冲与波形之间的间隔
  minMarginLeftMm: 10,
  marginRightMm: 4,
  marginTopMm: 4,
  marginBottomMm: 4,
  rowMvSpan: 3, // 每行占 3 mV 的高度（10 mm/mV 时 30 mm）
  calPulseMs: 200, // 标定脉冲宽 200 ms，高 1 mV
  // 上下两行之间的空白间隙（不画网格），各行一眼分开。
  // 左右两列之间不留间隙，只画分割线：列间隙会让上面各行与下面的节律条在时间上错位。
  rowGapMm: 4,
};

/**
 * 计算排版：返回每个"格子"（某导联某时间段）在纸上的 mm 位置。
 * @param {{durationMs:number, speed:number, gain:number, layout?:object}} opt
 *   speed：走纸速度 mm/s；gain：增益 mm/mV
 */
export function computeLayout({ durationMs, speed, gain, layout = STANDARD_3x4 }) {
  const P = PAPER;
  // 标定脉冲宽度随走纸速度变化（200 ms：25 mm/s 时 5 mm，50 mm/s 时 10 mm），左边距要能放下它
  const calPulseWidthMm = (P.calPulseMs / 1000) * speed;
  const marginLeftMm = Math.max(P.minMarginLeftMm, P.calPulseLeadMm + calPulseWidthMm + P.calPulseGapMm);
  const traceWidthMm = (durationMs / 1000) * speed;
  const colMs = durationMs / layout.columns;
  const rowHeightMm = P.rowMvSpan * gain;
  const allRows = [
    ...layout.rows.map((leads) => ({ leads, rhythm: false })),
    ...layout.rhythm.map((lead) => ({ leads: [lead], rhythm: true })),
  ];
  const cells = [];
  const rows = allRows.map((row, r) => {
    const top = P.marginTopMm + r * (rowHeightMm + P.rowGapMm);
    const baselineMm = top + rowHeightMm * 0.6; // 基线略偏下，给 R 波留空间
    const n = row.leads.length;
    row.leads.forEach((lead, c) => {
      const t0 = row.rhythm ? 0 : c * colMs;
      const t1 = row.rhythm ? durationMs : (c + 1) * colMs;
      cells.push({
        lead,
        row: r,
        col: c,
        rhythm: row.rhythm,
        t0,
        t1,
        xMm: marginLeftMm + (t0 / 1000) * speed,
        widthMm: ((t1 - t0) / 1000) * speed,
        baselineMm,
        topMm: top,
        heightMm: rowHeightMm,
        last: c === n - 1,
      });
    });
    return { top, baselineMm, rhythm: row.rhythm };
  });
  const widthMm = marginLeftMm + traceWidthMm + P.marginRightMm;
  const heightMm = P.marginTopMm + allRows.length * rowHeightMm + (allRows.length - 1) * P.rowGapMm + P.marginBottomMm;
  // 行间隙矩形（绘图时涂成空白），横贯整张纸
  const gaps = rows.slice(1).map((row) => ({ x: 0, y: row.top - P.rowGapMm, w: widthMm, h: P.rowGapMm }));
  return {
    widthMm,
    heightMm,
    rows,
    cells,
    gaps,
    speed,
    marginLeftMm,
    calPulseWidthMm,
    gain,
  };
}

/** 纸上 mm 坐标 → 该格子中的时间（ms）与电压（mV）；不在任何格子内返回 null */
export function hitTest(lay, xMm, yMm) {
  for (const c of lay.cells) {
    if (xMm >= c.xMm && xMm < c.xMm + c.widthMm && yMm >= c.topMm && yMm < c.topMm + c.heightMm) {
      return {
        cell: c,
        tMs: c.t0 + ((xMm - c.xMm) / lay.speed) * 1000,
        mV: (c.baselineMm - yMm) / lay.gain,
      };
    }
  }
  return null;
}
