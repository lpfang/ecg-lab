import { describe, it, expect } from 'vitest';
import { searchTerms, tokens } from '../src/content/search.js';
import { TERMS } from '../src/content/terms.js';

describe('术语表检索', () => {
  it('空查询返回全部，保持原顺序', () => {
    expect(searchTerms(TERMS, '  ')).toEqual(Object.keys(TERMS));
  });

  it('中文、英文、缩写都能找到', () => {
    expect(searchTerms(TERMS, '电轴')[0]).toBeTruthy();
    expect(searchTerms(TERMS, '左心室肥厚')).toContain('lvh');
    expect(searchTerms(TERMS, 'LVH')).toContain('lvh');
    expect(searchTerms(TERMS, 'lvh')).toContain('lvh'); // 不区分大小写
    expect(searchTerms(TERMS, 'ＬＶＨ')).toContain('lvh'); // 全角
  });

  it('名称命中排在正文命中之前', () => {
    const r = searchTerms(TERMS, '心房颤动');
    expect(r[0]).toBe('afib');
  });

  it('多个关键字须同时出现', () => {
    const both = searchTerms(TERMS, '导联 心电向量');
    for (const id of both) {
      const t = TERMS[id];
      const all = `${t.zh}${t.en}${t.plain}${t.pro}`;
      expect(all).toContain('导联');
      expect(all).toContain('心电向量');
    }
    expect(searchTerms(TERMS, '心房 不存在的词xyz')).toEqual([]);
  });

  it('不匹配 HTML 标签本身', () => {
    const fake = { a: { zh: '甲', en: 'A', plain: '<b>粗体</b>', pro: '' } };
    expect(searchTerms(fake, 'b')).toEqual([]);
    expect(searchTerms(fake, '粗体')).toEqual(['a']);
  });

  it('关键字去重、去空格', () => {
    expect(tokens(' QT  qt  电轴 ')).toEqual(['qt', '电轴']);
  });
});
