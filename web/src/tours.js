// 导览：步骤用数据描述，播放器统一执行（见 docs/迁移经验-心电图教学.md 第二节）。
//
// 步骤字段：
//   title        标题
//   plain / pro  通俗说明 / 专业补充（可含 {占位符}，运行时用本例数据替换，保证"本例……"与数据一致）
//   case         病例 id（省略则沿用上一步）
//   cursor       {beat, phase, frac}：光标放在第 beat 个心搏的某时相的 frac 处；phase 可为 P / PR / QRS / ST / T / TP / R
//   lead         选中的导联
//   view         {showWaves, showRef, speed, mtab}
//   caliper      {from: beat, to: beat, march}：在节律条上放卡尺（R 峰到 R 峰）
//   play         true = 进入该步后自动慢动作播放
//   focus        要高亮的面板（CSS 选择器）
//   next         最后一步可给出 {tour, label}，串联到下一条导览

export const TOURS = [
  {
    id: 'what-is-ecg',
    title: '心电图是什么：一次心跳的慢动作',
    audience: '入门 · 适合所有人',
    steps: [
      {
        title: '先看原始波形',
        case: 'ptbxl-33',
        view: { showWaves: false, showRef: false, speed: 25, mtab: 'intervals' },
        cursor: null,
        lead: 'II',
        focus: '.paper-wrap',
        plain:
          '这是一位 49 岁女性的正常心电图。先不看颜色，只看曲线：它由一次又一次重复的"心跳"组成。上面三行是 12 个导联（每个从不同方向看心脏），最下面一长条是 II 导联完整的 10 秒。',
        pro: '标准 3×4 排版 + II 导联节律条，25 mm/s，10 mm/mV。每行开头的方波是 1 mV 标定脉冲。',
      },
      {
        title: '每次心跳有三个主要的波',
        view: { showWaves: true },
        focus: '.paper-wrap',
        plain:
          '打开着色后：<b class="c-p">蓝色是 P 波</b>，<b class="c-qrs">红色是 QRS 波群</b>，<b class="c-t">绿色是 T 波</b>。一次心跳就是 P → QRS → T，然后休息一下，再来下一次。',
        pro: '着色依据 ECGDeli 自动标注的起止点，未经人工校对。',
      },
      {
        title: 'P 波：心房"通电"',
        cursor: { beat: 3, phase: 'P', frac: 0.6 },
        lead: 'II',
        focus: '.now-card',
        plain:
          '光标停在 P 波上。电信号从右心房上方的窦房结出发，传遍两个心房，心房随后收缩。看下方 3D 心脏，心房变成了橙色。',
      },
      {
        title: 'PR 段：在"关口"停一下',
        cursor: { beat: 3, phase: 'PR', frac: 0.5 },
        focus: '.now-card',
        plain:
          '信号在房室结稍作停留，让心房有时间把血送进心室。这时体表几乎测不到电信号，所以是一段平线。本例从 P 波开始到 QRS 开始（PR 间期）约 {pr} 毫秒。',
      },
      {
        title: 'QRS 波群：心室"通电"',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        focus: '.heart-card',
        plain:
          '最高最尖的波。信号沿"高速公路"迅速传遍两个心室，约 {qrs} 毫秒就完成了。看 3D 心脏：心室从室间隔开始变色，再扩展到心尖和侧壁。',
        pro: '室间隔中部最先除极，后基底部最晚（Durrer 1970）。紫色箭头为此刻的心电向量。',
      },
      {
        title: 'T 波：心室"复位"',
        cursor: { beat: 3, phase: 'T', frac: 0.5 },
        focus: '.now-card',
        plain: '心室"断电复位"，为下一次跳动做准备，心室开始放松。',
      },
      {
        title: '两次心跳之间：休息',
        cursor: { beat: 3, phase: 'TP', frac: 0.5 },
        focus: '.now-card',
        plain: '一段平线，心脏在两次跳动之间休息，心室充盈血液。心跳越快，这段越短。',
      },
      {
        title: '慢动作看一遍',
        cursor: { beat: 2, phase: 'P', frac: 0 },
        play: true,
        focus: '.paper-wrap',
        plain:
          '现在以慢动作连续播放。留意下方三处同步变化：讲解文字、六轴图上的紫色箭头、3D 心脏的颜色。按空格键可以随时暂停。',
      },
      {
        title: '心率怎么算',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        caliper: { from: 3, to: 4, march: true },
        focus: '.paper-wrap',
        plain:
          '卡尺量出相邻两次心跳的间隔（RR 间期）。心率 = 60000 ÷ RR（毫秒）。本例平均心率约 {hr} 次/分。虚线是按同样间隔"复制"出来的：每次都和下一个 QRS 对齐，说明节律规整。',
      },
      {
        title: '小结',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        focus: null,
        plain:
          '一次心跳 = P（心房通电）→ PR 段（停一下）→ QRS（心室通电）→ T（心室复位）→ 休息。顶栏"读图入门"讲了 12 个导联是怎么来的；也可以接着看下一条导览。',
        next: { tour: 'hypertension', label: '继续：高血压与心电图 →' },
      },
    ],
  },
  {
    id: 'hypertension',
    title: '高血压与心电图',
    audience: '患者与医学生',
    steps: [
      {
        title: '高血压为什么会在心电图上留下痕迹',
        case: 'ptbxl-33',
        view: { showWaves: true, showRef: false, speed: 25, mtab: 'lvh' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'V5',
        focus: '.measure-card',
        plain:
          '血压长期偏高，左心室每次都要用更大的力气把血泵出去，久而久之心肌会变厚（左心室肥厚），就像经常锻炼的肌肉会变粗。变厚的心肌产生的电信号更强，心电图上的波就更高、更深。先看正常人：本例 Sokolow-Lyon 电压为 {sokolow} mV，没有达到 3.5 mV 的标准。',
        pro: '右栏"左室肥厚电压"页列出四种常用电压标准，并对比 GE、Glasgow 两种算法和本站的计算。',
      },
      {
        title: '左心室肥厚：电压增高',
        case: 'ptbxl-10171',
        view: { mtab: 'lvh' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'V1',
        focus: '.measure-card',
        plain:
          '这位 77 岁女性被诊断为左心室肥厚。对比正常人：V1 导联向下的 S 波更深，V5、V6 向上的 R 波更高。本例 Sokolow-Lyon 为 {sokolow} mV，超过了 3.5 mV。数据库没有提供她的病史，但长期高血压是左心室肥厚最常见的原因之一。',
      },
      {
        title: '标准只是一条"线"',
        case: 'ptbxl-20211',
        view: { mtab: 'lvh' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'V5',
        focus: '.measure-card',
        plain:
          '这位 43 岁男性的电压正好在标准边缘：Sokolow-Lyon 本站算出 {sokolow} mV，GE 算法 {sokolow:12sl} mV，Glasgow 算法 {sokolow:unig} mV，以 3.5 mV 为界，有的算"达到"、有的算"没达到"。Cornell 电压 {cornell} mV，没有达到男性 2.8 mV 的标准。同一份心电图，测量方法稍有不同，结论就可能不同。更重要的是：心电图发现左心室肥厚的能力有限，"没达到标准"不能说明心脏没有变厚，确诊通常要靠心脏超声。',
        pro: '心电图电压标准敏感性较低、特异性较高（AHA/ACCF/HRS 2009 第五部分）。',
      },
      {
        title: '伴有 ST-T 改变（"劳损"）',
        case: 'ptbxl-13904',
        view: { mtab: 'st', showRef: true },
        cursor: { beat: 4, phase: 'ST', frac: 0.6 },
        lead: 'V5',
        focus: '.measure-card',
        plain:
          '这位 73 岁女性除了电压很高（四项标准全部达到），侧壁导联（I、aVL、V5、V6）的 ST 段还压低，I、aVL 的 T 波倒置，V5、V6 的 T 波低平，常称为"劳损"型改变。紫色虚线是本站用作零点的 PR 段：本例 V5 在 J 点后 80 ms 低于它 {st80:V5} mV。V1、V2 的 ST 抬高是左心室肥厚时常见的对应改变。',
        pro: '类似的 ST-T 改变也可见于心肌缺血、药物（如洋地黄）等，需结合临床判断。',
      },
      {
        title: '左心房增大',
        case: 'ptbxl-17160',
        view: { mtab: 'intervals', showRef: false },
        cursor: { beat: 3, phase: 'P', frac: 0.85 },
        lead: 'V1',
        focus: '.paper-wrap',
        plain:
          '左心室变厚、变"硬"后，左心房的压力也会升高，逐渐扩大。心电图上看 P 波：本例 P 波宽约 {pdur} 毫秒（正常一般小于 120），V1 导联 P 波的后半部分向下且较深。',
        pro: 'V1 P 波终末负向部分 ≥ 1 mm 深、≥ 40 ms 宽（Morris 指数 ≥ 0.04 mm·s），提示左心房异常。',
      },
      {
        title: '心房颤动',
        case: 'ptbxl-8215',
        view: { mtab: 'intervals' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        caliper: { from: 3, to: 4, march: true },
        lead: 'II',
        focus: '.paper-wrap',
        plain:
          '心房扩大后，心房里的电信号可能变得杂乱无章，这就是心房颤动（房颤）。看三点：没有 P 波；QRS 之前只有细小、不规则的波动（有时几乎看不出来）；心跳间隔忽长忽短。卡尺的虚线不再和后面的 QRS 对齐，本例相邻心跳的间隔从 {rrmin} 到 {rrmax} 毫秒不等。高血压是房颤的常见危险因素之一，房颤会增加中风风险。',
      },
      {
        title: '降压药也可能改变心电图',
        case: 'ptbxl-6998',
        view: { mtab: 'intervals' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        caliper: { from: 3, to: 4, march: true },
        lead: 'II',
        focus: '.measure-card',
        plain:
          '这是一例窦性心动过缓，本例心率约 {hr} 次/分（低于 60）。心动过缓可见于运动员、睡眠时，也可能与某些降压药（如 β 受体阻滞剂）有关；本例数据库没有用药记录。另外，利尿剂可能降低血钾，使 U 波变明显、QT 延长；一些药物（如普利类、沙坦类、螺内酯）可能升高血钾，使 T 波高尖。',
        pro: '药物对心电图的影响因人而异，是否需要调整药物要由医生判断。',
      },
      {
        title: '小结',
        focus: null,
        plain:
          '高血压可能在心电图上留下这些痕迹：左心室电压增高、ST-T 改变、P 波增宽（左心房增大）、心房颤动。心电图可以提示问题，但不能代替心脏超声和医生的判断。如果出现胸痛、晕厥、明显心慌或气短，请及时就医。',
      },
    ],
  },
];

// ---------------------------------------------------------------- 占位符：用本例数据替换

const fmt2 = (v) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(2));
const fmt0 = (v) => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toString());

function measure(meta, key) {
  const order = ['unig', '12sl', 'area', 'ludb'];
  for (const id of order) {
    const v = meta.measurements.find((m) => m.id === id)?.values?.[key];
    if (v != null) return v;
  }
  return null;
}

/** @param ctx {meta, lvh: 本站计算的电压标准结果, lvhBy: {来源 id: 结果}} */
export function fillTemplate(text, ctx) {
  const { meta, lvh, lvhBy } = ctx;
  const pick = (src) => (src ? lvhBy?.[src] : lvh);
  const beats = meta.annotations?.beats ?? [];
  const own = meta.amplitudes?.find((a) => a.id === 'area')?.values;
  const rr = beats.slice(1).map((b, i) => b.QRS.on - beats[i].QRS.on);
  const pd = beats.filter((b) => b.P).map((b) => b.P.off - b.P.on).sort((a, b) => a - b);
  const table = {
    hr: () => fmt0(measure(meta, 'HR_bpm')),
    pr: () => fmt0(measure(meta, 'PR_ms')),
    qrs: () => fmt0(measure(meta, 'QRS_ms')),
    qt: () => fmt0(measure(meta, 'QT_ms')),
    // {sokolow} 用本站计算；{sokolow:12sl}、{sokolow:unig} 用对应算法
    sokolow: (src) => fmt2(pick(src)?.find((c) => c.id === 'sokolow')?.value),
    cornell: () => fmt2(lvh?.find((c) => c.id === 'cornell')?.value),
    ravl: () => fmt2(lvh?.find((c) => c.id === 'ravl')?.value),
    peguero: () => fmt2(lvh?.find((c) => c.id === 'peguero')?.value),
    pdur: () => fmt0(pd.length ? pd[pd.length >> 1] : null),
    rrmin: () => fmt0(rr.length ? Math.min(...rr) : null),
    rrmax: () => fmt0(rr.length ? Math.max(...rr) : null),
    st80: (lead) => fmt2(own?.[lead]?.ST80 != null ? Math.abs(own[lead].ST80) : null),
  };
  return text.replace(/\{(\w+)(?::(\w+))?\}/g, (m, name, arg) => (table[name] ? table[name](arg) : m));
}

/** 光标位置：第 beat 个心搏某时相的 frac 处（ms）；R = QRS 峰值 */
export function cursorTime(beats, spec) {
  if (!spec) return null;
  const i = Math.min(Math.max(0, spec.beat), beats.length - 1);
  const b = beats[i];
  if (!b) return null;
  const next = beats[i + 1];
  const f = spec.frac ?? 0.5;
  const lerp = (a, z) => a + (z - a) * f;
  switch (spec.phase) {
    case 'P':
      return b.P ? lerp(b.P.on, b.P.off) : lerp(b.QRS.on - 120, b.QRS.on);
    case 'PR':
      return b.P ? lerp(b.P.off, b.QRS.on) : b.QRS.on - 20;
    case 'QRS':
      return lerp(b.QRS.on, b.QRS.off);
    case 'R':
      return b.QRS.peak ?? lerp(b.QRS.on, b.QRS.off);
    case 'ST':
      return b.T ? lerp(b.QRS.off, b.T.on) : b.QRS.off + 40;
    case 'T':
      return b.T ? lerp(b.T.on, b.T.off) : b.QRS.off + 200;
    case 'TP': {
      const end = next ? (next.P ? next.P.on : next.QRS.on - 120) : (b.T?.off ?? b.QRS.off) + 250;
      const start = b.T ? b.T.off : b.QRS.off + 300;
      return lerp(start, Math.max(start, end));
    }
    default:
      return b.QRS.on;
  }
}
