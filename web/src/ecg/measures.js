// 心率校正 QT（QTc）。RR 和 QT 单位均为 ms，返回 ms。
// 出处：Bazett HC. Heart 1920;7:353–370；Fridericia LS. Acta Med Scand 1920;53:469–486。
// 多公式并列与偏差说明在 M1 完成。

export function qtcBazett(qtMs, rrMs) {
  if (!qtMs || !rrMs) return null;
  return qtMs / Math.sqrt(rrMs / 1000);
}

export function qtcFridericia(qtMs, rrMs) {
  if (!qtMs || !rrMs) return null;
  return qtMs / Math.cbrt(rrMs / 1000);
}
