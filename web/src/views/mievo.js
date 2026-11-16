// 心电图手册 s-stemi 章"随时间演变"的示意动画：一个正对梗死区的导联，
// 在 MI_EVOLUTION 各阶段之间平滑变形。波形是几个高斯波和一段 ST 抬高的叠加，只作示意。

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const g = (x, c, s) => Math.exp(-(((x - c) / s) ** 2) / 2);
const sig = (x) => 1 / (1 + Math.exp(-x));

/** 一个心搏内各波的时间（ms，从心搏起点算） */
export const BEAT = { len: 800, p: 110, q: 212, r: 232, s: 252, j: 250, t: 420 };

/** 合成心搏在 x（ms）处的电压（mV） */
export function beatMv(w, x) {
  const B = BEAT;
  return (
    0.13 * g(x, B.p, 22) -
    w.q * g(x, B.r - 8 - w.qw * 0.9, w.qw) +
    w.r * g(x, B.r, 9) -
    w.s * g(x, B.s, 8) +
    // ST 段抬高：J 点起抬升，随 T 波下降支回落，形成向上拱起的形态
    w.st * sig((x - B.j) / 4) * (1 - sig((x - (B.t + 40)) / 22)) +
    w.t * g(x, B.t, w.tw)
  );
}

/** 两组参数之间线性插值 */
export function lerpW(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
}

/** 标注锚点（ms、mV） */
function anchor(w, at) {
  const B = BEAT;
  if (at === 'Q') {
    const x = B.r - 8 - w.qw * 0.9;
    return [x, beatMv(w, x)];
  }
  if (at === 'ST') return [B.j + 85, beatMv(w, B.j + 85)];
  return [B.t, beatMv(w, B.t)];
}

// 画面：25 mm/s、10 mm/mV；两个心搏
const MS_PER_MM = 40;
const MM_PER_MV = 10;
const W_MM = 44;
const TOP_MV = 1.6;
const BOT_MV = -1.0;
const H_MM = (TOP_MV - BOT_MV) * MM_PER_MV;
const X0 = 2; // mm
const xmm = (ms) => X0 + ms / MS_PER_MM;
const ymm = (mv) => (TOP_MV - mv) * MM_PER_MV;

function pathFor(w, beats = 2) {
  let d = '';
  for (let ms = -X0 * MS_PER_MM; ms <= (W_MM - X0) * MS_PER_MM; ms += 2) {
    const inBeat = ((ms % BEAT.len) + BEAT.len) % BEAT.len;
    const beat = Math.floor(ms / BEAT.len);
    const v = beat >= 0 && beat < beats ? beatMv(w, inBeat) : 0;
    d += `${d ? 'L' : 'M'}${xmm(ms).toFixed(2)} ${ymm(v).toFixed(2)}`;
  }
  return d;
}

