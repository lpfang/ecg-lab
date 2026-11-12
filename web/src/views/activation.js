// 心室除极顺序（示意）：在示意心脏上设若干锚点，赋予文献中的相对激动时间，
// 其余位置按反距离加权插值。依据：Durrer D, et al. Total excitation of the isolated
// human heart. Circulation 1970;41:899–912（离体人心标测：左室面室间隔中部最早，
// 左室后基底部、室间隔基底部与右室流出道最晚，全程约 80 ms）。
//
// 坐标与 heart3d.js 相同：x = 患者左侧，y = 上方，z = 前方。这里只用普通数组，便于单元测试。

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 示意心室几何（heart3d.js 用同一组数值建模） */
export const VENT = {
  apexDir: norm([0.62, -0.58, 0.52]), // 心尖方向：左、下、前
  lv: { center: [0.18, -0.12, -0.05], radius: 0.62, scale: [0.85, 1.25, 0.85] },
  rv: { center: [-0.32, -0.08, 0.32], radius: 0.5, scale: [0.85, 1.05, 0.62] },
};

export const TOTAL_MS = 80; // 心室除极全程（Durrer 1970 约 80 ms）

/** 由几何推出各方向：u 心尖方向，s 室间隔方向（左室→右室），a 前方（与 u、s 垂直） */
export function ventAxes() {
  const u = VENT.apexDir;
  const d = sub(VENT.rv.center, VENT.lv.center);
  const s = norm(sub(d, mul(u, dot(d, u))));
  let a = norm(cross(u, s));
  if (a[2] < 0) a = mul(a, -1);
  return { u, s, a };
}

/** 锚点：位置 + 相对激动时间（ms） */
export function ventAnchors() {
  const { u, s, a } = ventAxes();
  const cL = VENT.lv.center;
  const cR = VENT.rv.center;
  const rL = VENT.lv.radius * VENT.lv.scale[0]; // 左室短半轴
  const lenL = VENT.lv.radius * VENT.lv.scale[1]; // 左室长半轴
  const rR = VENT.rv.radius * VENT.rv.scale[0];
  const lenR = VENT.rv.radius * VENT.rv.scale[1];
  const P = (...terms) => terms.reduce((p, t) => add(p, t), [0, 0, 0]);
  const septum = P(cL, mul(s, rL * 0.95));
  return [
    { name: '左室面室间隔中部', pos: septum, t: 0 },
    { name: '前间隔旁', pos: P(septum, mul(a, 0.3)), t: 5 },
    { name: '后间隔旁', pos: P(septum, mul(a, -0.3)), t: 5 },
    { name: '左室心尖', pos: P(cL, mul(u, lenL)), t: 22 },
    { name: '右室心尖', pos: P(cR, mul(u, lenR)), t: 22 },
    { name: '右室游离壁中部', pos: P(cR, mul(s, rR)), t: 25 },
    { name: '左室前壁中部', pos: P(cL, mul(a, rL)), t: 28 },
    { name: '左室侧壁中部', pos: P(cL, mul(s, -rL)), t: 38 },
    { name: '左室下后壁中部', pos: P(cL, mul(a, -rL)), t: 42 },
    { name: '室间隔基底部', pos: P(septum, mul(u, -lenL * 0.7)), t: 58 },
    { name: '右室流出道', pos: P(cR, mul(u, -lenR * 0.8), mul(a, 0.15)), t: 60 },
    { name: '左室侧壁基底部', pos: P(cL, mul(s, -rL * 0.8), mul(u, -lenL * 0.7)), t: 68 },
    { name: '左室后基底部', pos: P(cL, mul(u, -lenL * 0.75), mul(a, -rL * 0.8)), t: 75 },
  ];
}

/** 反距离加权插值：某点的相对激动时间（ms） */
export function activationTime(p, anchors = ventAnchors(), power = 3) {
  let wSum = 0;
  let tSum = 0;
  for (const an of anchors) {
    const d = Math.hypot(...sub(p, an.pos));
    if (d < 1e-6) return an.t;
    const w = 1 / d ** power;
    wSum += w;
    tSum += w * an.t;
  }
  return tSum / wSum;
}
