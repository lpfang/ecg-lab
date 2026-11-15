// 病例加载：元数据检查；ST 读数不取落进 T 波的时点
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { validateMeta } from '../src/data.js';

const meta = (id) => JSON.parse(fs.readFileSync(`public/cases/${id}/meta.json`, 'utf8'));
const ids = JSON.parse(fs.readFileSync('public/cases/index.json', 'utf8')).cases.map((c) => c.id);

describe('validateMeta', () => {
  it.each(ids)('%s 的元数据合格', (id) => expect(() => validateMeta(meta(id), id)).not.toThrow());
  it('拒绝坏的元数据', () => {
    const ok = meta('ptbxl-33');
    const bad = (patch) => () => validateMeta({ ...ok, ...patch }, 'x');
    expect(bad({ fs: 0 })).toThrow(/采样率/);
    expect(bad({ nSamples: 1.5 })).toThrow(/nSamples/);
    expect(bad({ leads: ['I', 'II', 'X'] })).toThrow(/未知导联/);
    expect(bad({ signal: { ...ok.signal, file: '../evil' } })).toThrow(/文件名/);
    expect(bad({ durationMs: 5000 })).toThrow(/时长/);
    expect(bad({ signal: { ...ok.signal, dtype: 'int16be' } })).toThrow(/int16le/);
    expect(bad({ signal: { ...ok.signal, unit: 'mV' } })).toThrow(/uV/);
    expect(bad({ signal: { ...ok.signal, layout: 'sample-major' } })).toThrow(/lead-major/);
    expect(bad({ leads: ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'] })).toThrow(/缺少导联 V1/);
    expect(bad({ issues: undefined })).toThrow(/issues/);
    expect(bad({ source: null })).toThrow(/source/);
    expect(bad({ annotations: { beats: [{ QRS: { on: 500, off: 400 } }] } })).toThrow(/心搏标注/);
  });
});

describe('ST（J + 80 ms）', () => {
  it('多数心搏落进 T 波的病例不给 J+80 数值，并标出比例', () => {
    for (const id of ['ptbxl-4117', 'ptbxl-9355']) {
      const v = meta(id).amplitudes.find((a) => a.id === 'area').values;
      expect(v.II.ST80, id).toBeNull();
      expect(v.II.ST80inT, id).toBeGreaterThan(0.5);
    }
  });
  it('没有 T 波标注时给固定时点读数，并标明无法确认', () => {
    const v = meta('ptbxl-8048').amplitudes.find((a) => a.id === 'area').values;
    expect(v.II.ST80).not.toBeNull();
    expect(v.II.ST80unconfirmed).toBe(1);
  });
  it('其余病例：本站 J+80 只来自 T 波起点之前', () => {
    const v = meta('ptbxl-33').amplitudes.find((a) => a.id === 'area').values;
    expect(v.V5.ST80).not.toBeNull();
  });
});

describe('S 波：R′ 比 R 高时不漏掉中间的深 S', () => {
  it('ptbxl-12605 V1 有 S 波', () => {
    const v = meta('ptbxl-12605').amplitudes.find((a) => a.id === 'area').values;
    expect(v.V1.S).toBeGreaterThan(0.5);
  });
});

describe('逐搏边界核对（pipeline check_boundaries）', () => {
  const med = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const n = s.length;
    return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  const TOL = { QRS: 25, QT: 40 };
  const span = { QRS: (b) => b.QRS.off - b.QRS.on, QT: (b) => (b.T ? b.T.off - b.QRS.on : null) };
  // 防止改了标注却没重建：逐搏中位数与算法相差超过阈值的病例，必须带 unreliable 标记，反之不带
  it.each(ids.filter((id) => id.startsWith('ptbxl-')))('%s 的 unreliable 标记与数据一致', (id) => {
    const m = meta(id);
    const algos = m.measurements.filter((x) => x.kind === 'algorithm').map((x) => x.values);
    for (const k of ['QRS', 'QT']) {
      const xs = m.annotations.beats.filter((b) => b.QRS).map(span[k]).filter((v) => v != null);
      const ref = algos.map((a) => a[`${k}_ms`]).filter(Boolean);
      const bad = xs.length > 0 && ref.length > 0 && Math.abs(med(xs) - med(ref)) >= TOL[k];
      expect(Boolean(m.annotations.unreliable?.[k]), k).toBe(bad);
    }
  });
});
