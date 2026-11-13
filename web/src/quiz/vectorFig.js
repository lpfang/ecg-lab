// 测验"看向量找导联"用的示意图：六轴系统 + 一个向量箭头，不显示投影和数值（否则直接泄露答案）。
// 坐标与 axes2d.js 一致：x 向右 = 患者左侧，y 向下 = 下方；角度从 I 导联正极起顺时针为正。

import { FRONTAL_AXES } from '../vcg/vector.js';

const C = 122; // 外圈留出导联名与方位字两圈文字，互不重叠
const R = 78;

export function vectorFigure(deg, { reveal = null } = {}) {
  const rad = (d) => (d * Math.PI) / 180;
  const pt = (d, r) => [C + r * Math.cos(rad(d)), C + r * Math.sin(rad(d))];
  const axes = FRONTAL_AXES.map((a) => {
    const [x1, y1] = pt(a.deg, R);
    const [x2, y2] = pt(a.deg + 180, R);
    const [lx, ly] = pt(a.deg, R + 16);
    const hl = reveal === a.lead;
    return (
      `<line x1="${x2}" y1="${y2}" x2="${C}" y2="${C}" class="qv-neg"/>` +
      `<line x1="${C}" y1="${C}" x2="${x1}" y2="${y1}" class="qv-pos${hl ? ' hl' : ''}"/>` +
      `<text x="${lx}" y="${ly}" class="qv-lab${hl ? ' hl' : ''}">${a.lead}</text>`
    );
  }).join('');
  const [vx, vy] = pt(deg, R - 6);
  const head = (d) => pt(deg + d, 11).map((v, i) => v - [C, C][i]);
  const [h1x, h1y] = head(155);
  const [h2x, h2y] = head(-155);
  return `<svg viewBox="0 0 244 244" class="qv-fig" role="img" aria-label="额面六轴系统与心电向量">
    <circle cx="${C}" cy="${C}" r="${R}" class="qv-ring"/>
    ${axes}
    <text x="${C}" y="10" class="qv-dir">上</text><text x="${C}" y="241" class="qv-dir">下</text>
    <text x="7" y="${C + 4}" class="qv-dir">右</text><text x="237" y="${C + 4}" class="qv-dir">左</text>
    <line x1="${C}" y1="${C}" x2="${vx}" y2="${vy}" class="qv-vec"/>
    <path d="M${vx},${vy} l${h1x},${h1y} M${vx},${vy} l${h2x},${h2y}" class="qv-vec"/>
  </svg>`;
}
