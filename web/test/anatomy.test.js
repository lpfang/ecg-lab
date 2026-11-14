// 心脏结构图：每条引线都指向有说明的结构，出处有效，图片存在，标注不重叠
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { ANATOMY, FIGS, FIG_KEYS, REF_SHORT } from '../src/content/anatomy.js';
import { REFS } from '../src/content/refs.js';
import { CHAPTERS } from '../src/content/handbook.js';
import { spread, sourceHtml } from '../src/views/anatomy.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('心脏结构图', () => {
  it('四幅图：外观、内部、传导系统、心动周期', () => {
    expect(FIG_KEYS).toEqual(['ext', 'int', 'cond', 'cycle']);
  });

  it('心动周期：图内标注都有说明，落在图内，默认选中项在图上', async () => {
    const f = FIGS.cycle;
    const { figIds } = await import('../src/views/anatomy.js');
    expect(existsSync(new URL(`../public/${f.img}`, import.meta.url)), f.img).toBe(true);
    for (const [id, x, y, lines] of f.overlay) {
      expect(ANATOMY[id], id).toBeTruthy();
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(f.w);
      expect(y).toBeGreaterThan(0);
      expect(y + lines.length * 52).toBeLessThan(f.h);
    }
    for (const side of ['top', 'bottom', 'left', 'right']) expect(ANATOMY[f.ring[side][0]], side).toBeTruthy();
    expect(figIds('cycle').has(f.def)).toBe(true);
    // 六个阶段都写了瓣膜状态
    for (const [id] of f.overlay) expect(ANATOMY[id][5], id).toMatch(/瓣/);
  });

  it.each(FIG_KEYS.filter((k) => !FIGS[k].overlay))('%s：图片存在，引线按 y 排好、落在图内，结构都有说明', (k) => {
    const f = FIGS[k];
    expect(existsSync(new URL(`../public/${f.img}`, import.meta.url)), f.img).toBe(true);
    for (const rows of [f.L, f.R]) {
      rows.forEach(([y, id], i) => {
        expect(ANATOMY[id], id).toBeTruthy();
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(f.h);
        if (i) expect(y).toBeGreaterThan(rows[i - 1][0]);
      });
      // 推开后的标注互不重叠，也不超出图的下边
      const ys = spread(rows);
      ys.forEach((y, i) => i && expect(y - ys[i - 1]).toBeGreaterThanOrEqual(30));
      expect(ys.at(-1)).toBeLessThan(f.h);
    }
    for (const t of f.inside ?? []) expect(ANATOMY[t.id], t.id).toBeTruthy();
  });

  it.each(Object.entries(ANATOMY))('%s：五项齐全（可选第六项瓣膜），关系说明只用 <b>，出处里的文献 id 有效', (id, v) => {
    expect([5, 6]).toContain(v.length);
    for (const x of v.slice(0, 5)) expect(x.trim().length).toBeGreaterThan(0);
    expect(v[3].replace(/<\/?b>/g, '')).not.toMatch(/[<>]/);
    expect(v[2]).not.toMatch(/[<>]/);
    for (const k of Object.keys(REF_SHORT)) if (v[4].includes(k)) expect(REFS[k], k).toBeTruthy();
    expect(sourceHtml(v[4])).not.toMatch(/<script|on\w+=/i);
  });

  it('冠状动脉的供血说明都注明个体差异', () => {
    for (const id of ['rca', 'lm', 'lad', 'lcx', 'rma']) expect(ANATOMY[id][2]).toContain('个体差异很大');
  });

  it('网页里有对话框和顶栏按钮；手册章节的 heart 链接有效', () => {
    expect(html).toContain('<dialog id="anatomy"');
    expect(html).toContain('id="heart-btn"');
    const linked = CHAPTERS.filter((c) => c.heart);
    expect(linked.length).toBeGreaterThan(0);
    for (const c of linked) expect(FIG_KEYS).toContain(c.heart);
  });

  it('页面注明 OpenStax 图片的 CC BY 4.0 许可', () => {
    const src = readFileSync(new URL('../src/views/anatomy.js', import.meta.url), 'utf8');
    expect(src).toContain('CC BY 4.0');
    expect(src).toContain('creativecommons.org/licenses/by/4.0');
  });
});

describe('切图时的选中项', () => {
  it('默认结构左心室在三幅解剖图上都有标注', async () => {
    const { figIds } = await import('../src/views/anatomy.js');
    for (const k of FIG_KEYS.filter((k) => !FIGS[k].overlay)) expect(figIds(k).has('lv'), k).toBe(true);
  });
});
