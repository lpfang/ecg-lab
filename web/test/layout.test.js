import { describe, it, expect } from 'vitest';
import { computeLayout, hitTest, PAPER } from '../src/ecg/layout.js';
import { qtcBazett, qtcFridericia } from '../src/ecg/measures.js';

describe('心电图纸排版（mm / ms）', () => {
  const lay = computeLayout({ durationMs: 10000, speed: 25, gain: 10 });

  it('10 秒 @25 mm/s 的波形宽 250 mm', () => {
    expect(lay.widthMm).toBeCloseTo(lay.marginLeftMm + 250 + PAPER.marginRightMm);
  });

  it.each([25, 50])('%s mm/s 时标定脉冲（200 ms）完整位于波形左侧，并留有间隔', (speed) => {
    const l = computeLayout({ durationMs: 10000, speed, gain: 10 });
    expect(l.calPulseWidthMm).toBeCloseTo(0.2 * speed);
    const pulseEnd = PAPER.calPulseLeadMm + l.calPulseWidthMm;
    const firstTrace = Math.min(...l.cells.map((c) => c.xMm));
    expect(firstTrace - pulseEnd).toBeGreaterThanOrEqual(PAPER.calPulseGapMm - 1e-9);
  });

  it('3×4 排版 + 节律条共 13 个格子，每列 2.5 s', () => {
    expect(lay.cells).toHaveLength(13);
    const v1 = lay.cells.find((c) => c.lead === 'V1');
    expect([v1.t0, v1.t1]).toEqual([5000, 7500]);
    expect(v1.widthMm).toBeCloseTo(62.5);
  });

  it('1 mm 横向 = 40 ms，1 mm 纵向 = 0.1 mV', () => {
    const c = lay.cells.find((c) => c.lead === 'I');
    const a = hitTest(lay, c.xMm + 10, c.baselineMm);
    const b = hitTest(lay, c.xMm + 11, c.baselineMm - 1);
    expect(b.tMs - a.tMs).toBeCloseTo(40);
    expect(b.mV - a.mV).toBeCloseTo(0.1);
  });

  it('50 mm/s 时 1 mm = 20 ms；20 mm/mV 时 1 mm = 0.05 mV', () => {
    const l2 = computeLayout({ durationMs: 10000, speed: 50, gain: 20 });
    const c = l2.cells.find((c) => c.lead === 'II' && !c.rhythm);
    const a = hitTest(l2, c.xMm + 10, c.baselineMm);
    const b = hitTest(l2, c.xMm + 11, c.baselineMm - 1);
    expect(b.tMs - a.tMs).toBeCloseTo(20);
    expect(b.mV - a.mV).toBeCloseTo(0.05);
  });

  it('节律条是 II 导联完整 10 秒', () => {
    const r = lay.cells.find((c) => c.rhythm);
    expect(r.lead).toBe('II');
    expect([r.t0, r.t1]).toEqual([0, 10000]);
  });
});

describe('QTc', () => {
  it('RR = 1000 ms 时校正值等于 QT', () => {
    expect(qtcBazett(400, 1000)).toBeCloseTo(400);
    expect(qtcFridericia(400, 1000)).toBeCloseTo(400);
  });
  it('心率快（RR 600 ms）时 Bazett 校正幅度大于 Fridericia', () => {
    expect(qtcBazett(360, 600)).toBeCloseTo(464.8, 1);
    expect(qtcFridericia(360, 600)).toBeCloseTo(426.8, 1);
  });
  it('缺值返回 null', () => {
    expect(qtcBazett(null, 800)).toBeNull();
  });
});
