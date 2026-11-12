// 读图入门：12 导联是怎么来的。三张示意图（电极位置、肢体导联与六轴系统、胸导联）+ 心电图纸对照。
// 点任意导联名，三张图同时高亮相关的电极与导联轴。
// 电极位置依据 AHA/ACC/HRS 心电图标准化建议第一部分（Kligfield 2007，refs.js 中的 aha1）。

import { FRONTAL_AXES, CHEST_AXES } from '../vcg/vector.js';

const NS = 'http://www.w3.org/2000/svg';

/** 每个导联：用到哪些电极、通俗说明、专业说明 */
export const LEAD_INFO = {
  I: { elec: ['RA', 'LA'], plain: '= 左手电极的电位减去右手电极的电位。它从患者左侧看心脏：心脏的电信号朝左手方向传播时，左手一侧电位较高，相减得正数，波形向上。', pro: 'I = LA − RA，额面 0°。' },
  II: { elec: ['RA', 'LL'], plain: '= 左脚电极的电位减去右手电极的电位。它从左下方看心脏。正常心脏电信号的总体传播方向和它最接近，所以 P 波通常最清楚，常用来看节律。', pro: 'II = LL − RA，额面 +60°。' },
  III: { elec: ['LA', 'LL'], plain: '= 左脚电极的电位减去左手电极的电位。它从右下方看心脏。', pro: 'III = LL − LA，额面 +120°。满足 II = I + III（Einthoven 定律）。' },
  aVR: { elec: ['RA', 'LA', 'LL'], plain: '= 右手电极的电位减去左手、左脚两个电极电位的平均值。它从右肩方向看心脏。正常心脏的电信号大多朝左下方传播，背离右肩而去，所以 aVR 的波形大多向下。', pro: 'aVR = RA − (LA + LL)/2，额面 −150°（Goldberger 加压导联）。' },
  aVL: { elec: ['LA', 'RA', 'LL'], plain: '= 左手电极的电位减去右手、左脚两个电极电位的平均值。它从左肩方向看心脏。', pro: 'aVL = LA − (RA + LL)/2，额面 −30°。' },
  aVF: { elec: ['LL', 'RA', 'LA'], plain: '= 左脚电极的电位减去右手、左手两个电极电位的平均值。它从正下方（脚的方向）看心脏。', pro: 'aVF = LL − (RA + LA)/2，额面 +90°。' },
  V1: { elec: ['V1'], plain: '贴在胸骨右缘第 4 肋间，从右前方看，离右心室和室间隔最近。（每个胸导联 = 该胸前电极的电位减去三个肢体电极电位的平均值。）', pro: 'V1 = 电极电位 − 中心电端（Wilson 中心电端 = (RA + LA + LL)/3）。' },
  V2: { elec: ['V2'], plain: '胸骨左缘第 4 肋间，从正前方看，大致对着室间隔。', pro: 'V2：第 4 肋间胸骨左缘。' },
  V3: { elec: ['V3'], plain: '在 V2 和 V4 中间，大致对着左心室前壁。', pro: 'V3：V2 与 V4 连线的中点。' },
  V4: { elec: ['V4'], plain: '第 5 肋间、锁骨中线（乳头正下方附近），大致对着左心室前壁和心尖。', pro: 'V4：第 5 肋间锁骨中线。' },
  V5: { elec: ['V5'], plain: '和 V4 同一高度、往外到腋前线，从左前侧方看。', pro: 'V5：与 V4 同一水平，腋前线。' },
  V6: { elec: ['V6'], plain: '和 V4 同一高度、腋下正中，从左侧看，大致对着左心室侧壁。', pro: 'V6：与 V4 同一水平，腋中线。' },
};

export const LEADS = Object.keys(LEAD_INFO);

const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

// ---------------------------------------------------------------- 图 1：电极位置（正面，患者右侧在观察者左侧）

const ELECTRODES = {
  RA: { x: 52, y: 214, label: '右手', note: 'RA' },
  LA: { x: 248, y: 214, label: '左手', note: 'LA' },
  RL: { x: 122, y: 392, label: '右脚（接地）', note: 'RL' },
  LL: { x: 178, y: 392, label: '左脚', note: 'LL' },
  // 胸导联：label 指定标签位置（避免挤在一起）
  V1: { x: 140, y: 146, label: 'above' },
  V2: { x: 160, y: 146, label: 'above' },
  V3: { x: 171, y: 160, label: 'below' },
  V4: { x: 185, y: 171, label: 'below' },
  V5: { x: 203, y: 171, label: 'below' },
  V6: { x: 218, y: 171, label: 'right' },
};

