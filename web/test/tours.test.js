// 导览数据与真实病例数据的一致性检查：导览文字里的"本例……"必须能用本例数据填出来。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TOURS, fillTemplate, cursorTime, cursorAt, spotOf } from '../src/tours.js';
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
    const t0 = cursorAt(m, s.cursor);
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
        const t = cursorAt(m, s.cursor);
        expect(t).toBeGreaterThanOrEqual(r.t0);
        expect(t).toBeLessThanOrEqual(r.t1);
      }
    }
    if (s.lead) expect(s.spot.leads).toContain(s.lead);
  });
});

describe('房室传导阻滞病例的手工 P 波标注', () => {
  const ids = JSON.parse(readFileSync(new URL('index.json', CASES), 'utf8'))
    .cases.map((c) => c.id)
    .filter((id) => meta(id).annotations?.atrial);

  it('至少有文氏型、3:1 和完全性三个病例', () => {
    expect(ids).toEqual(expect.arrayContaining(['ptbxl-1222', 'ptbxl-8048', 'ptbxl-959']));
  });

  it.each(ids)('%s：P 波规则、下传关系合理', (id) => {
    const m = meta(id);
    const { waves, conduction } = m.annotations.atrial;
    const beats = m.annotations.beats;
    // PP 间期规则（窦性心律）：都在中位数 ±15% 内
    const pp = waves.slice(1).map((w, i) => w.peak - waves[i].peak);
    const med = [...pp].sort((a, b) => a - b)[pp.length >> 1];
    for (const d of pp) expect(Math.abs(d - med) / med).toBeLessThan(0.15);
    // 下传的 P 波：PR 120–450 ms，且心搏上的 P 就是它；每个 QRS 最多被一个 P 波下传
    const used = new Set();
    for (const w of waves) {
      if (w.conducts == null) continue;
      const b = beats[w.conducts];
      expect(b.QRS.on - w.on).toBeGreaterThanOrEqual(120);
      expect(b.QRS.on - w.on).toBeLessThanOrEqual(450);
      expect(b.P.on).toBe(w.on);
      expect(used.has(w.conducts)).toBe(false);
      used.add(w.conducts);
    }
    // 没有被下传的心搏不能挂着别的 P 波（自动标注的 P 波已被替换）
    beats.forEach((b, i) => {
      if (!used.has(i)) expect(b.P).toBeUndefined();
    });
    if (conduction === 'none') expect(used.size).toBe(0);
    else expect(used.size).toBeGreaterThan(0);
    // 着色用的 P 波与手工标注一致（被遮住的不着色）
    const colored = m.annotations.waves.II.filter((x) => x.type === 'P').map((x) => x.peak);
    expect(colored).toEqual(waves.filter((w) => !w.hidden).map((w) => w.peak));
  });

  it('文氏型病例：每组内 PR 逐搏延长，脱落后恢复', () => {
    const m = meta('ptbxl-1222');
    const { waves } = m.annotations.atrial;
    const beats = m.annotations.beats;
    let prev = null;
    let drops = 0;
    for (const w of waves) {
      if (w.conducts == null) {
        drops++;
        prev = null;
        continue;
      }
      const pr = beats[w.conducts].QRS.on - w.on;
      if (prev != null) expect(pr).toBeGreaterThan(prev);
      prev = pr;
    }
    expect(drops).toBe(2);
  });

  it('高度阻滞病例：3:1 传导，下传 PR 固定', () => {
    const { waves } = meta('ptbxl-8048').annotations.atrial;
    const beats = meta('ptbxl-8048').annotations.beats;
    waves.forEach((w, i) => expect(w.conducts != null).toBe(i % 3 === 0));
    const prs = waves.filter((w) => w.conducts != null).map((w) => beats[w.conducts].QRS.on - w.on);
    expect(Math.max(...prs) - Math.min(...prs)).toBeLessThanOrEqual(20);
  });
});

describe('导览光标 {atrial}', () => {
  it('"没有下传的 P 波"一步确实停在未下传的 P 波上', () => {
    const t = TOURS.find((x) => x.id === 'av-block');
    const s = t.steps.find((x) => x.cursor?.atrial != null);
    const m = meta('ptbxl-1222');
    const w = m.annotations.atrial.waves[s.cursor.atrial];
    expect(w.conducts).toBeNull();
    expect(cursorAt(m, s.cursor)).toBe(w.peak);
  });
});
