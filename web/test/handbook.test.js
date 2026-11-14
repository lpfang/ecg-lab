// 读片手册：章节结构、演示病例与定位、交互演示的计算
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HANDBOOK, CHAPTERS, chapterById } from '../src/content/handbook.js';
import { TOURS, cursorAt } from '../src/tours.js';
import { REFS } from '../src/content/refs.js';
import { axisClass, leadProjections, normDeg, qtcTable, qtcLimit } from '../src/views/handbook.js';
import { readMeta } from './helpers.js';

const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const index = JSON.parse(readFileSync(new URL('../public/cases/index.json', import.meta.url), 'utf8')).cases;
const PRIMER_SECTIONS = ['intro', 'why', 'body', 'frontal', 'chest', 'paper']; // primer.js 的 pr-sec-*

describe('手册结构', () => {
  it('患者篇、专业篇都有章节，章节 id 唯一', () => {
    expect(HANDBOOK.map((p) => p.id)).toEqual(['patient', 'pro']);
    for (const p of HANDBOOK) expect(p.chapters.length).toBeGreaterThanOrEqual(5);
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CHAPTERS)('$id：每章至少一个"在图上演示"，出处、导览、读图入门链接有效', (c) => {
    expect(c.demos.length).toBeGreaterThan(0);
    for (const r of c.refs ?? []) expect(REFS[r], r).toBeTruthy();
    for (const t of c.tours ?? [])
      expect(
        TOURS.some((x) => x.id === t),
        t,
      ).toBe(true);
    if (c.primer) expect(PRIMER_SECTIONS).toContain(c.primer);
    if (c.widget) expect(['axis', 'qtc', 'mi']).toContain(c.widget);
    // 正文只用简单标签，不含脚本或内联事件
    expect(c.body).not.toMatch(/<script|on\w+=/i);
  });

  const demos = CHAPTERS.flatMap((c) => c.demos.map((d, i) => ({ ...d, ch: c.id, i })));
  it.each(demos)('$ch 演示 $i（$label）：病例在列表中、导联有效、光标落在记录内', (d) => {
    const c = index.find((x) => x.id === d.case);
    expect(c, d.case).toBeTruthy();
    expect(c.quizOnly).toBeFalsy();
    if (d.lead) expect(LEADS).toContain(d.lead);
    expect(d.note.length).toBeGreaterThan(8);
    if (d.cursor) {
      const m = readMeta(d.case);
      const t = cursorAt(m, d.cursor);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(m.durationMs);
    }
    if (d.scroll) expect(html).toMatch(new RegExp(`class="[^"]*\\b${d.scroll.slice(1)}\\b`));
    if (d.view?.mtab) expect(['intervals', 'lvh', 'st']).toContain(d.view.mtab);
  });

  it('导览中的手册链接指向存在的章节；每条导览至少链接一章', () => {
    for (const t of TOURS) {
      const reads = t.steps.filter((s) => s.read).map((s) => s.read);
      expect(reads.length, t.id).toBeGreaterThan(0);
      for (const r of reads) expect(chapterById(r), r).toBeTruthy();
    }
  });
});

describe('交互演示：电轴', () => {
  it('分区（AHA 2009）', () => {
    expect(axisClass(60).id).toBe('normal');
    expect(axisClass(-30).id).toBe('normal');
    expect(axisClass(90).id).toBe('normal');
    expect(axisClass(-31).id).toBe('left');
    expect(axisClass(-90).id).toBe('left');
    expect(axisClass(91).id).toBe('right');
    expect(axisClass(180).id).toBe('right');
    expect(axisClass(-120).id).toBe('extreme');
    expect(axisClass(300).id).toBe('left'); // 300° = −60°
  });

  it('角度规范化', () => {
    expect(normDeg(300)).toBe(-60);
    expect(normDeg(-180)).toBe(180);
    expect(normDeg(540)).toBe(180);
  });

  it('投影：向量与导联轴同向为 +1，反向为 −1，垂直为 0；满足 II = I + III（按导联系数）', () => {
    const p = Object.fromEntries(leadProjections(60).map((x) => [x.lead, x.v]));
    expect(p.II).toBeCloseTo(1, 6);
    expect(p.aVL).toBeCloseTo(0, 6);
    const q30 = Object.fromEntries(leadProjections(30).map((x) => [x.lead, x.v]));
    expect(q30.aVR).toBeCloseTo(-1, 6); // aVR 轴 −150°，与 +30° 正好相反
    // 单位向量的投影：cos(d) + cos(d − 120°) = cos(d − 60°)，即 I + III = II
    for (const d of [-170, -45, 0, 33, 120]) {
      const q = Object.fromEntries(leadProjections(d).map((x) => [x.lead, x.v]));
      expect(q.I + q.III).toBeCloseTo(q.II, 6);
    }
  });
});

describe('交互演示：QT / QTc', () => {
  it('心率 60 次/分时四种公式都等于 QT', () => {
    for (const r of qtcTable(60, 400)) expect(r.v).toBeCloseTo(400, 6);
  });
  it('心率快时 Bazett 最高，心率慢时 Bazett 最低', () => {
    const fast = Object.fromEntries(qtcTable(110, 340).map((r) => [r.id, r.v]));
    expect(fast.bazett).toBeGreaterThan(Math.max(fast.fridericia, fast.framingham, fast.hodges));
    const slow = Object.fromEntries(qtcTable(45, 460).map((r) => [r.id, r.v]));
    expect(slow.bazett).toBeLessThan(Math.min(slow.fridericia, slow.framingham, slow.hodges));
  });
  it('界值：男 450、女 460', () => {
    expect(qtcLimit('M')).toBe(450);
    expect(qtcLimit('F')).toBe(460);
  });
});

describe('手册与术语表互相链接', async () => {
  const { TERMS } = await import('../src/content/terms.js');
  const { chaptersForTerm, termNames, termRegex } = await import('../src/content/handbook.js');
  const text = (html) =>
    html
      .replace(/<[a-z/][^>]*>/gi, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

  it.each(CHAPTERS)('$id：本章术语都存在，且正文里确实提到', (c) => {
    expect(c.terms?.length, c.id).toBeGreaterThan(0);
    expect(new Set(c.terms).size).toBe(c.terms.length);
    for (const t of c.terms) {
      expect(TERMS[t], t).toBeTruthy();
      expect(termRegex(termNames(t)).test(text(c.body)), `${c.id} 正文未提到 ${t}`).toBe(true);
    }
  });

  it('反查：术语 → 讲到它的章节', () => {
    expect(chaptersForTerm('afib').map((c) => c.id)).toContain('s-rhythm');
    expect(chaptersForTerm('axis').map((c) => c.id)).toContain('s-axis');
    expect(chaptersForTerm('calPulse')).toEqual([]);
  });

  it('识别文字：QT 不匹配 QTc，房颤按简称也能识别', () => {
    const qt = termRegex(termNames('qtInterval'));
    expect(qt.test('QTc 延长')).toBe(false);
    expect(qt.test('QT 随心率变化')).toBe(true);
    expect(termRegex(termNames('afib')).test('房颤患者')).toBe(true);
  });
});
