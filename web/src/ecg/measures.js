// 心率校正 QT（QTc）的四种常用公式。QT、RR 单位 ms，心率单位 次/分，返回 ms。
// 出处见 src/content/refs.js：bazett、fridericia、framingham、hodges。

export function qtcBazett(qtMs, rrMs) {
  if (!qtMs || !rrMs) return null;
  return qtMs / Math.sqrt(rrMs / 1000);
}

export function qtcFridericia(qtMs, rrMs) {
  if (!qtMs || !rrMs) return null;
  return qtMs / Math.cbrt(rrMs / 1000);
}

/** Framingham（Sagie 1992）：QTc = QT + 154 × (1 − RR[s]) */
export function qtcFramingham(qtMs, rrMs) {
  if (!qtMs || !rrMs) return null;
  return qtMs + 154 * (1 - rrMs / 1000);
}

/** Hodges：QTc = QT + 1.75 × (心率 − 60) */
export function qtcHodges(qtMs, rrMs) {
  if (!qtMs || !rrMs) return null;
  return qtMs + 1.75 * (60000 / rrMs - 60);
}

export const QTC_FORMULAS = [
  { id: 'bazett', zh: 'Bazett', fn: qtcBazett, expr: 'QT / √RR' },
  { id: 'fridericia', zh: 'Fridericia', fn: qtcFridericia, expr: 'QT / ∛RR' },
  { id: 'framingham', zh: 'Framingham', fn: qtcFramingham, expr: 'QT + 154 × (1 − RR)' },
  { id: 'hodges', zh: 'Hodges', fn: qtcHodges, expr: 'QT + 1.75 × (心率 − 60)' },
];
