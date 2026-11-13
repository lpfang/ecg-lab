// 测验判分：一律按物理单位（ms、度、次/分），与采样率、屏幕尺寸无关。
// 时间类答案只用 LUDB 的人工逐导联标注（见 docs/计划.md 第十节）。

/** 判分容差（物理单位） */
export const TOL = {
  edgeMs: 20, // P、QRS 起止点
  tEndMs: 30, // T 波终点：人工标注本身的差异就较大
  locateMs: 10, // "点出 P 波"：落在波内或边缘外 10 ms 内都算对
  intervalMs: 20, // PR、QRS 测量
  qtMs: 30, // QT 测量（含 T 波终点）
  axisDeg: 15,
  hrBpm: 10,
};

/** 某导联某类波的人工标注列表 */
export const wavesOf = (meta, lead, type) => (meta.annotations?.waves?.[lead] ?? []).filter((w) => w.type === type);

/** t 是否在人工标注覆盖的时间范围内（LUDB 只标注了中间一段） */
export function inAnnotatedRange(meta, t) {
  const r = meta.annotations?.annotatedRangeMs;
  return !r || (t >= r[0] && t <= r[1]);
}

/**
 * "在 X 导联上点出一个 P 波"
 * @returns {ok, wave（最近的那个波）, distMs（到波的距离，波内为 0）}
 */
export function gradeLocate(meta, lead, type, t, tol = TOL.locateMs) {
  const ws = wavesOf(meta, lead, type);
  if (!ws.length) return null;
  let best = null;
  for (const w of ws) {
    const d = t < w.on ? w.on - t : t > w.off ? t - w.off : 0;
    if (!best || d < best.distMs) best = { wave: w, distMs: d };
  }
  return { ...best, ok: best.distMs <= tol };
}

/**
 * "点出 V1 导联 QRS 波群的起点"
 * @returns {ok, truth（最近的标注时刻）, errMs（带符号：正 = 点晚了）}
 */
export function gradeEdge(meta, lead, type, edge, t, tol) {
  const ws = wavesOf(meta, lead, type);
  if (!ws.length) return null;
  const tolMs = tol ?? (type === 'T' && edge === 'off' ? TOL.tEndMs : TOL.edgeMs);
  let best = null;
  for (const w of ws) {
    const e = t - w[edge];
    if (!best || Math.abs(e) < Math.abs(best.errMs)) best = { truth: w[edge], wave: w, errMs: e };
  }
  return { ...best, ok: Math.abs(best.errMs) <= tolMs, tolMs };
}

/**
 * 某导联上逐个心搏的间期（人工标注），取中位数作为标准答案。
 * PR：P 起点 → 其后第一个 QRS 起点；QRS：起点 → 终点；QT：QRS 起点 → 其后第一个 T 终点
 */
export function leadInterval(meta, lead, kind) {
  const P = wavesOf(meta, lead, 'P');
  const Q = wavesOf(meta, lead, 'QRS');
  const T = wavesOf(meta, lead, 'T');
  const xs = [];
  if (kind === 'QRS') for (const q of Q) xs.push(q.off - q.on);
  if (kind === 'PR')
    for (const p of P) {
      const q = Q.find((x) => x.on >= p.off && x.on - p.on < 400); // P 终点可以正好等于 QRS 起点
      if (q) xs.push(q.on - p.on);
    }
  if (kind === 'QT')
    for (const q of Q) {
      const t = T.find((x) => x.on >= q.off && x.on - q.off < 400);
      if (t) xs.push(t.off - q.on);
    }
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return { median: n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2, min: s[0], max: s[n - 1], n };
}

/** 数值题（间期 ms、心率 次/分） */
export function gradeNumber(value, truth, tol) {
  if (value == null || Number.isNaN(value)) return null;
  const err = value - truth;
  return { ok: Math.abs(err) <= tol, err, tol };
}

/** 两个角度之差，结果在 (−180, 180] */
export const angleDiff = (a, b) => {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};

/** 电轴题：按角度差判分（−170° 与 +175° 只差 15°） */
export function gradeAxis(value, truth, tol = TOL.axisDeg) {
  if (value == null || Number.isNaN(value)) return null;
  const err = angleDiff(value, truth);
  return { ok: Math.abs(err) <= tol, err, tol };
}
