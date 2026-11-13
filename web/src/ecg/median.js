// 中位心搏（median beat）：把一份记录里的多个心搏按 QRS 起点（或 P 波起点）对齐，逐点取中位数，
// 得到一个"典型心跳"。偶发的噪声、个别早搏的影响会被压低，适合两份心电图之间对照。
// 每个心搏先减去自己的零点（PR 段，见 vcg/vector.js beatBaseline），基线漂移不会混进来。

import { beatBaseline } from '../vcg/vector.js';

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * @param ecg   loadCase() 的结果
 * @param opts  {pre, post, align}：对齐点之前 / 之后取多少毫秒；align 'QRS'（默认）或 'P'
 * @returns {pre, post, step, align, nBeats, leads:{导联: Float32Array（µV）}, waves:{P?, QRS?, T?}}
 *          waves 中的时间都相对对齐点（ms），取各心搏的中位数
 */
export function medianBeat(ecg, { pre = 360, post = 640, align = 'QRS' } = {}) {
  const at = (b) => b[align]?.on;
  const beats = (ecg.meta.annotations?.beats ?? []).filter(
    (b) => b.QRS?.on != null && at(b) != null && at(b) - pre >= 0 && at(b) + post <= ecg.durationMs,
  );
  if (!beats.length) return null;
  const step = 1000 / ecg.fs;
  const n = Math.round((pre + post) / step) + 1;
  const bases = beats.map((b) => beatBaseline(ecg, b));
  const leads = {};
  for (const lead of ecg.meta.leads) {
    const out = new Float32Array(n);
    const col = new Array(beats.length);
    for (let i = 0; i < n; i++) {
      const dt = -pre + i * step;
      for (let k = 0; k < beats.length; k++) col[k] = ecg.valueAt(lead, at(beats[k]) + dt) - bases[k][lead];
      out[i] = median(col);
    }
    leads[lead] = out;
  }
  // 波段边界：只在多数心搏都有该波时给出（房颤没有 P 波）
  const rel = (type, key) => {
    const xs = beats.filter((b) => b[type]?.[key] != null).map((b) => b[type][key] - at(b));
    return xs.length * 2 > beats.length ? median(xs) : null;
  };
  const waves = {};
  for (const type of ['P', 'QRS', 'T']) {
    const on = rel(type, 'on');
    const off = rel(type, 'off');
    if (on != null && off != null && on >= -pre && off <= post) waves[type] = { on, off };
  }
  return { pre, post, step, align, nBeats: beats.length, leads, waves };
}

/** 中位心搏在相对时间 t（ms，相对对齐点）处的值（µV） */
export function medianAt(mb, lead, t) {
  const a = mb.leads[lead];
  const x = (t + mb.pre) / mb.step;
  const i = Math.max(0, Math.min(a.length - 2, Math.floor(x)));
  const f = Math.max(0, Math.min(1, x - i));
  return a[i] * (1 - f) + a[i + 1] * f;
}
