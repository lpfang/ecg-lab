import { asset } from '../version.js';
// 心脏结构图：原图 + 可点击的中文标注。数据见 content/anatomy.js。
import { ANATOMY, FIGS, REF_SHORT, AN_GO, HEART_KEYS, BP_KEYS } from '../content/anatomy.js';
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

/** 出处文字：refs.js 的 id 换成简称，鼠标移上去（或键盘移到上面）立即显示完整文献 */
export function sourceHtml(src) {
  return esc(src).replace(new RegExp(`\\b(${Object.keys(REF_SHORT).join('|')})\\b`, 'g'), (k) => `<span class="ref-tip" tabindex="0" data-tip="${esc(REFS[k].text)}">${REF_SHORT[k]}</span>`);
}

/** 图内标注的图（心动周期）：标注直接写在原来英文的位置上 */
function overlaySvg(f) {
  const g = (id, inner, extra = '') => `<g class="an-lab an-ov" data-id="${id}" tabindex="0" role="button" aria-label="${ANATOMY[id][0]}"${extra}>${inner}</g>`;
  let s = `<image href="${asset(f.img)}" x="0" y="0" width="${f.w}" height="${f.h}"/>`;
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

/** 曲线图（压力曲线、血压计）：中文写在原来英文的位置上，可以左对齐、右对齐、上色 */
function plotSvg(f) {
  const p = f.plot;
  const fs = p.fs ?? 34;
  const lh = Math.round(fs * 1.24);
  const g = (id, inner) => `<g class="an-lab an-pl" data-id="${id}" tabindex="0" role="button" aria-label="${ANATOMY[id][0]}">${inner}</g>`;
  const box = (x, y, n, rows, anchor) => {
    const w = n * fs + fs / 2;
    const x0 = anchor === 'start' ? x - fs / 4 : anchor === 'end' ? x - w + fs / 4 : x - w / 2;
    return `<rect x="${x0}" y="${y - fs}" width="${w}" height="${rows * lh + fs / 4}" rx="${fs / 5}"/>`;
  };
  let s = `<g style="font-size:${fs}px"><image href="${asset(f.img)}" x="0" y="0" width="${f.w}" height="${f.h}"/>`;
  for (const [x1, y1, x2, y2] of p.lines ?? []) s += `<path class="an-pl-line" d="M${x1} ${y1} L${x2} ${y2}"/>`;
  for (const [id, x, y, lines, anchor, color] of p.labels) {
    let t = box(x, y, Math.max(...lines.map((l) => l.length)), lines.length, anchor);
    lines.forEach((l, i) => (t += `<text x="${x}" y="${y + i * lh}" text-anchor="${anchor}"${color ? ` style="fill:${color}"` : ''}>${l}</text>`));
    s += g(id, t);
  }
  for (const [id, x, y, text] of p.vtext ?? []) {
    s += g(id, `<g transform="translate(${x} ${y}) rotate(-90)">${box(0, fs / 2, text.length, 1, 'middle')}<text text-anchor="middle" dominant-baseline="central">${text}</text></g>`);
  }
  for (const [id, x, y, text, dot] of p.add ?? []) {
    s += g(id, `${dot ? `<circle class="an-pl-dot" cx="${dot[0]}" cy="${dot[1]}" r="${fs / 4}"/>` : ''}${box(x, y, text.length, 1, 'start')}<text class="an-pl-add" x="${x}" y="${y}">${text}</text>`);
  }
  for (const [x, y, text] of p.plain ?? []) s += `<text class="an-pl-plain" x="${x}" y="${y}">${text}</text>`;
  return s + '</g>';
}

/** 一幅图的 SVG 内容（图片 + 引线 + 标注） */
export function figureSvg(key) {
  const f = FIGS[key];
  if (f.overlay) return overlaySvg(f);
  if (f.plot) return plotSvg(f);
  let s = `<image href="${asset(f.img)}" x="0" y="0" width="${f.w}" height="${f.h}"/>`;
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

// 每个窗口（root）各自记住：当前选中的结构、切图回调、有哪些图、跳到别的窗口的回调
const STATE = new WeakMap();

/** 某幅图上标注了哪些结构 */
export function figIds(key) {
  const f = FIGS[key];
  if (f.plot) {
    const p = f.plot;
    return new Set([...p.labels, ...(p.vtext ?? []), ...(p.add ?? [])].map((r) => r[0]));
  }
  if (f.overlay) {
    const { top, bottom, left, right } = f.ring;
    return new Set([...f.overlay.map((r) => r[0]), top[0], bottom[0], left[0], right[0]]);
  }
  return new Set([...f.L, ...f.R, ...(f.inside ?? []).map((t) => [0, t.id])].map((r) => r[1]));
}

const HEART_INTRO = '先认识心脏，再看心电图：心电图记录的是心肌"通电"产生的电压变化。点击图上带点线的中文名称，右边会显示它的说明。';
const HEART_CREDIT = `<p class="an-credit muted small">
      图片来自 OpenStax《Anatomy and Physiology 2e》（J. Gordon Betts 等，2022）图 19.6、19.9、19.18、19.27、19.29，
      采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> 许可；原书
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy" target="_blank" rel="noopener">19.1 Heart Anatomy</a>、
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/19-2-cardiac-muscle-and-electrical-activity" target="_blank" rel="noopener">19.2 Cardiac Muscle and Electrical Activity</a>、
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/19-3-cardiac-cycle" target="_blank" rel="noopener">19.3 Cardiac Cycle</a>。
      本站的改动：裁去（图 19.27、19.29 为抹去）英文标注，改为可点击的中文标注（图 19.9 顶部的 Aorta 改写为"主动脉"）；去掉图 19.18 左上角的小示意图；图 19.29 加上"收缩压""舒张压"标注；说明文字为本站编写。改动后的图片同样按 CC BY-NC-SA 4.0 提供，仅用于非商业用途。<br>
      Access for free at <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction" target="_blank" rel="noopener">openstax.org/books/anatomy-and-physiology-2e</a>。
    </p>`;

/** "量血压"窗口：听诊法、电子血压计的原理、电子血压计实测 */
export const BP_VIEW = {
  keys: BP_KEYS,
  intro: '血压计量的是手臂动脉里的压力。先看医生用听诊器怎样量，再看家里的电子血压计怎样量。点击图上带点线的中文名称，右边会显示它的说明。',
  credit: `<p class="an-credit muted small">
      "医生用听诊器量"一图来自 OpenStax《Anatomy and Physiology 2e》（J. Gordon Betts 等，2022）图 20.12，
      采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> 许可；原书
      <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/20-2-blood-flow-blood-pressure-and-resistance" target="_blank" rel="noopener">20.2 Blood Flow, Blood Pressure, and Resistance</a>。
      本站抹去英文标注，改为可点击的中文标注，加上"动脉血压"标注；改动后的图片同样按 CC BY-NC-SA 4.0 提供，仅用于非商业用途。Access for free at <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction" target="_blank" rel="noopener">openstax.org/books/anatomy-and-physiology-2e</a>。<br>
      "电子血压计的原理"示意图为本站绘制，原理依据 Babbs 2012。<br>
      "电子血压计实测"一图是 Amirhossein Ashrafzadeh 用示波器记录的家用电子血压计信号，来自
      <a href="https://commons.wikimedia.org/wiki/File:Oscillometric_Blood_Pressure_Waveform.jpg" target="_blank" rel="noopener">Wikimedia Commons</a>，
      采用 <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> 许可。本站裁去示波器的界面和英文、在上方加了空白并写上中文标注，改动后的图片同样按 CC BY-SA 4.0 提供。<br>
      说明文字为本站编写。
    </p>`,
};

/**
 * 在 root 里画出一组图（默认心脏结构；量血压用 BP_VIEW），起始显示 key 这幅。
 * 切图时调用 onChange(key)（用来更新网址）；跳到不在这组里的图时调用 opts.onGo(key)（打开另一个窗口）。
 */
export function buildAnatomy(root, key = 'ext', onChange = null, opts = {}) {
  const keys = opts.keys ?? HEART_KEYS;
  if (!keys.includes(key)) key = keys[0];
  STATE.set(root, { current: 'lv', onFig: onChange, keys, onGo: opts.onGo });
  root.innerHTML = `
    <p class="an-intro">${opts.intro ?? HEART_INTRO}</p>
    <div class="an-tabs" role="tablist">
      ${keys.map((k) => `<button role="tab" data-fig="${k}">${FIGS[k].title}</button>`).join('')}
    </div>
    <div class="an-grid">
      <div class="an-fig">
        <h4 data-an="title"></h4><span class="muted small" data-an="sub"></span>
        <svg data-an="svg" role="group"></svg>
        <p class="muted small" data-an="note"></p>
        <div class="an-more" data-an="more"></div>
      </div>
      <aside class="an-info" aria-live="polite">
        <span class="muted small">说明 · 点图上带点线的名称可切换</span>
        <h4 data-an="zh"></h4><p class="muted" data-an="en" lang="en"></p>
        <p data-an="plain"></p>
        <p data-an="valve" class="muted" hidden></p>
        <div class="an-ecg"><b>和心电图的关系</b><p data-an="rel"></p></div>
        <p data-an="go" hidden></p>
        <p class="an-src" data-an="src"></p>
      </aside>
    </div>
    ${opts.credit ?? HEART_CREDIT}
`;
  root.querySelector('.an-tabs').onclick = (e) => {
    const b = e.target.closest('[data-fig]');
    if (b) show(root, b.dataset.fig);
  };
  // 说明、补充文字里跳到另一幅图的链接
  root.querySelector('.an-grid').addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (!a) return;
    e.preventDefault();
    const st = STATE.get(root);
    if (!st.keys.includes(a.dataset.go)) return st.onGo?.(a.dataset.go);
    show(root, a.dataset.go);
    root.querySelector('.an-tabs')?.scrollIntoView({ block: 'nearest' });
  });
  const svg = root.querySelector('[data-an=svg]');
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
  root.querySelector('[data-an=title]').textContent = f.title;
  root.querySelector('[data-an=sub]').textContent = f.sub;
  root.querySelector('[data-an=note]').textContent = f.note;
  const svg = root.querySelector('[data-an=svg]');
  const m = f.overlay || f.plot ? 0 : M; // 图内标注的图两侧不留空
  svg.setAttribute('viewBox', `${-m} 0 ${f.w + 2 * m} ${f.h}`);
  svg.setAttribute('aria-label', f.title);
  svg.classList.toggle('tall', !!f.overlay); // 心动周期图又高又细，不限高度，靠滚动
  svg.innerHTML = figureSvg(key);
  root.querySelector('[data-an=more]').innerHTML = (f.more ?? [])
    .map((x) => `<section><h5>${x.h}</h5>${x.html}<p class="an-src">出处：${sourceHtml(x.src)}</p></section>`)
    .join('');
  root.dataset.fig = key;
  // 选中的结构这幅图上也有就保留，否则改选这幅图的默认项（解剖图都是左心室）
  const st = STATE.get(root);
  select(root, figIds(key).has(st.current) ? st.current : (f.def ?? 'lv'));
  st.onFig?.(key);
}

function mark(root, id) {
  root.querySelectorAll('.an-lab').forEach((e) => e.classList.toggle('on', e.dataset.id === id));
  root.querySelectorAll('.an-ext').forEach((e) => e.classList.toggle('on', e.dataset.for === id));
}

/** 选中一个结构，右侧显示说明 */
export function select(root, id) {
  if (!ANATOMY[id]) return;
  STATE.get(root).current = id;
  const [zh, en, plain, rel, src, valve] = ANATOMY[id];
  root.querySelector('[data-an=zh]').textContent = zh;
  root.querySelector('[data-an=en]').textContent = en;
  root.querySelector('[data-an=plain]').textContent = plain;
  const v = root.querySelector('[data-an=valve]');
  v.textContent = valve ? `瓣膜：${valve}` : '';
  v.hidden = !valve;
  root.querySelector('[data-an=rel]').innerHTML = rel;
  root.querySelector('[data-an=src]').innerHTML = `出处：${sourceHtml(src)}`;
  const go = root.querySelector('[data-an=go]');
  const link = AN_GO[id];
  go.innerHTML = link ? `<a href="#" data-go="${link[0]}">${link[1]}</a>` : '';
  go.hidden = !link;
  mark(root, id);
}
