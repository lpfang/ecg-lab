import { describe, it, expect } from 'vitest';
import { evaluateLVH, lvhApplicability } from '../src/ecg/lvh.js';

const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const amp = (over = {}) => {
  const a = Object.fromEntries(LEADS.map((l) => [l, { R: 0.5, S: 0.3 }]));
  for (const [l, v] of Object.entries(over)) a[l] = { ...a[l], ...v };
  return a;
};
const get = (res, id) => res.find((r) => r.id === id);

describe('左心室肥厚电压标准', () => {
  it('Sokolow-Lyon：S(V1) + 较大的 R(V5/V6)，≥ 3.5 mV 为达到', () => {
    const r = evaluateLVH(amp({ V1: { S: 2.0 }, V5: { R: 1.5 }, V6: { R: 1.2 } }), 'M');
    expect(get(r, 'sokolow').value).toBeCloseTo(3.5);
    expect(get(r, 'sokolow').met).toBe(true);
    const r2 = evaluateLVH(amp({ V1: { S: 1.9 }, V5: { R: 1.5 } }), 'M');
    expect(get(r2, 'sokolow').met).toBe(false);
  });
  it('Cornell：阈值男性 > 2.8、女性 > 2.0（等于阈值不算）', () => {
    const a = amp({ aVL: { R: 1.0 }, V3: { S: 1.5 } }); // 2.5 mV
    expect(get(evaluateLVH(a, 'M'), 'cornell').met).toBe(false);
    expect(get(evaluateLVH(a, 'F'), 'cornell').met).toBe(true);
    const eq = amp({ aVL: { R: 1.0 }, V3: { S: 1.0 } }); // 恰好 2.0
    expect(get(evaluateLVH(eq, 'F'), 'cornell').met).toBe(false);
  });
  it('Peguero：任一导联最深 S + S(V4)，男性 ≥ 2.8、女性 ≥ 2.3', () => {
    const a = amp({ V2: { S: 1.6 }, V4: { S: 0.8 } }); // 2.4
    expect(get(evaluateLVH(a, 'M'), 'peguero').value).toBeCloseTo(2.4);
    expect(get(evaluateLVH(a, 'M'), 'peguero').met).toBe(false);
    expect(get(evaluateLVH(a, 'F'), 'peguero').met).toBe(true);
  });
  it('性别未知时按男性阈值，并标记', () => {
    const r = evaluateLVH(amp(), null);
    expect(get(r, 'cornell').threshold).toBe(2.8);
    expect(get(r, 'cornell').sexAssumed).toBe(true);
    expect(get(r, 'sokolow').sexAssumed).toBeFalsy();
  });
  it('缺导联时返回 null', () => {
    const a = amp();
    delete a.V4;
    expect(evaluateLVH(a, 'M')).toBeNull();
  });
  it('左束支阻滞时不适用，右束支阻滞时提示谨慎', () => {
    expect(lvhApplicability(['CLBBB', 'SR']).invalid.length).toBe(1);
    expect(lvhApplicability(['CRBBB', 'SR']).caution.length).toBe(1);
    expect(lvhApplicability(['NORM']).invalid.length).toBe(0);
  });
});