function bodyFigure() {
  const svg = el('svg', { viewBox: '0 0 300 410', class: 'pr-fig', role: 'img', 'aria-label': '电极位置示意图' });
  // 人体轮廓
  svg.append(
    el('circle', { cx: 150, cy: 42, r: 26, class: 'pr-body' }),
    el('path', {
      d: 'M100 78 Q150 66 200 78 L232 104 L262 210 L246 216 L214 128 L214 250 Q214 262 206 268 L192 394 L166 394 L156 270 L144 270 L134 394 L108 394 L94 268 Q86 262 86 250 L86 128 L54 216 L38 210 L68 104 Z',
      class: 'pr-body',
    }),
  );
  // 胸骨与心脏轮廓（示意）
  svg.append(
    el('line', { x1: 150, y1: 96, x2: 150, y2: 170, class: 'pr-sternum' }),
    el('path', { d: 'M138 150 Q150 128 176 140 Q206 156 196 178 Q184 196 160 186 Q136 174 138 150 Z', class: 'pr-heart' }),
    el('text', { x: 150, y: 92, class: 'pr-tiny', 'text-anchor': 'middle' }, '胸骨'),
  );
  for (const [id, e] of Object.entries(ELECTRODES)) {
    const chest = id.startsWith('V');
    const g = el('g', { class: `pr-elec${id === 'RL' ? ' ground' : ''}`, 'data-elec': id });
    g.append(el('circle', { cx: e.x, cy: e.y, r: chest ? 5.5 : 8 }));
    if (chest) {
      const [dx, dy, anchor] = { above: [0, -9, 'middle'], below: [0, 17, 'middle'], right: [9, 4, 'start'] }[e.label];
      g.append(el('text', { x: e.x + dx, y: e.y + dy, 'text-anchor': anchor, class: 'pr-elab' }, id));
    } else if (id === 'RL' || id === 'LL') {
      // 脚：标签放在腿的外侧
      const left = id === 'RL';
      g.append(el('text', { x: e.x + (left ? -12 : 12), y: e.y + 4, 'text-anchor': left ? 'end' : 'start', class: 'pr-elab' }, `${e.label} ${e.note}`));
    } else {
      const left = e.x < 150;
      g.append(el('text', { x: e.x + (left ? -2 : 2), y: e.y + 22, 'text-anchor': left ? 'start' : 'end', class: 'pr-elab' }, `${e.label} ${e.note}`));
    }
    svg.append(g);
  }
  svg.append(
    el('text', { x: 8, y: 14, class: 'pr-tiny' }, '患者右侧'),
    el('text', { x: 292, y: 14, class: 'pr-tiny', 'text-anchor': 'end' }, '患者左侧'),
  );
  return svg;
}

// ---------------------------------------------------------------- 小图：通电的波就像一节电池

function whyFigure() {
  const svg = el('svg', { viewBox: '0 0 300 170', class: 'pr-fig', role: 'img', 'aria-label': '除极波与导联极性示意图' });
  svg.append(
    // 心肌条：左半已通电（−），右半未通电（+）
    el('rect', { x: 50, y: 52, width: 100, height: 36, class: 'pr-depol' }),
    el('rect', { x: 150, y: 52, width: 100, height: 36, class: 'pr-rest' }),
    el('line', { x1: 150, y1: 46, x2: 150, y2: 94, class: 'pr-front' }),
    el('text', { x: 100, y: 75, 'text-anchor': 'middle', class: 'pr-sign' }, '− − −'),
    el('text', { x: 200, y: 75, 'text-anchor': 'middle', class: 'pr-sign' }, '+ + +'),
    el('text', { x: 100, y: 44, 'text-anchor': 'middle', class: 'pr-tiny' }, '已通电'),
    el('text', { x: 200, y: 44, 'text-anchor': 'middle', class: 'pr-tiny' }, '还没通电'),
    el('path', { d: 'M120 112 L180 112', class: 'pr-wave', 'marker-end': 'url(#pr-arrow2)' }),
    el('text', { x: 150, y: 128, 'text-anchor': 'middle', class: 'pr-cap' }, '通电的波朝左手方向传播'),
  );
  svg.insertAdjacentHTML(
    'afterbegin',
    '<defs><marker id="pr-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7c3aed"/></marker></defs>',
  );
  for (const [x, t, sub] of [
    [24, '右手', '电位低'],
    [276, '左手', '电位高'],
  ]) {
    const g = el('g', { class: 'pr-elec' });
    g.append(el('circle', { cx: x, cy: 70, r: 8 }));
    svg.append(g, el('text', { x, y: 152, 'text-anchor': 'middle', class: 'pr-elab' }, t), el('text', { x, y: 165, 'text-anchor': 'middle', class: 'pr-tiny' }, sub));
  }
  svg.append(el('text', { x: 150, y: 152, 'text-anchor': 'middle', class: 'pr-elab' }, 'I = 高 − 低 > 0，波形向上'));
  return svg;
}

