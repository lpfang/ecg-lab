import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateMeta, capabilitiesOf } from '../src/data.js';
import { computeLayout, layoutFor, LAYOUTS } from '../src/ecg/layout.js';

const read = (id) => JSON.parse(readFileSync(new URL(`../public/cases/${id}/meta.json`, import.meta.url), 'utf8'));

describe('监护条带病例（VFDB）', () => {
  for (const [id, sample, tMs] of [
    ['vfdb-423', 224615, 4460],
    ['vfdb-426', 161432, 3728],
  ]) {
    it(`${id}：元数据通过校验，节律标注位置由原始采样点推算`, () => {
      const m = validateMeta(read(id), id);
      expect(m.kind).toBe('strip');
      expect(m.strip.marks).toHaveLength(1);
      expect(m.strip.marks[0].sample).toBe(sample);
      expect(m.strip.marks[0].tMs).toBeCloseTo(((sample - m.strip.startSample) / m.fs) * 1000, 6);
      expect(m.strip.marks[0].tMs).toBeCloseTo(tMs, 6);
      // 波形文件大小与通道数、采样点数一致
      const buf = readFileSync(new URL(`../public/cases/${id}/${m.signal.file}`, import.meta.url));
      expect(buf.byteLength).toBe(m.leads.length * m.nSamples * 2);
    });
  }

  it('条带关闭逐搏、联动、测量与心率换算；普通病例缺省全部可用', () => {
    const c = capabilitiesOf(read('vfdb-426'));
    expect(Object.values(c).every((v) => v === false)).toBe(true);
    expect(Object.values(capabilitiesOf(read('ptbxl-33'))).every(Boolean)).toBe(true);
  });

  it('条带排版：每通道一行、完整 10 秒、上下同一时刻，显示"通道 1"', () => {
    const m = read('vfdb-423');
    const lay = computeLayout({ durationMs: m.durationMs, speed: 25, gain: 10, layout: layoutFor(m, 'sync') });
    expect(lay.cells).toHaveLength(2);
    expect(lay.cells.map((c) => c.name)).toEqual(['通道 1', '通道 2']);
    for (const c of lay.cells) expect([c.t0, c.t1, c.xMm]).toEqual([0, m.durationMs, lay.cells[0].xMm]);
    // 普通病例仍按用户选择的排版
    expect(layoutFor(read('ptbxl-33'), 'sync')).toBe(LAYOUTS.sync);
  });

  it('校验拒绝：12 导联病例缺导联、条带通道名不合规、标注超出片段', () => {
    const m = read('vfdb-423');
    expect(() => validateMeta({ ...m, leads: ['I', 'II'] }, 'x')).toThrow(/未知通道/);
    const bad = structuredClone(m);
    bad.strip.marks[0].tMs = 20000;
    expect(() => validateMeta(bad, 'x')).toThrow(/节律标注/);
    expect(() => validateMeta({ ...m, kind: undefined }, 'x')).toThrow(/未知导联/);
  });
});
