// 心脏结构图：原图 + 可点击的中文标注。数据见 content/anatomy.js。
import { ANATOMY, FIGS, REF_SHORT } from '../content/anatomy.js';
import { REFS } from '../content/refs.js';

const M = 330; // 两侧留给标注的宽度（图片像素）
const RH = 30; // 同一侧相邻标注的最小间距

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** 标注文字的 y：尽量对齐引线，太挤时往下推 */
export function spread(rows) {
  const ys = [];
  rows.forEach(([y], i) => ys.push(Math.max(y, i ? ys[i - 1] + RH : y)));
  return ys;
}

/** 出处文字：refs.js 的 id 换成简称，悬停看完整文献 */
export function sourceHtml(src) {
  return esc(src).replace(/\b(aha3|aha5|aha6|udmi4|brady2018|cn2024)\b/g, (k) => `<abbr title="${esc(REFS[k].text)}">${REF_SHORT[k]}</abbr>`);
}

/** 图内标注的图（心动周期）：标注直接写在原来英文的位置上 */
function overlaySvg(f) {
  const g = (id, inner, extra = '') => `<g class="an-lab an-ov" data-id="${id}" tabindex="0" role="button" aria-label="${ANATOMY[id][0]}"${extra}>${inner}</g>`;
  let s = `<image href="${f.img}" x="0" y="0" width="${f.w}" height="${f.h}"/>`;
  const { cx, cy, r, top, bottom, left, right } = f.ring;
  const arc = (id, sweep) => `<path id="${id}" d="M${cx - r} ${cy} A${r} ${r} 0 0 ${sweep} ${cx + r} ${cy}" fill="none"/>`;
  s += `<defs>${arc('an-arc-top', 1)}${arc('an-arc-bot', 0)}</defs>`;
  s += `<text class="an-ov-s" x="${f.start[0]}" y="${f.start[1]}">开始</text>`;
  // 圆环上的字按字形中线对齐圆弧，换字体也居中
  s += g(top[0], `<text class="an-ring" dominant-baseline="central"><textPath href="#an-arc-top" startOffset="50%">${top[1]}</textPath></text>`);
  s += g(bottom[0], `<text class="an-ring" dominant-baseline="central"><textPath href="#an-arc-bot" startOffset="50%">${bottom[1]}</textPath></text>`);
  s += g(left[0], `<text class="an-ring" dominant-baseline="central" transform="translate(${left[2]} ${cy}) rotate(-90)">${left[1]}</text>`);
  s += g(right[0], `<text class="an-ring" dominant-baseline="central" transform="translate(${right[2]} ${cy}) rotate(90)">${right[1]}</text>`);
  for (const [id, x, y, lines] of f.overlay) {
    let yy = y;
    let t = '';
    for (const [txt, c] of lines) {
      t += `<text class="an-ov-${c}" x="${x}" y="${yy}">${txt}</text>`;
      yy += c === 't' ? 52 : 46;
    }
    const w = Math.max(...lines.map(([txt, c]) => txt.length * (c === 't' ? 44 : 38))) + 24;
    s += g(id, `<rect x="${x - w / 2}" y="${y - 44}" width="${w}" height="${yy - y + 14}" rx="10"/>${t}`);
  }
  return s;
}