// ---------------------------------------------------------------- 图 2：Einthoven 三角 → 六轴系统

function limbFigure() {
  const svg = el('svg', { viewBox: '0 0 560 270', class: 'pr-fig wide', role: 'img', 'aria-label': '肢体导联与六轴系统示意图' });
  // 左：三角形。RA 左上、LA 右上、LL 下方，心脏在中心
  const RA = [40, 50];
  const LA = [240, 50];
  const LL = [140, 223];
  const O = [140, 108];
  const line = (a, b, lead, cls) =>
    el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls, 'data-lead': lead, 'marker-end': 'url(#pr-arrow)' });
  svg.append(
    el('defs', {}),
  );
  svg.firstChild.innerHTML =
    '<marker id="pr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#78716c"/></marker>';
  svg.append(
    el('text', { x: 140, y: 16, 'text-anchor': 'middle', class: 'pr-cap' }, '① 三个肢体电极连成三角形'),
    line(RA, LA, 'I', 'pr-edge'),
    line(RA, LL, 'II', 'pr-edge'),
    line(LA, LL, 'III', 'pr-edge'),
    line(O, RA, 'aVR', 'pr-aug'),
    line(O, LA, 'aVL', 'pr-aug'),
    line(O, LL, 'aVF', 'pr-aug'),
    el('path', { d: 'M126 104 Q140 92 158 100 Q172 110 162 122 Q150 132 136 124 Q122 116 126 104 Z', class: 'pr-heart' }),
  );
  const tl = (x, y, t, lead, anchor = 'middle') => {
    const e = el('text', { x, y, 'text-anchor': anchor, class: 'pr-llab', 'data-lead': lead }, t);
    svg.append(e);
  };
  tl(140, 42, 'I', 'I');
  tl(78, 142, 'II', 'II', 'end');
  tl(202, 142, 'III', 'III', 'start');
  tl(96, 72, 'aVR', 'aVR');
  tl(184, 72, 'aVL', 'aVL');
  tl(150, 178, 'aVF', 'aVF', 'start');
  for (const [p, t, id] of [
    [RA, '右手', 'RA'],
    [LA, '左手', 'LA'],
    [LL, '左脚', 'LL'],
  ]) {
    const g = el('g', { class: 'pr-elec', 'data-elec': id });
    g.append(el('circle', { cx: p[0], cy: p[1], r: 7 }));
    g.append(el('text', { x: p[0], y: p[1] + (id === 'LL' ? 22 : -12), 'text-anchor': 'middle', class: 'pr-elab' }, t));
    svg.append(g);
  }
  // 中间箭头
  svg.append(
    el('text', { x: 300, y: 128, 'text-anchor': 'middle', class: 'pr-cap' }, '② 平移到'),
    el('text', { x: 300, y: 146, 'text-anchor': 'middle', class: 'pr-cap' }, '同一中心'),
    el('path', { d: 'M276 160 L324 160', class: 'pr-move', 'marker-end': 'url(#pr-arrow)' }),
  );
  // 右：六轴系统
  const C = [450, 140];
  const R = 92;
  svg.append(el('text', { x: 450, y: 16, 'text-anchor': 'middle', class: 'pr-cap' }, '③ 六轴系统（从正面看）'));
  svg.append(el('circle', { cx: C[0], cy: C[1], r: R, class: 'pr-ring' }));
  for (const ax of FRONTAL_AXES) {
    const r = (ax.deg * Math.PI) / 180;
    const ux = Math.cos(r);
    const uy = Math.sin(r);
    svg.append(
      el('line', { x1: C[0] - ux * R, y1: C[1] - uy * R, x2: C[0], y2: C[1], class: 'pr-neg', 'data-lead': ax.lead }),
      el('line', { x1: C[0], y1: C[1], x2: C[0] + ux * R, y2: C[1] + uy * R, class: 'pr-axis', 'data-lead': ax.lead }),
    );
    const lx = C[0] + ux * (R + 18);
    const ly = C[1] + uy * (R + 14) + 4;
    const sign = ax.deg > 0 ? '+' : ax.deg < 0 ? '−' : '';
    const t = el('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'pr-llab', 'data-lead': ax.lead }, `${ax.lead}`);
    svg.append(t);
    svg.append(el('text', { x: lx, y: ly + 11, 'text-anchor': 'middle', class: 'pr-deg' }, `${sign}${Math.abs(ax.deg)}°`));
  }
  svg.append(el('circle', { cx: C[0], cy: C[1], r: 3, fill: '#57534e' }));
  return svg;
}

