import { describe, it, expect } from 'vitest';
import { MI_EVOLUTION } from '../src/content/mi.js';
import { beatMv, lerpW, BEAT } from '../src/views/mievo.js';
import { REFS } from '../src/content/refs.js';

const by = Object.fromEntries(MI_EVOLUTION.map((s) => [s.id, s]));
const minIn = (w, a, b) => Math.min(...Array.from({ length: b - a }, (_, i) => beatMv(w, a + i)));
const at = (w, x) => beatMv(w, x);

describe('心梗演变示意动画', () => {
  it('阶段顺序固定：正常 → 超急性 T → ST 抬高 → Q 波 → T 倒置 → 陈旧期', () => {
    expect(MI_EVOLUTION.map((s) => s.id)).toEqual(['normal', 'hyperacute', 'st', 'q', 'tinv', 'old']);
  });

  it('每个阶段的参数键一致，可以插值', () => {
    const keys = Object.keys(MI_EVOLUTION[0].w).sort();
    for (const s of MI_EVOLUTION) expect(Object.keys(s.w).sort()).toEqual(keys);
    const mid = lerpW(by.normal.w, by.st.w, 0.5);
    expect(mid.st).toBeCloseTo(by.st.w.st / 2);
  });

  it('波形特征与各阶段文字一致', () => {
    const tPeak = (s) => at(s.w, BEAT.t);
    const stLevel = (s) => at(s.w, BEAT.j + 40);
    const qDepth = (s) => -minIn(s.w, BEAT.q - 40, BEAT.r);
    expect(tPeak(by.hyperacute)).toBeGreaterThan(2 * tPeak(by.normal));
    expect(stLevel(by.st)).toBeGreaterThan(0.3);
    expect(stLevel(by.normal)).toBeLessThan(0.05);
    expect(qDepth(by.q)).toBeGreaterThan(3 * qDepth(by.normal));
    expect(stLevel(by.q)).toBeGreaterThan(0.2); // 文字：此时 ST 段可能仍然抬高
    expect(tPeak(by.tinv)).toBeLessThan(-0.2);
    expect(Math.abs(stLevel(by.tinv))).toBeLessThan(0.1);
    expect(qDepth(by.old)).toBeGreaterThan(3 * qDepth(by.normal)); // Q 波可能保留（示意图画为保留）
    expect(tPeak(by.old)).toBeGreaterThan(0); // 实线：T 恢复直立
    expect(at({ ...by.old.w, ...by.old.alt }, BEAT.t)).toBeLessThan(0); // 虚线：一直倒置
  });

  it('心搏首尾回到基线（两个心搏之间不跳变）', () => {
    for (const s of MI_EVOLUTION) {
      expect(Math.abs(beatMv(s.w, 0))).toBeLessThan(0.01);
      expect(Math.abs(beatMv(s.w, BEAT.len))).toBeLessThan(0.01);
    }
  });

  it('文字里引用的来源都在参考文献表里', () => {
    expect(REFS.udmi4).toBeTruthy();
    expect(REFS.aha6).toBeTruthy();
  });
});

describe('患者篇说明', () => {
  it('每个阶段都有大白话说明', () => {
    for (const s of MI_EVOLUTION) expect(s.plain?.length).toBeGreaterThan(10);
  });
});
