// 心电向量：由真实导联电压计算某一时刻的电向量，以及向量在导联轴上的投影。
//
// 坐标约定（与 Frank 导联一致）：X 向患者左侧为正，Y 向下（足侧）为正，Z 向后（背侧）为正。
// 额面角度：0° = 指向患者左侧（I 导联正极），顺时针为正（90° = 指向下方，aVF 正极）。

const S32 = Math.sqrt(3) / 2;

/**
 * 额面六轴系统。按 Einthoven / Goldberger 的几何关系：
 *   I = E·cos(φ)，II = E·cos(φ − 60°)，III = E·cos(φ − 120°)
 *   aVR / aVL / aVF = (√3/2)·E·cos(φ − θ)
 * 所以"投影 × scale"恰好等于该导联的电压（不是近似）。
 */
export const FRONTAL_AXES = [
  { lead: 'I', deg: 0, scale: 1 },
  { lead: 'II', deg: 60, scale: 1 },
  { lead: 'III', deg: 120, scale: 1 },
  { lead: 'aVR', deg: -150, scale: S32 },
  { lead: 'aVL', deg: -30, scale: S32 },
  { lead: 'aVF', deg: 90, scale: S32 },
];

/**
 * 胸导联在水平面上的示意方向：角度从患者左侧（X+）起，转向前方（−Z）为正。
 * 真实方向因人而异，这里是教学示意，投影值不等于导联电压。
 */
export const CHEST_AXES = [
  { lead: 'V1', deg: 120 },
  { lead: 'V2', deg: 90 },
  { lead: 'V3', deg: 75 },
  { lead: 'V4', deg: 60 },
  { lead: 'V5', deg: 30 },
  { lead: 'V6', deg: 0 },
];

export const LIMB_LEADS = FRONTAL_AXES.map((a) => a.lead);
export const CHEST_LEADS = CHEST_AXES.map((a) => a.lead);

/**
 * Kors 回归矩阵：由 8 个独立导联重建 Frank X / Y / Z。
 * Kors JA, et al. Eur Heart J 1990;11:1083–1092。本站已用 PTB 数据库的真实 Frank 导联核对（docs/数据核查.md）。
 */
export const KORS = {
  I: [0.38, -0.07, 0.11],
  II: [-0.07, 0.93, -0.23],
  V1: [-0.13, 0.06, -0.43],
  V2: [0.05, -0.02, -0.06],
  V3: [-0.01, -0.05, -0.14],
  V4: [0.14, 0.06, -0.2],
  V5: [0.06, -0.17, -0.11],
  V6: [0.54, 0.13, 0.31],
};

/** 额面向量（单位同导联电压）。vals：{I, aVF, ...} */
export function frontalVector(vals) {
  return { x: vals.I, y: vals.aVF / S32 };
}

/** 额面向量在某导联轴上的投影 × 系数 = 该导联电压 */
export function projectFrontal(v, axis) {
  const r = (axis.deg * Math.PI) / 180;
  return (v.x * Math.cos(r) + v.y * Math.sin(r)) * axis.scale;
}

/** 向量的额面角度（°，−180..180） */
export function frontalAngle(v) {
  return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

/** Kors 重建的空间向量 {X, Y, Z} */
export function korsVector(vals) {
  const out = [0, 0, 0];
  for (const [lead, c] of Object.entries(KORS)) {
    const v = vals[lead];
    out[0] += c[0] * v;
    out[1] += c[1] * v;
    out[2] += c[2] * v;
  }
  return { X: out[0], Y: out[1], Z: out[2] };
}

/** 空间向量在水平面（X 与前方 −Z）上的分量 */
export function horizontalVector(k) {
  return { x: k.X, y: -k.Z };
}

/** 水平面向量在胸导联示意轴上的投影 */
export function projectHorizontal(h, axis) {
  const r = (axis.deg * Math.PI) / 180;
  return h.x * Math.cos(r) + h.y * Math.sin(r);
}

/**
 * 读取某时刻各导联电压（µV），减去本心搏的等电位基线（PR 段）。
 * @param ecg loadCase() 的返回值
 * @param baseline {lead: µV} 本心搏基线
 */
export function leadValuesAt(ecg, t, baseline) {
  const vals = {};
  for (const lead of ecg.meta.leads) vals[lead] = ecg.valueAt(lead, t) - (baseline?.[lead] ?? 0);
  return vals;
}

/** 本心搏的等电位基线：QRS 起点前 PR 段内的中位数（避开 P 波） */
export function beatBaseline(ecg, beat) {
  const qOn = beat.QRS.on;
  const a = beat.P ? Math.max(beat.P.off, qOn - 40) : qOn - 40;
  const z = qOn - 4;
  const out = {};
  for (const lead of ecg.meta.leads) {
    const xs = [];
    for (let t = a; t <= z; t += 1000 / ecg.fs) xs.push(ecg.valueAt(lead, t));
    xs.sort((p, q) => p - q);
    out[lead] = xs.length ? xs[xs.length >> 1] : ecg.valueAt(lead, qOn);
  }
  return out;
}
