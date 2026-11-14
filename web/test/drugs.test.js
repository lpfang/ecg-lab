// 降压药手册：结构、药物数据、检索、与术语表/读片手册的链接
import { describe, it, expect } from 'vitest';
import { DRUG_BOOK, DRUG_CHAPTERS, DRUG_CLASSES, DRUGS, classById, drugById } from '../src/content/drugs.js';
import { searchDrugs } from '../src/views/drugbook.js';
import { REFS } from '../src/content/refs.js';
import { TERMS } from '../src/content/terms.js';
import { termNames, termRegex, chapterById } from '../src/content/handbook.js';

const text = (html) =>
  html
    .replace(/<[a-z/][^>]*>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

describe('手册结构', () => {
  it('入门篇、各类药物、专业篇；章节 id 唯一', () => {
    expect(DRUG_BOOK.map((p) => p.id)).toEqual(['basics', 'classes', 'pro']);
    const ids = DRUG_CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(DRUG_CHAPTERS)('$id：出处、术语存在；正文无脚本', (c) => {
    expect(c.body).not.toMatch(/<script|on\w+=/i);
    for (const r of c.refs ?? []) expect(REFS[r], r).toBeTruthy();
    for (const t of c.terms ?? []) {
      expect(TERMS[t], t).toBeTruthy();
      expect(termRegex(termNames(t)).test(text(c.body)), `${c.id} 正文未提到 ${t}`).toBe(true);
    }
    for (const id of c.classes ?? []) expect(classById(id)?.chapter).toBe(c.id);
  });

  it('每个药物类别的章节都有"名字的由来"', () => {
    for (const c of DRUG_CHAPTERS.filter((x) => x.part === 'classes')) expect(c.body, c.id).toContain('名字的由来');
  });

  it('正文里的章节链接都指向存在的章节', () => {
    for (const c of DRUG_CHAPTERS)
      for (const m of c.body.matchAll(/data-drug-ch="([^"]+)"/g))
        expect(
          DRUG_CHAPTERS.some((x) => x.id === m[1]),
          `${c.id} → ${m[1]}`,
        ).toBe(true);
    expect(chapterById('p-drugs')).toBeTruthy(); // ecg: true 链接到读片手册这一章
  });
});

describe('药物数据', () => {
  it('id 唯一，类别有效，每个类别至少一个药', () => {
    const ids = DRUGS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DRUGS) expect(classById(d.cls), d.id).toBeTruthy();
    for (const c of DRUG_CLASSES)
      expect(
        DRUGS.some((d) => d.cls === c.id),
        c.id,
      ).toBe(true);
  });

  it.each(DRUGS)('$id：有中文名、英文名、说明，有出处链接', (d) => {
    expect(d.zh).toBeTruthy();
    expect(d.inn).toMatch(/[a-z]/);
    expect(d.plain?.length).toBeGreaterThan(5);
    expect(d.sources?.length, d.id).toBeGreaterThan(0);
    for (const u of d.sources ?? []) expect(u).toMatch(/^https?:\/\//);
    if (d.cnStatus) expect(['uncertain', 'unavailable']).toContain(d.cnStatus);
  });

  it('核查结论：国内未上市或未核实的药已标注', () => {
    expect(drugById('nebivolol').cnStatus).toBe('unavailable');
    expect(drugById('chlorthalidone').cnStatus).toBe('uncertain');
    expect(drugById('aliskiren').cnStatus).toBe('uncertain');
  });

  it('普利、沙坦、ARNI 都提示妊娠禁忌（类别章节里）', () => {
    for (const ch of ['c-acei', 'c-arb']) expect(DRUG_CHAPTERS.find((c) => c.id === ch).body).toMatch(/妊娠/);
  });
});

describe('检索', () => {
  const ids = (q) => searchDrugs(q).map((d) => d.id);
  it('按商品名、英文名、类别名、别名', () => {
    expect(ids('络活喜')).toEqual(['amlodipine']);
    expect(ids('Norvasc')).toEqual(['amlodipine']);
    expect(ids('沙坦').length).toBeGreaterThanOrEqual(8);
    expect(ids('心痛定')).toContain('nifedipine-ir');
    expect(ids('降压0号')).toContain('beijing-0');
  });
  it('多个词都要命中；空查询返回全部', () => {
    expect(ids('氨氯地平 缬沙坦')).toEqual(['valsartan-amlodipine']);
    expect(searchDrugs('').length).toBe(DRUGS.length);
  });
});
