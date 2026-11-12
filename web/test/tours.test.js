// 导览数据与真实病例数据的一致性检查：导览文字里的"本例……"必须能用本例数据填出来。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TOURS, fillTemplate, cursorTime } from '../src/tours.js';
import { evaluateLVH } from '../src/ecg/lvh.js';

const CASES = new URL('../public/cases/', import.meta.url);
const meta = (id) => JSON.parse(readFileSync(new URL(`${id}/meta.json`, CASES), 'utf8'));
const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

describe.each(TOURS)('导览 $id', (t) => {
  // 与播放器相同的继承规则：病例沿用此前最近一步
  let current = null;
  const steps = t.steps.map((s, i) => {
    if (s.case) current = s.case;
    return { ...s, i, caseId: current };
  });

  it('第一步指定了病例，且所有病例都存在', () => {
    expect(t.steps[0].case).toBeTruthy();
    for (const s of steps) expect(existsSync(new URL(`${s.caseId}/meta.json`, CASES))).toBe(true);
  });

  it.each(steps)('第 $i 步：占位符都能用本例数据填出', (s) => {
    const m = meta(s.caseId);
    const own = m.amplitudes?.find((a) => a.id === 'area');
    const lvhBy = Object.fromEntries((m.amplitudes ?? []).map((a) => [a.id, evaluateLVH(a.values, m.patient.sex)]));
    const ctx = { meta: m, lvh: own ? lvhBy.area : null, lvhBy };
    for (const text of [s.plain, s.pro].filter(Boolean)) {
      const out = fillTemplate(text, ctx);
      expect(out).not.toMatch(/\{\w+(:\w+)?\}/); // 没有未识别的占位符
      if (/\{/.test(text)) expect(out).not.toContain('—'); // 用到的数据都存在
    }
  });

  it.each(steps.filter((s) => s.cursor))('第 $i 步：光标落在记录范围内', (s) => {
    const m = meta(s.caseId);
    const t0 = cursorTime(m.annotations.beats, s.cursor);
    expect(t0).toBeGreaterThan(0);
    expect(t0).toBeLessThan(m.durationMs);
  });

  it('导联名有效；卡尺的心搏存在', () => {
    for (const s of steps) {
      if (s.lead) expect(LEADS).toContain(s.lead);
      if (s.caliper) expect(meta(s.caseId).annotations.beats[s.caliper.to]).toBeTruthy();
    }
  });
});