/** mode = 'pro'（专业篇）或 'plain'（患者篇，用 stage.plain 说明） */
export function miEvolutionWidget(root, stages, mode = 'pro') {
  root.innerHTML = `
    <div class="hbw-evo">
      <svg class="hbw-evo-svg" viewBox="0 0 ${W_MM} ${H_MM}" role="img" aria-label="心梗心电图演变示意动画"></svg>
      <div class="hbw-evo-steps" role="tablist">${stages
        .map((s, i) => `<button type="button" data-evo="${i}"><span>${i + 1}</span>${s.zh}</button>`)
        .join('')}</div>
      <div class="hbw-evo-ctl">
        <button type="button" data-evo-act="prev" aria-label="上一阶段">◀</button>
        <button type="button" data-evo-act="play" class="primary">▶ 自动播放</button>
        <button type="button" data-evo-act="next" aria-label="下一阶段">▶</button>
      </div>
      <div class="hbw-evo-info" aria-live="polite"></div>
    </div>`;
  const svg = root.querySelector('svg');
  // 心电图纸：1 mm 细线，5 mm 粗线
  const grid = el('g', { class: 'hbw-evo-grid' });
  for (let x = 0; x <= W_MM; x++) grid.append(el('line', { x1: x, y1: 0, x2: x, y2: H_MM, class: x % 5 ? 'm' : 'M' }));
  for (let y = 0; y <= H_MM; y++) grid.append(el('line', { x1: 0, y1: y, x2: W_MM, y2: y, class: y % 5 ? 'm' : 'M' }));
  svg.append(grid);
  const ref = el('path', { class: 'hbw-evo-ref' });
  const alt = el('path', { class: 'hbw-evo-alt' });
  const trace = el('path', { class: 'hbw-evo-trace' });
  const labels = el('g', { class: 'hbw-evo-labels' });
  svg.append(ref, alt, trace, labels);
  svg.append(el('text', { x: 1, y: H_MM - 1, class: 'hbw-evo-note' }, '示意图 · 25 mm/s · 10 mm/mV'));
  ref.setAttribute('d', pathFor(stages[0].w));

  const info = root.querySelector('.hbw-evo-info');
  const playBtn = root.querySelector('[data-evo-act="play"]');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0;
  let shownW = stages[0].w;
  let raf = 0;
  let timer = 0;

  const drawLabels = (st, w) => {
    labels.replaceChildren();
    for (const l of st.labels ?? []) {
      // 标在第二个心搏上
      const [ms, mv] = anchor(w, l.at);
      const x = xmm(BEAT.len + ms);
      const y = ymm(mv);
      const below = l.at === 'Q' || mv < 0;
      const ty = below ? Math.min(H_MM - 1.5, y + 5) : Math.max(2.5, y - 4.5);
      labels.append(
        el('line', { x1: x, y1: below ? y + 0.8 : y - 0.8, x2: x, y2: below ? ty - 1.6 : ty + 0.8, class: 'hbw-evo-lead' }),
        el('text', { x, y: below ? ty : ty, 'text-anchor': 'middle', class: 'hbw-evo-lab' }, l.text),
      );
    }
  };
  const render = (w, st) => {
    trace.setAttribute('d', pathFor(w));
    ref.style.display = st && st.id !== stages[0].id ? '' : 'none';
    if (st?.alt) {
      alt.setAttribute('d', pathFor({ ...w, ...st.alt }));
      alt.style.display = '';
    } else alt.style.display = 'none';
  };
  const show = (i) => {
    cur = (i + stages.length) % stages.length;
    const st = stages[cur];
    root.querySelectorAll('[data-evo]').forEach((b) => {
      const on = +b.dataset.evo === cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    info.innerHTML = `<p><b>${cur + 1}. ${st.zh}</b> <span class="muted">（${st.when}）</span></p><p>${mode === 'plain' ? st.plain : st.text}</p>`;
    cancelAnimationFrame(raf);
    labels.replaceChildren();
    alt.style.display = 'none';
    const from = shownW;
    const to = st.w;
    if (reduce) {
      shownW = to;
      render(to, st);
      drawLabels(st, to);
      return;
    }
    const t0 = performance.now();
    const DUR = 700;
    const step = (now) => {
      if (!root.isConnected) return;
      const k = Math.min(1, (now - t0) / DUR);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      shownW = lerpW(from, to, e);
      render(shownW, k === 1 ? st : null);
      if (k < 1) raf = requestAnimationFrame(step);
      else drawLabels(st, to);
    };
    raf = requestAnimationFrame(step);
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    playBtn.textContent = '▶ 自动播放';
  };
  const play = () => {
    if (cur === stages.length - 1) show(0);
    playBtn.textContent = '❚❚ 暂停';
    timer = setInterval(() => {
      if (!root.isConnected) return stop();
      if (cur === stages.length - 1) return stop();
      show(cur + 1);
    }, 2600);
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-evo]');
    if (b) {
      stop();
      show(+b.dataset.evo);
      return;
    }
    const a = e.target.closest('[data-evo-act]')?.dataset.evoAct;
    if (a === 'prev') (stop(), show(Math.max(0, cur - 1)));
    if (a === 'next') (stop(), show(Math.min(stages.length - 1, cur + 1)));
    if (a === 'play') (timer ? stop() : play());
  });
  render(stages[0].w, stages[0]);
  show(0);
}
