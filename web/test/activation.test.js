import { describe, it, expect } from 'vitest';
import { ventAxes, ventAnchors, activationTime, VENT } from '../src/views/activation.js';

const at = (name) => ventAnchors().find((a) => a.name === name).pos;
const T = (name) => activationTime(at(name));
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

describe('示意心脏的方向', () => {
  it('室间隔方向指向患者右侧（右室在左室右前方），前方向量朝前', () => {
    const { s, a } = ventAxes();
    expect(s[0]).toBeLessThan(0);
    expect(a[2]).toBeGreaterThan(0);
  });
  it('心尖在左、下、前', () => {
    const [x, y, z] = VENT.apexDir;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
    expect(z).toBeGreaterThan(0);
  });
});

describe('心室除极顺序（Durrer 1970）', () => {
  it('锚点处插值等于锚点时间', () => {
    for (const an of ventAnchors()) expect(activationTime(an.pos)).toBeCloseTo(an.t, 6);
  });
  it('室间隔中部最早，左室后基底部最晚', () => {
    const ts = ventAnchors().map((a) => a.t);
    expect(T('左室面室间隔中部')).toBe(Math.min(...ts));
    expect(T('左室后基底部')).toBe(Math.max(...ts));
  });
  it('顺序：室间隔 < 心尖 < 右室游离壁 < 左室侧壁 < 室间隔基底部', () => {
    const seq = ['左室面室间隔中部', '左室心尖', '右室游离壁中部', '左室侧壁中部', '室间隔基底部'].map(T);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThan(seq[i - 1]);
  });
  it('锚点之间的点，激动时间介于两端之间（插值单调）', () => {
    const a = at('左室面室间隔中部');
    const b = at('左室侧壁中部');
    const mid = activationTime(lerp(a, b, 0.5));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(38);
  });
});