// ---------------------------------------------------------------- 图 3：胸导联（水平面，从上往下看，胸前朝下）

function chestFigure() {
  const svg = el('svg', { viewBox: '0 0 320 250', class: 'pr-fig', role: 'img', 'aria-label': '胸导联示意图' });
  const C = [150, 118];
  const A = 128; // 胸廓椭圆半轴
  const B = 92;
  svg.append(
    el('ellipse', { cx: 160, cy: 118, rx: A, ry: B, class: 'pr-body' }),
    el('text', { x: 160, y: 18, 'text-anchor': 'middle', class: 'pr-tiny' }, '后（背部）'),
    el('text', { x: 160, y: 244, 'text-anchor': 'middle', class: 'pr-tiny' }, '前（胸前）'),
    el('text', { x: 20, y: 122, class: 'pr-tiny' }, '右'),
    el('text', { x: 300, y: 122, class: 'pr-tiny', 'text-anchor': 'end' }, '左'),
    el('ellipse', { cx: C[0] + 6, cy: C[1] + 8, rx: 34, ry: 26, class: 'pr-heart' }),
    el('text', { x: C[0] + 6, y: C[1] + 12, 'text-anchor': 'middle', class: 'pr-tiny' }, '心脏'),
  );
  // 从心脏中心沿示意方向射出，与胸廓椭圆相交处即电极
  for (const ax of CHEST_AXES) {
    const r = (ax.deg * Math.PI) / 180;
    const ux = Math.cos(r);
    const uy = Math.sin(r);
    // 求射线与椭圆 ((x-160)/A)^2 + ((y-118)/B)^2 = 1 的交点
    const dx = C[0] - 160;
    const dy = C[1] - 118;
    const a = (ux / A) ** 2 + (uy / B) ** 2;
    const b = 2 * ((dx * ux) / A ** 2 + (dy * uy) / B ** 2);
    const c = (dx / A) ** 2 + (dy / B) ** 2 - 1;
    const s = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    const p = [C[0] + ux * s, C[1] + uy * s];
    svg.append(el('line', { x1: C[0], y1: C[1], x2: p[0], y2: p[1], class: 'pr-axis', 'data-lead': ax.lead }));
    const g = el('g', { class: 'pr-elec', 'data-elec': ax.lead });
    g.append(el('circle', { cx: p[0], cy: p[1], r: 6 }));
    g.append(el('text', { x: p[0] + ux * 16, y: p[1] + uy * 14 + 4, 'text-anchor': 'middle', class: 'pr-llab', 'data-lead': ax.lead }, ax.lead));
    svg.append(g);
  }
  return svg;
}

// ---------------------------------------------------------------- 图 4：心电图纸对照

function paperMap() {
  const rows = [
    ['I', 'aVR', 'V1', 'V4'],
    ['II', 'aVL', 'V2', 'V5'],
    ['III', 'aVF', 'V3', 'V6'],
  ];
  const cell = (l) => `<td class="${l.startsWith('V') ? 'chest' : 'limb'}" data-lead="${l}">${l}</td>`;
  return (
    '<table class="pr-paper"><tbody>' +
    rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('') +
    '<tr><td colspan="4" class="limb rhythm" data-lead="II">II（节律条，完整 10 秒）</td></tr>' +
    '</tbody></table>'
  );
}

// ---------------------------------------------------------------- 组装与交互

let built = false;

