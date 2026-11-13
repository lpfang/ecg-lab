// 中位心搏与"与正常对照"配置的检查
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { medianBeat, medianAt } from '../src/ecg/median.js';
import { COMPARE, NORMAL_REF, refFor } from '../src/content/compare.js';
import { load } from './helpers.js';

const CASES = new URL('../public/cases/', import.meta.url);
const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

/** 合成心电图：每 800 ms 一个三角形 QRS（高 1000 µV），叠加一条缓慢漂移的基线 */
function synthetic() {
  const fs = 500;
  const n = 10 * fs;
  const a = new Float32Array(n);
  const beats = [];
  for (let on = 400; on + 700 < 10000; on += 800) {
    beats.push({ P: { on: on - 160, off: on - 60 }, QRS: { on, off: on + 80 }, T: { on: on + 200, off: on + 360 } });
  }
  for (let i = 0; i < n; i++) {
    const t = (i / fs) * 1000;
    let v = 300 * Math.sin(t / 3000); // 漂移
    for (const b of beats) {
      const d = t - b.QRS.on;
      if (d >= 0 && d <= 80) v += 1000 * (1 - Math.abs(d - 40) / 40);
    }
    a[i] = v;
  }
  const meta = { leads: ['II'], annotations: { beats } };
  return {
    meta,
    fs,
    durationMs: 10000,
    lead: () => a,
    valueAt(l, t) {
      const x = (t / 1000) * fs;
      const i = Math.max(0, Math.min(n - 2, Math.floor(x)));
      return a[i] + (a[i + 1] - a[i]) * (x - i);
    },
  };
}

describe('medianBeat', () => {
  it('按 QRS 起点对齐，减去 PR 段零点后，基线漂移不进入中位心搏', () => {
    const mb = medianBeat(synthetic());
    expect(mb.nBeats).toBeGreaterThan(8);
    expect(medianAt(mb, 'II', 40)).toBeCloseTo(1000, -1.5); // 峰值约 1000 µV
    expect(Math.abs(medianAt(mb, 'II', -20))).toBeLessThan(15); // QRS 前回到零点
    expect(mb.waves.QRS).toEqual({ on: 0, off: 80 });
    expect(mb.waves.P).toEqual({ on: -160, off: -60 });
  });

  it('房颤病例没有 P 波边界', () => {
    const mb = medianBeat(load('ptbxl-8215'));
    expect(mb.waves.P).toBeUndefined();
  });
});

describe('与正常对照的配置', () => {
  const index = JSON.parse(readFileSync(new URL('index.json', CASES), 'utf8')).cases;

  it('正常对照病例存在，且确为正常心电图、性别对应', () => {
    for (const [sex, r] of Object.entries(NORMAL_REF)) {
      const m = JSON.parse(readFileSync(new URL(`${r.id}/meta.json`, CASES), 'utf8'));
      expect(m.patient.sex).toBe(sex);
      expect(m.diagnoses.map((d) => d.code ?? d)).toContain('NORM');
      expect(r.label).toContain(m.patient.age);
    }
  });

  it('除正常组外，每个病例都有对照配置', () => {
    for (const c of index) {
      if (c.quizOnly) continue; // 测验专用病例（LUDB，幅度被归一化）不参与对照
      if (c.group === '正常') expect(COMPARE[c.id]).toBeUndefined();
      else expect(COMPARE[c.id], c.id).toBeTruthy();
    }
  });

  it.each(Object.entries(COMPARE))('%s：病例存在，导联、模式、文字有效', (id, cfg) => {
    expect(existsSync(new URL(`${id}/meta.json`, CASES))).toBe(true);
    expect(['beat', 'rhythm']).toContain(cfg.mode);
    for (const l of cfg.leads) expect(LEADS).toContain(l);
    expect([10, 20]).toContain(cfg.gain);
    expect(cfg.plain.length).toBeGreaterThan(20);
    expect(cfg.pro.length).toBeGreaterThan(20);
  });

  it.each(Object.entries(COMPARE).filter(([, c]) => c.mode === 'beat'))('%s：中位心搏可以计算', (id) => {
    const e = load(id);
    const mb = medianBeat(e);
    expect(mb.nBeats).toBeGreaterThanOrEqual(5);
    expect(medianBeat(load(refFor(e.meta.patient.sex).id)).nBeats).toBeGreaterThanOrEqual(5);
  });
});
