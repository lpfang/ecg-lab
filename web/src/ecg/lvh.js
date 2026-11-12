// 左心室肥厚（LVH）心电图电压标准。输入每导联振幅 {导联: {R, S}}（mV，S 取绝对值）与性别。
// 出处见 content/refs.js：sokolow、casale（Cornell）、peguero、aha5（AHA/ACCF/HRS 2009 第五部分）。
// 注意：电压标准敏感性较低（"没达到"不能排除左室肥厚），特异性较高；
// 左束支阻滞、预激、心室起搏等情况下不适用。

/** 束支阻滞等使电压标准不适用的诊断标签（PTB-XL SCP 编码） */
export const INVALIDATING = { CLBBB: '完全性左束支阻滞', WPW: '预激综合征' };
export const CAUTION = {
  CRBBB: '完全性右束支阻滞（部分标准仍可参考，但准确性下降）',
  LAFB: '左前分支阻滞（aVL 的 R 波会增高，影响 aVL R 波与 Cornell 标准）',
  ILBBB: '不完全性左束支阻滞（电压标准准确性下降）',
  IVCD: '室内传导延迟（电压标准准确性下降）',
};

const maxOf = (amp, leads, k) => Math.max(...leads.map((l) => amp[l]?.[k] ?? -Infinity));

export const LVH_CRITERIA = [
  {
    id: 'sokolow',
    name: 'Sokolow-Lyon',
    formula: 'S(V1) + 较大的 R(V5 或 V6)',
    threshold: () => 3.5,
    op: '≥',
    value: (a) => a.V1.S + Math.max(a.V5.R, a.V6.R),
    ref: 'sokolow',
  },
  {
    id: 'cornell',
    name: 'Cornell 电压',
    formula: 'R(aVL) + S(V3)',
    threshold: (sex) => (sex === 'F' ? 2.0 : 2.8),
    op: '>',
    value: (a) => a.aVL.R + a.V3.S,
    sexSpecific: true,
    ref: 'casale',
  },
  {
    id: 'ravl',
    name: 'aVL 导联 R 波',
    formula: 'R(aVL)',
    threshold: () => 1.1,
    op: '≥',
    value: (a) => a.aVL.R,
    ref: 'aha5',
  },
  {
    id: 'peguero',
    name: 'Peguero-Lo Presti',
    formula: '任一导联最深的 S + S(V4)',
    threshold: (sex) => (sex === 'F' ? 2.3 : 2.8),
    op: '≥',
    value: (a) => maxOf(a, Object.keys(a), 'S') + a.V4.S,
    sexSpecific: true,
    ref: 'peguero',
  },
];

/** 某一来源的振幅是否齐全（算法有时缺某些导联） */
function complete(a) {
  return ['V1', 'V3', 'V4', 'V5', 'V6', 'aVL'].every((l) => a?.[l] && a[l].R != null && a[l].S != null);
}

/**
 * @param amp {导联: {R, S}}
 * @param sex 'M' | 'F' | null（性别未知时，有性别差异的标准取男性阈值并注明）
 * @returns [{id, name, formula, value, threshold, met, sexAssumed}]
 */
export function evaluateLVH(amp, sex) {
  if (!complete(amp)) return null;
  return LVH_CRITERIA.map((c) => {
    const value = c.value(amp);
    const threshold = c.threshold(sex);
    const met = c.op === '>' ? value > threshold : value >= threshold;
    return { ...c, value, threshold, met, sexAssumed: c.sexSpecific && !sex };
  });
}

/** 病例的诊断标签中有使电压标准不适用 / 需谨慎的情况 */
export function lvhApplicability(codes) {
  const inval = codes.filter((c) => INVALIDATING[c]).map((c) => INVALIDATING[c]);
  const caution = codes.filter((c) => CAUTION[c]).map((c) => CAUTION[c]);
  return { invalid: inval, caution };
}