/** 一幅图的 SVG 内容（图片 + 引线 + 标注） */
export function figureSvg(key) {
  const f = FIGS[key];
  if (f.overlay) return overlaySvg(f);
  let s = `<image href="${f.img}" x="0" y="0" width="${f.w}" height="${f.h}"/>`;
  const label = (id, x, y, left, name = ANATOMY[id][0]) => {
    const w = name.length * 26 + 10;
    s +=
      `<g class="an-lab" data-id="${id}" tabindex="0" role="button" aria-label="${name}">` +
      `<rect x="${left ? x - w - 6 : x + 2}" y="${y - 20}" width="${w + 4}" height="34" rx="5"/>` +
      `<text x="${left ? x - 8 : x + 8}" y="${y + 9}" text-anchor="${left ? 'end' : 'start'}">${name}</text></g>`;
  };
  const side = (rows, left) => {
    const ys = spread(rows);
    const seen = new Set();
    rows.forEach(([y, id, name], i) => {
      const ty = ys[i];
      const x0 = left ? 0 : f.w;
      const x1 = left ? -18 : f.w + 18;
      s += `<path class="an-ext" data-for="${id}" d="M${x0} ${y} L${x1} ${ty}"/>`;
      if (name) return label(id, x1, ty, left, name);
      // 同一结构在同一侧有多条引线（如肺静脉），只写一次文字，用竖线连起来
      const same = rows.filter((r) => r[1] === id);
      if (same.length > 1) {
        if (seen.has(id)) return;
        seen.add(id);
        const idx = rows.findIndex((r) => r[1] === id);
        const last = idx + same.length - 1;
        s += `<path class="an-ext" data-for="${id}" d="M${x1} ${ys[idx]} L${x1} ${ys[last]}"/>`;
        return label(id, x1, (ys[idx] + ys[last]) / 2, left);
      }
      label(id, x1, ty, left);
    });
  };
  side(f.L, true);
  side(f.R, false);
  for (const t of f.inside ?? []) {
    const [wx, wy, ww, wh] = t.white;
    s += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="#fff"/>`;
    label(t.id, t.x, t.y, true, t.name);
  }
  return s;
}

let current = 'lv';
let onFig = null;

/** 某幅图上标注了哪些结构 */
export function figIds(key) {
  const f = FIGS[key];
  if (f.overlay) {
    const { top, bottom, left, right } = f.ring;
    return new Set([...f.overlay.map((r) => r[0]), top[0], bottom[0], left[0], right[0]]);
  }
  return new Set([...f.L, ...f.R, ...(f.inside ?? []).map((t) => [0, t.id])].map((r) => r[1]));
}

/** 在 root 里画出心脏结构图，起始显示 key 这幅；切图时调用 onChange(key)（用来更新网址） */
export function buildAnatomy(root, key = 'ext', onChange = null) {
  if (!FIGS[key]) key = 'ext';
  onFig = onChange;
  root.innerHTML = `
    <p class="an-intro">先认识心脏，再看心电图：心电图记录的是心肌"通电"产生的电压变化。点击图上的中文标注查看说明。</p>
    <div class="an-tabs" role="tablist">
      ${Object.entries(FIGS)
        .map(([k, f]) => `<button role="tab" data-fig="${k}">${f.title}</button>`)
        .join('')}
    </div>
    <div class="an-grid">
      <div class="an-fig">
        <h4 id="an-title"></h4><span class="muted small" id="an-sub"></span>
        <svg id="an-svg" role="group"></svg>
        <p class="muted small" id="an-note"></p>
      </div>
      <aside class="an-info" aria-live="polite">
        <span class="muted small">结构说明</span>
        <h4 id="an-zh"></h4><p class="muted" id="an-en" lang="en"></p>
        <p id="an-plain"></p>
        <p id="an-valve" class="muted" hidden></p>
        <div class="an-ecg"><b>和心电图的关系</b><p id="an-rel"></p></div>
        <p class="an-src" id="an-src"></p>
      </aside>
    </div>
    <p class="an-credit muted small">
      图片来自 OpenStax《Anatomy and Physiology 2e》（J. Gordon Betts 等，2022）图 19.6、19.9、19.18、19.27，
      采用 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> 许可；原书
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy" target="_blank" rel="noopener">19.1 Heart Anatomy</a>、
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/19-2-cardiac-muscle-and-electrical-activity" target="_blank" rel="noopener">19.2 Cardiac Muscle and Electrical Activity</a>、
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/19-3-cardiac-cycle" target="_blank" rel="noopener">19.3 Cardiac Cycle</a>。
      本站的改动：裁去（图 19.27 为抹去）英文标注，改为可点击的中文标注（图 19.9 顶部的 Aorta 改写为"主动脉"）；去掉图 19.18 左上角的小示意图；说明文字为本站编写。
    </p>`;
  root.querySelector('.an-tabs').onclick = (e) => {
    const b = e.target.closest('[data-fig]');
    if (b) show(root, b.dataset.fig);
  };
  const svg = root.querySelector('#an-svg');
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.an-lab');
    if (g) select(root, g.dataset.id);
  });
  svg.addEventListener('keydown', (e) => {
    const g = e.target.closest('.an-lab');
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(root, g.dataset.id);
    }
  });
  show(root, key);
}

/** 切换到某幅图 */
export function show(root, key) {
  const f = FIGS[key];
  if (!f) return;
  root.querySelectorAll('.an-tabs [data-fig]').forEach((b) => {
    b.classList.toggle('on', b.dataset.fig === key);
    b.setAttribute('aria-selected', b.dataset.fig === key);
  });
  root.querySelector('#an-title').textContent = f.title;
  root.querySelector('#an-sub').textContent = f.sub;
  root.querySelector('#an-note').textContent = f.note;
  const svg = root.querySelector('#an-svg');
  const m = f.overlay ? 0 : M; // 图内标注的图两侧不留空
  svg.setAttribute('viewBox', `${-m} 0 ${f.w + 2 * m} ${f.h}`);
  svg.setAttribute('aria-label', f.title);
  svg.classList.toggle('tall', !!f.overlay); // 心动周期图又高又细，不限高度，靠滚动
  svg.innerHTML = figureSvg(key);
  root.dataset.fig = key;
  // 选中的结构这幅图上也有就保留，否则改选这幅图的默认项（解剖图都是左心室）
  select(root, figIds(key).has(current) ? current : (f.def ?? 'lv'));
  onFig?.(key);
}

function mark(root, id) {
  root.querySelectorAll('.an-lab').forEach((e) => e.classList.toggle('on', e.dataset.id === id));
  root.querySelectorAll('.an-ext').forEach((e) => e.classList.toggle('on', e.dataset.for === id));
}

/** 选中一个结构，右侧显示说明 */
export function select(root, id) {
  if (!ANATOMY[id]) return;
  current = id;
  const [zh, en, plain, rel, src, valve] = ANATOMY[id];
  root.querySelector('#an-zh').textContent = zh;
  root.querySelector('#an-en').textContent = en;
  root.querySelector('#an-plain').textContent = plain;
  const v = root.querySelector('#an-valve');
  v.textContent = valve ? `瓣膜：${valve}` : '';
  v.hidden = !valve;
  root.querySelector('#an-rel').innerHTML = rel;
  root.querySelector('#an-src').innerHTML = `出处：${sourceHtml(src)}`;
  mark(root, id);
}
