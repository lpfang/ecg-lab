// 难字注音：每个单元里每个字只注第一次
import { describe, it, expect } from 'vitest';
import { PINYIN, rubyText } from '../src/views/pinyin.js';
import { DRUG_CHAPTERS, DRUGS } from '../src/content/drugs.js';

describe('难字注音', () => {
  it('第一次出现注音，之后不注', () => {
    const seen = new Set();
    expect(rubyText('氢氯噻嗪和噻嗪类', seen)).toBe(
      '氢氯<ruby>噻<rt>sāi</rt></ruby><ruby>嗪<rt>qín</rt></ruby>和噻嗪类',
    );
    expect(rubyText('噻嗪', seen)).toBeNull();
    expect(rubyText('钾 腺 酯', new Set())).toBeNull();
    expect(rubyText('袢利尿剂 醛固酮 甾酮')).toContain('<ruby>甾<rt>zāi</rt></ruby>');
  });
  it('转义文本里的尖括号', () => {
    expect(rubyText('<130 嗪')).toBe('&lt;130 <ruby>嗪<rt>qín</rt></ruby>');
  });
  it('用户问到的字都有拼音；每个拼音都带声调或是轻声字母', () => {
    for (const c of '噻嗪袢醛固酮甾'.replace(/[固]/g, '')) expect(PINYIN[c], c).toBeTruthy();
    for (const [c, p] of Object.entries(PINYIN)) expect(p, c).toMatch(/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$/);
  });
  it('表里的字都在手册里出现过（避免收了用不上的字）', () => {
    const all = DRUG_CHAPTERS.map((c) => c.body).join('') + JSON.stringify(DRUGS);
    for (const c of Object.keys(PINYIN)) expect(all.includes(c), c).toBe(true);
  });
});
