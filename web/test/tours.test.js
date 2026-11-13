// 导览数据与真实病例数据的一致性检查：导览文字里的"本例……"必须能用本例数据填出来。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TOURS, fillTemplate, cursorTime, spotOf } from '../src/tours.js';
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

describe('导览聚光灯', () => {
  const PANELS = ['.paper-wrap', '.now-card', '.heart-card', '.axes-card', '.measure-card', '.compare-card'];
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const steps = TOURS.flatMap((t) => {
    let c = null;
    return t.steps.map((s, i) => {
      if (s.case) c = s.case;
      return { ...s, tour: t.id, i, caseId: c };
    });
  });

  it.each(steps)('$tour 第 $i 步：focus 指向页面上存在的面板', (s) => {
    const list = Array.isArray(s.focus) ? s.focus : s.focus ? [s.focus] : [];
    for (const sel of list) {
      expect(PANELS).toContain(sel);
      expect(html).toMatch(new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b`));
    }
  });

  it.each(steps.filter((s) => s.spot))('$tour 第 $i 步：心电图聚光灯的导联有效、心跳存在，且心电图面板未被调暗', (s) => {
    for (const l of s.spot.leads) expect(LEADS).toContain(l);
    const list = Array.isArray(s.focus) ? s.focus : [s.focus];
    expect(list).toContain('.paper-wrap');
    const m = meta(s.caseId);
    const r = spotOf(s.spot, m.annotations.beats, m.durationMs);
    if (s.spot.beat != null) {
      expect(r.t1 - r.t0).toBeGreaterThan(300);
      // 光标（若有）落在聚光灯时间窗内
      if (s.cursor) {
        const t = cursorTime(m.annotations.beats, s.cursor);
        expect(t).toBeGreaterThanOrEqual(r.t0);
        expect(t).toBeLessThanOrEqual(r.t1);
      }
    }
    if (s.lead) expect(s.spot.leads).toContain(s.lead);
  });
});