export function buildPrimer(root, level) {
  const pro = (txt) =>
    level === 'pro' ? `<p class="pro">${txt}</p>` : `<details class="pro-more"><summary>专业说明</summary><p class="pro">${txt}</p></details>`;
  root.innerHTML = `
    <div class="pr-picker">
      <span class="muted small">点一个导联看看：</span>
      ${LEADS.map((l) => `<button data-pick="${l}">${l}</button>`).join('')}
    </div>
    <p class="pr-info" id="pr-info">每个导联就像一台从固定方向"看"心脏的相机。点上面的导联名，下面三张图会同时标出它用到的电极和它看心脏的方向。</p>

    <section class="pr-sec" id="pr-sec-intro">
      <h4>一句话</h4>
      <p>做心电图时，身上贴 <b>10 个电极</b>：四肢 4 个，胸前 6 个。仪器把这些电极测到的电位<b>两两相减</b>（或与一个"中心点"相减），
      得到 <b>12 个导联</b>。每个导联从一个固定方向"看"心脏的电活动：心脏的电信号朝着它的方向传播，波形向上；背着它传播，波形向下。</p>
      ${pro('6 个肢体导联（I、II、III、aVR、aVL、aVF）都在额面上，只用到 3 个肢体电极（右脚电极是接地参考）；6 个胸导联（V1–V6）在水平面上，各自与 Wilson 中心电端比较。肢体导联之间并不独立：知道其中任意两个，就能算出其余四个。')}
    </section>

    <section class="pr-sec" id="pr-sec-why">
      <h4>为什么"朝着它来"，波形就向上？</h4>
      <div class="pr-row">
        <div class="pr-figbox" id="pr-fig-why"></div>
        <div class="pr-text">
          <p>心肌细胞"通电"（除极）时，像一排多米诺骨牌依次倒下，一道<b>通电的波</b>从一端传到另一端。
          波<b>前方</b>还没通电的心肌，外表面带<b>正</b>电；波<b>后方</b>已经通电的心肌，外表面带<b>负</b>电。
          所以这道波就像一节电池：<b>它朝哪边传，正极就在哪边</b>。</p>
          <p>以 I 导联为例：电信号朝左手方向传播时，正极朝着左手，左手电极的电位高、右手的低。
          I 导联 = 左手电位 − 右手电位 = 高 − 低 = <b>正数</b>，波形向上。</p>
          <p class="muted small">注意：这里说的是"电信号传播的方向"，不是电路里"电流从高电位流向低电位"的方向。
          在这节"电池"内部，电荷确实朝正极移动；但电极贴在皮肤上，测的是电池<b>外部</b>的电位，正极一侧更高。</p>
        </div>
      </div>
      ${pro('心肌除极波阵面可视为电偶极子，偶极矩由负指向正，与波的传播方向一致。导联电压 ≈ 心电偶极矩（心电向量）在导联轴上的投影：向量指向导联正极一侧时为正。复极时细胞外表面电荷相反，所以复极波朝某导联传播时，该导联记录到负向波；正常 T 波与 QRS 同向，是因为心室复极顺序大体与除极相反。')}
    </section>

    <section class="pr-sec" id="pr-sec-body">
      <h4>图 1　电极贴在哪里</h4>
      <div class="pr-row">
        <div class="pr-figbox" id="pr-fig-body"></div>
        <div class="pr-text">
          <p><b>四肢 4 个</b>：右手、左手、左脚，加上右脚（只作接地，不参与计算）。实际常贴在手腕、脚踝或靠近躯干的四肢上。</p>
          <p><b>胸前 6 个</b>（V1–V6）：</p>
          <ul class="small">
            <li>V1：胸骨<b>右</b>缘第 4 肋间</li>
            <li>V2：胸骨<b>左</b>缘第 4 肋间</li>
            <li>V3：V2 与 V4 中间</li>
            <li>V4：第 5 肋间，锁骨中线</li>
            <li>V5：与 V4 同一高度，腋前线</li>
            <li>V6：与 V4 同一高度，腋中线</li>
          </ul>
          <p class="muted small">注意图中患者的<b>右侧在左边</b>：就像面对面看着对方。</p>
        </div>
      </div>
    </section>

    <section class="pr-sec" id="pr-sec-frontal">
      <h4>图 2　6 个肢体导联与"额面六轴系统"</h4>
      <div class="pr-figbox wide" id="pr-fig-limb"></div>
      <p>① 右手、左手、左脚三点连成一个三角形，心脏大致在中心。三条边就是 <b>I、II、III</b> 导联。
      从中心指向三个角，是 <b>aVR、aVL、aVF</b>。② 把这 6 条线都平移到同一个中心点，③ 就得到一个像车轮的图：
      <b>六轴系统</b>。它表示从<b>身体正面</b>的 6 个方向看心脏，相邻两轴相差 30°。</p>
      <p>本站心电图下方的"额面六轴系统"图就是它：紫色箭头是此刻的<b>心电向量</b>（心脏电信号的总体方向和强度）。
      箭头在某条轴的正极一侧投下的"影子"越长，那个导联的波形就越高；影子落在负极一侧，波形就向下。</p>
      ${pro('角度约定：0° 指向患者左侧（I 导联正极），顺时针为正，+90° 指向足侧（aVF）。按 Einthoven 三角的几何关系，I、II、III 等于额面向量在各轴上的投影；aVR、aVL、aVF 等于投影的 √3/2 倍。所以 II = I + III。额面电轴正常范围约 −30° 至 +90°。')}
    </section>

    <section class="pr-sec" id="pr-sec-chest">
      <h4>图 3　6 个胸导联：从水平方向绕一圈</h4>
      <div class="pr-row">
        <div class="pr-figbox" id="pr-fig-chest"></div>
        <div class="pr-text">
          <p>把胸部横着切开、<b>从头顶往下看</b>（胸前朝下）：V1 到 V6 从心脏的右前方绕到左侧，像一圈从水平方向看心脏的相机。</p>
          <p>V1、V2 离室间隔和右心室近，V3、V4 对着左心室前壁，V5、V6 对着左心室侧壁（都是大致对应）。</p>
          <p class="muted small">图中方向为示意；每个人心脏的位置和角度略有不同。</p>
        </div>
      </div>
      ${pro('胸导联是单极导联：电极电位减去 Wilson 中心电端（(RA + LA + LL)/3）。正常时 R 波从 V1 到 V5 逐渐增高、S 波逐渐变浅（R 波递增），R 与 S 大致相等的过渡区常在 V3–V4。')}
    </section>

    <section class="pr-sec" id="pr-sec-paper">
      <h4>图 4　它们在心电图纸上的位置</h4>
      <div class="pr-row">
        <div>${paperMap()}</div>
        <div class="pr-text small">
          <p>上面 3 行共 12 格，每格是一个导联的 2.5 秒；蓝色是肢体导联，绿色是胸导联。最下面一行是 II 导联完整的 10 秒，用来看节律。</p>
        </div>
      </div>
    </section>

    <p class="muted small">出处：Kligfield P, et al. Recommendations for the standardization and interpretation of the electrocardiogram: Part I. Circulation. 2007;115:1306–1324（尚未逐条核对原文）。</p>
  `;
  root.querySelector('#pr-fig-why').append(whyFigure());
  root.querySelector('#pr-fig-body').append(bodyFigure());
  root.querySelector('#pr-fig-limb').append(limbFigure());
  root.querySelector('#pr-fig-chest').append(chestFigure());
  root.querySelector('.pr-picker').addEventListener('click', (e) => {
    const l = e.target.closest('[data-pick]')?.dataset.pick;
    if (l) selectLead(root, l, level);
  });
  // 图中的导联名、表格格子也可以点
  root.addEventListener('click', (e) => {
    const l = e.target.closest('[data-lead]')?.dataset.lead;
    if (l && !e.target.closest('.pr-picker')) selectLead(root, l, level);
  });
  built = true;
}

export function selectLead(root, lead, level) {
  const info = LEAD_INFO[lead];
  if (!info) return;
  root.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('on', b.dataset.pick === lead));
  root.querySelectorAll('[data-lead]').forEach((e) => e.classList.toggle('hl', e.dataset.lead === lead));
  root.querySelectorAll('[data-elec]').forEach((e) => {
    const i = info.elec.indexOf(e.dataset.elec);
    e.classList.toggle('hl', i === 0); // 正极
    e.classList.toggle('hl2', i > 0); // 参与计算的其他电极
  });
  root.querySelector('#pr-info').innerHTML =
    `<b>${lead} 导联</b>${info.plain.startsWith('=') ? ' ' : '：'}${info.plain}` + (level === 'pro' ? `<span class="pro-inline">${info.pro}</span>` : '');
}

export function isBuilt() {
  return built;
}
