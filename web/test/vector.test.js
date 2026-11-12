import { describe, it, expect } from 'vitest';
import {
  FRONTAL_AXES,
  frontalVector,
  projectFrontal,
  frontalAngle,
  korsVector,
} from '../src/vcg/vector.js';
import { locate } from '../src/ecg/beats.js';
import { qtcFramingham, qtcHodges, qtcBazett } from '../src/ecg/measures.js';

/** 按 Einthoven 三角形由额面向量（幅度 E，角度 φ）生成 6 个肢体导联 */
function limbLeads(E, deg) {
  const r = (deg * Math.PI) / 180;
  const I = E * Math.cos(r);
  const II = E * Math.cos(r - Math.PI / 3);
  const III = II - I;
  return { I, II, III, aVR: -(I + II) / 2, aVL: (I - III) / 2, aVF: (II + III) / 2 };
}

describe('额面向量与投影', () => {
  it.each([0, 37, 60, 90, 135, -45, -120])('电轴 %s° 时，投影 × 系数精确等于 6 个肢体导联电压', (deg) => {
    const leads = limbLeads(1000, deg);
    const v = frontalVector(leads);
    expect(frontalAngle(v)).toBeCloseTo(deg, 6);
    for (const ax of FRONTAL_AXES) expect(projectFrontal(v, ax)).toBeCloseTo(leads[ax.lead], 6);
  });
});

describe('Kors 重建', () => {
  it('只有 V6 有电压时，向量指向左、下、后（V6 系数均为正）', () => {
    const vals = { I: 0, II: 0, V1: 0, V2: 0, V3: 0, V4: 0, V5: 0, V6: 1000 };
    const k = korsVector(vals);
    expect(k.X).toBeCloseTo(540);
    expect(k.Y).toBeCloseTo(130);
    expect(k.Z).toBeCloseTo(310);
  });
});

describe('时相定位', () => {
  const beats = [
    { P: { on: 100, off: 200 }, QRS: { on: 260, off: 350 }, T: { on: 450, off: 650 } },
    { P: { on: 900, off: 1000 }, QRS: { on: 1060, off: 1150 }, T: { on: 1250, off: 1450 } },
  ];
  it.each([
    [150, 'P', 0],
    [230, 'PR', 0],
    [300, 'QRS', 0],
    [400, 'ST', 0],
    [550, 'T', 0],
    [800, 'TP', 0],
    [1100, 'QRS', 1],
  ])('%s ms → %s（第 %s 个心搏）', (t, phase, idx) => {
    const r = locate(beats, t);
    expect(r.phase).toBe(phase);
    expect(r.index).toBe(idx);
  });
  it('P 波中点的进度为 0.5', () => {
    expect(locate(beats, 150).frac).toBeCloseTo(0.5);
  });
  it('第一个心搏之前没有标注，返回 null', () => {
    expect(locate(beats, 50)).toBeNull();
  });
});

describe('QTc 其他公式', () => {
  it('RR = 1000 ms（心率 60）时，Framingham 与 Hodges 都等于 QT', () => {
    expect(qtcFramingham(400, 1000)).toBeCloseTo(400);
    expect(qtcHodges(400, 1000)).toBeCloseTo(400);
  });
  it('心率 100（RR 600 ms）、QT 360 ms', () => {
    expect(qtcFramingham(360, 600)).toBeCloseTo(421.6, 1);
    expect(qtcHodges(360, 600)).toBeCloseTo(430, 1);
    expect(qtcBazett(360, 600)).toBeCloseTo(464.8, 1);
  });
});
