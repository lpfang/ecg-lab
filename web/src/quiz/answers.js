// 标准答案：运行时从病例数据算出，页面与测试共用同一份代码。

import { leadInterval } from './grade.js';
import { FRONTAL_AXES, frontalVector, frontalAngle, beatBaseline, leadValuesAt } from '../vcg/vector.js';
import { cursorTime } from '../tours.js';
import { angleDiff } from './grade.js';

/** 心率：人工标注 RR 中位数（LUDB）；没有人工标注时用 Glasgow 算法 */
export function rateTruth(meta) {
  const man = meta.measurements?.find((m) => m.id === 'ludb')?.values;
  if (man?.RR_ms) return { bpm: 60000 / man.RR_ms, source: '医生人工标注的 RR 间期中位数' };
  const alg = meta.measurements?.find((m) => m.id === 'unig')?.values;
  return alg?.HR_bpm ? { bpm: alg.HR_bpm, source: 'Glasgow 自动分析算法' } : null;
}

/**
 * 电轴：Glasgow 算法与本站面积法的平均。两者相差较大时返回 null（这样的病例不出题）。
 */
export const AXIS_MAX_DISAGREE = 8;
export function axisTruth(meta) {
  const get = (id) => meta.measurements?.find((m) => m.id === id)?.values?.axis_deg;
  const a = get('unig');
  const b = get('area');
  if (a == null || b == null || Math.abs(angleDiff(a, b)) > AXIS_MAX_DISAGREE) return null;
  // 取两者的角平均，并规范到 (−180, 180]（例如 −175° 与 178° 的平均是 −178.5°，不是 181.5°）
  return { deg: angleDiff(b + angleDiff(a, b) / 2, 0), unig: a, area: b };
}

/**
 * 某一时刻的额面向量，以及最接近的导联轴正极。
 * margin：最近与次近两个轴的角度差之差，太小（< 10°）说明题目有歧义。
 */
export function vectorTruth(ecg, at) {
  const beats = ecg.meta.annotations?.beats ?? [];
  const t = cursorTime(beats, at);
  const beat = beats[Math.min(at.beat, beats.length - 1)];
  if (t == null || !beat) return null;
  const v = frontalVector(leadValuesAt(ecg, t, beatBaseline(ecg, beat)));
  const deg = frontalAngle(v);
  const ranked = FRONTAL_AXES.map((a) => ({ lead: a.lead, axisDeg: a.deg, off: Math.abs(angleDiff(deg, a.deg)) })).sort(
    (p, q) => p.off - q.off,
  );
  return { t, v, deg, lead: ranked[0].lead, ranked, margin: ranked[1].off - ranked[0].off };
}

/** 间期题的标准答案 */
export const intervalTruth = (meta, lead, kind) => leadInterval(meta, lead, kind);
