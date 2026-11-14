// 导览：步骤用数据描述，播放器统一执行（见 docs/迁移经验-心电图教学.md 第二节）。
//
// 步骤字段：
//   title        标题
//   plain / pro  通俗说明 / 专业补充（可含 {占位符}，运行时用本例数据替换，保证"本例……"与数据一致）
//   case         病例 id（省略则沿用上一步）
//   cursor       {beat, phase, frac}：光标放在第 beat 个心搏的某时相的 frac 处；phase 可为 P / PR / QRS / ST / T / TP / R
//                {atrial: i}：光标放在第 i 个手工标注的 P 波峰上（房室传导阻滞病例）
//   lead         选中的导联
//   view         {showWaves, showRef, speed, mtab}
//   caliper      {from: beat, to: beat, march}：在节律条上放卡尺（R 峰到 R 峰）
//   play         true = 进入该步后自动慢动作播放
//   focus        聚光灯：要突出的面板（CSS 选择器，一个或数组），其余面板调暗作为背景；null = 都不调暗
//   spot         心电图内的聚光灯 {leads: [...], beat?}：只突出这些导联（及第 beat 个心跳，含其后的休息段），
//                其余部分淡化。讲某个导联、某次心跳时用；讲整体时省略
//   proOpen      （导览级）专业说明直接展开显示，不受"通俗 / 专业"开关影响（医学生路线）
//   read         读片手册中相关章节的 id（讲解下方给出链接）
//   next         最后一步可给出 {tour, label}，串联到下一条导览

import { beatWindow } from './ecg/beats.js';

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
        spot: { leads: ['II'], beat: 3 },
        plain:
          '打开着色后：<b class="c-p">蓝色是 P 波</b>，<b class="c-qrs">红色是 QRS 波群</b>，<b class="c-t">绿色是 T 波</b>。一次心跳就是 P → QRS → T，然后休息一下，再来下一次。',
        pro: '着色依据 ECGDeli 自动标注的起止点，未经人工校对。',
      },
      {
        title: 'P 波：心房"通电"',
        cursor: { beat: 3, phase: 'P', frac: 0.6 },
        lead: 'II',
        focus: ['.paper-wrap', '.now-card', '.heart-card'],
        spot: { leads: ['II'], beat: 3 },
        plain:
          '光标停在 P 波上。电信号从右心房上方的窦房结出发，传遍两个心房，心房随后收缩。看下方 3D 心脏，心房变成了橙色。',
      },
      {
        title: 'PR 段：在"关口"停一下',
        cursor: { beat: 3, phase: 'PR', frac: 0.5 },
        focus: ['.paper-wrap', '.now-card'],
        spot: { leads: ['II'], beat: 3 },
        plain:
          '信号在房室结稍作停留，让心房有时间把血送进心室。这时体表几乎测不到电信号，所以是一段平线。本例从 P 波开始到 QRS 开始（PR 间期）约 {pr} 毫秒。',
      },
      {
        title: 'QRS 波群：心室"通电"',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        focus: ['.paper-wrap', '.heart-card'],
        spot: { leads: ['II'], beat: 3 },
        plain:
          '最高最尖的波。信号沿"高速公路"迅速传遍两个心室，约 {qrs} 毫秒就完成了。看 3D 心脏：心室从室间隔开始变色，再扩展到心尖和侧壁。',
        pro: '室间隔中部最先除极，后基底部最晚（Durrer 1970）。紫色箭头为此刻的心电向量。',
      },
      {
        title: 'T 波：心室"复位"',
        cursor: { beat: 3, phase: 'T', frac: 0.5 },
        focus: ['.paper-wrap', '.now-card'],
        spot: { leads: ['II'], beat: 3 },
        plain: '心室"断电复位"，为下一次跳动做准备，心室开始放松。',
      },
      {
        title: '两次心跳之间：休息',
        cursor: { beat: 3, phase: 'TP', frac: 0.5 },
        focus: ['.paper-wrap', '.now-card'],
        spot: { leads: ['II'], beat: 3 },
        plain: '一段平线，心脏在两次跳动之间休息，心室充盈血液。心跳越快，这段越短。',
      },
      {
        title: '慢动作看一遍',
        cursor: { beat: 2, phase: 'P', frac: 0 },
        play: true,
        // 文字提到的三处同步变化：讲解（此刻框）、六轴图、3D 心脏
        focus: ['.paper-wrap', '.now-card', '.axes-card', '.heart-card'],
        plain:
          '现在以慢动作连续播放。留意下方三处同步变化：讲解文字、六轴图上的紫色箭头、3D 心脏的颜色。按空格键可以随时暂停。',
      },
      {
        title: '心率怎么算',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        caliper: { from: 3, to: 4, march: true },
        focus: '.paper-wrap',
        spot: { leads: ['II'] },
        plain:
          '卡尺量出相邻两次心跳的间隔（RR 间期）。心率 = 60000 ÷ RR（毫秒）。本例平均心率约 {hr} 次/分。虚线是按同样间隔"复制"出来的：每次都和下一个 QRS 对齐，说明节律规整。',
      },
      {
        read: 'p-howto',
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
        focus: ['.measure-card', '.paper-wrap'],
        spot: { leads: ['V1', 'V5', 'V6'] },
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
        focus: ['.measure-card', '.paper-wrap'],
        spot: { leads: ['V1', 'V5', 'V6'] },
        plain:
          '这位 77 岁女性被诊断为左心室肥厚。对比正常人：V1 导联向下的 S 波更深，V5、V6 向上的 R 波更高。本例 Sokolow-Lyon 为 {sokolow} mV，超过了 3.5 mV。数据库没有提供她的病史，但长期高血压是左心室肥厚最常见的原因之一。',
      },
      {
        title: '标准只是一条"线"',
        case: 'ptbxl-20211',
        view: { mtab: 'lvh' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'V5',
        focus: ['.measure-card', '.paper-wrap'],
        spot: { leads: ['V1', 'V5', 'V6'] },
        plain:
          '这位 43 岁男性的电压正好在标准边缘：Sokolow-Lyon 本站算出 {sokolow} mV，GE 算法 {sokolow:12sl} mV，Glasgow 算法 {sokolow:unig} mV，以 3.5 mV 为界，有的算"达到"、有的算"没达到"。Cornell 电压 {cornell} mV，没有达到男性 2.8 mV 的标准；Peguero-Lo Presti 为 {peguero} mV，三种来源都达到了。同一份心电图，测量方法稍有不同，结论就可能不同。更重要的是：心电图发现左心室肥厚的能力有限，"没达到标准"不能说明心脏没有变厚，确诊通常要靠心脏超声。',
        pro: '心电图电压标准敏感性较低、特异性较高（AHA/ACCF/HRS 2009 第五部分）。',
      },
      {
        title: '伴有 ST-T 改变（"劳损"）',
        case: 'ptbxl-13904',
        view: { mtab: 'st', showRef: true },
        cursor: { beat: 4, phase: 'ST', frac: 0.6 },
        lead: 'V5',
        focus: ['.measure-card', '.paper-wrap'],
        // 文字讲的是侧壁导联（I、aVL、V5、V6）的 ST-T 改变
        spot: { leads: ['I', 'aVL', 'V5', 'V6'] },
        plain:
          '这位 73 岁女性除了电压很高（四项标准全部达到），侧壁导联（I、aVL、V5、V6）的 ST 段还压低，I、aVL 的 T 波倒置，V5、V6 的 T 波低平，常称为"劳损"型改变。紫色虚线是本站用作零点的 PR 段：本例 V5 在 J 点后 80 ms 相对它为 {st80:V5} mV（负值表示压低）。V1、V2 的 ST 抬高是左心室肥厚时常见的对应改变。',
        pro: '类似的 ST-T 改变也可见于心肌缺血、药物（如洋地黄）等，需结合临床判断。',
      },
      {
        title: '左心房增大',
        case: 'ptbxl-17160',
        view: { mtab: 'intervals', showRef: false },
        cursor: { beat: 3, phase: 'P', frac: 0.85 },
        lead: 'V1',
        focus: '.paper-wrap',
        spot: { leads: ['II', 'V1'], beat: 3 },
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
        spot: { leads: ['II'] },
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
        focus: ['.measure-card', '.paper-wrap'],
        spot: { leads: ['II'] },
        plain:
          '这是一例窦性心动过缓，本例心率约 {hr} 次/分（低于 60）。心动过缓可见于运动员、睡眠时，也可能与某些降压药（如 β 受体阻滞剂）有关；本例数据库没有用药记录。另外，利尿剂可能降低血钾，使 U 波变明显、QT 延长；一些药物（如普利类、沙坦类、螺内酯）可能升高血钾，使 T 波高尖。',
        pro: '药物对心电图的影响因人而异，是否需要调整药物要由医生判断。',
      },
      {
        read: 'p-htn',
        title: '小结',
        focus: null,
        plain:
          '高血压可能在心电图上留下这些痕迹：左心室电压增高、ST-T 改变、P 波增宽（左心房增大）、心房颤动。心电图可以提示问题，但不能代替心脏超声和医生的判断。如果出现胸痛、晕厥、明显心慌或气短，请及时就医。',
      },
    ],
  },
  {
    id: 'normal-systematic',
    title: '正常心电图：按顺序逐项读',
    audience: '医学生 · 系统读图入门',
    proOpen: true,
    steps: [
      {
        title: '先确认定标和走纸速度',
        case: 'ptbxl-33',
        view: { showWaves: true, showRef: false, speed: 25, mtab: 'intervals' },
        cursor: null,
        lead: 'II',
        focus: '.paper-wrap',
        plain:
          '读任何一份心电图，第一步都是看"尺子"：每行开头的方波是 1 mV 标定脉冲，高 10 mm；走纸速度 25 mm/s，横向 1 小格 = 40 ms。定标不对，后面所有电压和时间的判断都会错。本例是一位 49 岁女性的正常心电图。',
        pro: '系统读图顺序（本导览按此展开）：定标 → 心律 → 心率 → P 波 → PR 间期 → QRS（时限、形态、电轴）→ ST 段 → T 波 → QT/QTc。固定顺序可以避免"看到一个明显异常就停下"而漏掉其他问题。',
      },
      {
        title: '心律：是不是窦性',
        cursor: { beat: 3, phase: 'P', frac: 0.5 },
        lead: 'II',
        focus: '.paper-wrap',
        spot: { leads: ['I', 'II', 'aVR'], beat: 3 },
        plain:
          '窦性心律的 P 波有固定的方向：在 I、II 导联向上，在 aVR 导联向下。本例符合；而且每个 P 波后面都跟着一个 QRS，节律规整。',
        pro: '窦性 P 波：I、II、aVF 直立，aVR 倒置，同一导联形态一致。本例 II 导联 P 波约 +0.14 mV，aVR 约 −0.11 mV（中位心搏）。',
      },
      {
        title: '心率',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        caliper: { from: 3, to: 4, march: true },
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II'] },
        plain:
          '量相邻两个 R 波的间隔（RR 间期），心率 = 60000 ÷ RR（ms）。本例相邻 RR 在 {rrmin}–{rrmax} ms 之间，心率约 {hr} 次/分，在 60–100 的正常范围内。',
        pro: '速算：300 ÷ RR 之间的大格数。节律不齐时用 10 秒内 QRS 个数 × 6。',
      },
      {
        title: 'P 波',
        cursor: { beat: 3, phase: 'P', frac: 0.6 },
        focus: ['.paper-wrap', '.now-card'],
        spot: { leads: ['II', 'V1'], beat: 3 },
        plain: 'P 波代表心房"通电"。看它的宽度和高度：本例 P 波时限约 {pdur} ms（一般小于 120 ms），高度不超过 0.25 mV。',
        pro: 'P 波增宽（≥ 120 ms）、II 导联双峰、V1 终末负向部分深宽提示左心房异常；II 导联 P 波高尖（≥ 0.25 mV）提示右心房异常。',
      },
      {
        title: 'PR 间期',
        cursor: { beat: 3, phase: 'PR', frac: 0.5 },
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II'], beat: 3 },
        plain: '从 P 波开始到 QRS 开始，是信号从心房传到心室的时间。本例 PR 间期约 {pr} ms，在 120–200 ms 的正常范围。',
        pro: 'PR > 200 ms 为一度房室传导阻滞；PR < 120 ms 伴 delta 波提示预激综合征。房室传导阻滞的分级见"房室传导阻滞"导览。',
      },
      {
        title: 'QRS 波群：宽度与胸导联的变化',
        cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
        lead: 'V3',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'], beat: 3 },
        plain:
          '本例 QRS 时限约 {qrs} ms（成人一般小于 120 ms）。从 V1 到 V6，向上的 R 波越来越高、向下的 S 波越来越浅：V1、V2 以 S 波为主，到 V3 变成以 R 波为主。这叫"R 波递增"，是正常胸导联的样子。',
        pro: '移行区（R ≈ S）正常在 V3–V4。本例 R 波：V1 0.27 → V2 0.39 → V3 1.31 mV，移行在 V2–V3 之间（GE 12SL 测量）。R 波递增不良可见于前壁心肌梗死、左心室肥厚、电极位置偏高等。',
      },
      {
        read: 's-axis',
        title: '电轴',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'aVF',
        focus: ['.paper-wrap', '.axes-card'],
        spot: { leads: ['I', 'aVF'], beat: 3 },
        plain:
          'I 导联和 aVF 导联的 QRS 都以向上为主，说明心室电信号的总方向指向左下方，电轴正常。本例 Glasgow 算法测得 {axis}，本站面积法为 {axis:area}。电轴有专门的一条导览。',
        pro: '成人正常电轴 −30° 至 +90°。不同算法（振幅法、面积法、中位心搏）可相差数度，本例两种方法相差 8°。',
      },
      {
        title: 'ST 段',
        cursor: { beat: 3, phase: 'ST', frac: 0.5 },
        view: { showRef: true, mtab: 'st' },
        lead: 'V2',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II', 'V2', 'V5'], beat: 3 },
        plain:
          'ST 段是 QRS 结束到 T 波开始之间的一段，正常时基本平，和 PR 段（紫色虚线，本站用作零点）差不多高。右栏"ST 段"页列出了每个导联的读数。',
        pro: 'ST 偏移以 PR 段（或 TP 段）为参照，在 J 点或 J 点后 60/80 ms 测量。V2、V3 导联的正常 ST 抬高上限与年龄、性别有关（AHA/ACCF/HRS 2009 第六部分）。',
      },
      {
        title: 'T 波',
        cursor: { beat: 3, phase: 'T', frac: 0.5 },
        view: { showRef: false, mtab: 'intervals' },
        lead: 'II',
        focus: ['.paper-wrap', '.now-card'],
        spot: { leads: ['I', 'II', 'aVR', 'V5'], beat: 3 },
        plain: 'T 波通常和 QRS 主波同方向：本例在 I、II、V2–V6 向上，在 aVR 向下（和 aVR 的 QRS 一样）。',
        pro: 'aVR 的 T 波正常倒置；V1 的 T 波可以倒置或低平（本例低平）。T 波倒置的意义取决于导联分布和临床情况。',
      },
      {
        read: 's-intervals',
        title: 'QT 间期',
        cursor: { beat: 3, phase: 'T', frac: 1 },
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II'], beat: 3 },
        plain: '从 QRS 开始到 T 波结束，是心室"通电 + 复位"的总时间。本例 QT 约 {qt} ms。QT 随心率变化，要换算成校正后的 QTc 再判断，右栏测量表给出了几种常用公式的结果。',
        pro: 'QTc（Bazett）男性 > 450 ms、女性 > 460 ms 通常视为延长；心率偏快或偏慢时 Bazett 公式误差较大，可参考 Fridericia 等公式。',
      },
      {
        read: 's-order',
        title: '小结',
        focus: null,
        plain:
          '按顺序读：定标 → 心律 → 心率 → P 波 → PR → QRS（宽度、形态、电轴）→ ST → T → QT。本例每一项都在正常范围内。之后的几条导览会分别展开电轴、房室传导阻滞和束支阻滞。',
        next: { tour: 'axis', label: '继续：电轴 →' },
      },
    ],
  },
  {
    id: 'axis',
    title: '电轴：从六轴系统到本例',
    audience: '医学生',
    proOpen: true,
    steps: [
      {
        title: '六轴系统',
        case: 'ptbxl-33',
        view: { showWaves: true, showRef: false, speed: 25, mtab: 'intervals' },
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'I',
        focus: ['.axes-card', '.paper-wrap'],
        spot: { leads: ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'], beat: 3 },
        plain:
          '6 个肢体导联从 6 个方向"看"心脏，它们的方向画在一起，就是右侧的六轴图。紫色箭头是此刻的心电向量。箭头在某个导联轴上的"影子"（投影）朝正极，那个导联的波形就向上；朝负极就向下。',
        pro: 'I 0°、II +60°、III +120°、aVF +90°、aVL −30°、aVR −150°。额面向量由 I 与 aVF 精确求出（其余肢体导联可由二者线性组合得到）。',
      },
      {
        title: '电轴是"整个 QRS"的平均方向',
        cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
        focus: ['.axes-card', '.paper-wrap'],
        spot: { leads: ['I', 'aVF'], beat: 3 },
        plain:
          '心室"通电"时，向量的方向在不断变化，箭头尖端画出一个环（右侧细红线）。把整个 QRS 期间的向量平均起来，得到的方向就是电轴。本例 Glasgow 算法测得 {axis}，本站面积法为 {axis:area}，都在正常范围（−30° 至 +90°）。',
        pro: '面积法：取 I 与 aVF 导联 QRS 的净面积求向量角。振幅法（R − S）在 QRS 形态复杂时误差较大。',
      },
      {
        title: '快速判断：看 I 和 aVF',
        cursor: { beat: 3, phase: 'R', frac: 0 },
        lead: 'aVF',
        focus: '.paper-wrap',
        spot: { leads: ['I', 'aVF'], beat: 3 },
        plain:
          '只看两个导联就能大致判断：I 和 aVF 都向上 → 正常；I 向上、aVF 向下 → 可能左偏；I 向下、aVF 向上 → 右偏。本例 I、aVF 都以向上为主，电轴正常。',
        pro: 'I 正、aVF 负时，再看 II：II 以正向为主为生理性左偏（0° 至 −30°），II 以负向为主为电轴左偏（< −30°）。',
      },
      {
        title: '电轴左偏',
        case: 'ptbxl-2239',
        cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
        lead: 'II',
        focus: ['.paper-wrap', '.axes-card'],
        spot: { leads: ['I', 'II', 'aVF'], beat: 3 },
        plain:
          '这位 63 岁男性：I 导联向上，II、aVF 以向下的 S 波为主。电轴 {axis}（本站 {axis:area}），明显左偏。本例诊断为左前分支阻滞。',
        pro: '电轴 < −45° 且 QRS < 120 ms、II/III/aVF 呈 rS，是左前分支阻滞的主要标准；需排除下壁心肌梗死等其他电轴左偏原因。',
      },
      {
        title: '电轴右偏',
        case: 'ptbxl-9355',
        cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
        lead: 'I',
        focus: ['.paper-wrap', '.axes-card'],
        spot: { leads: ['I', 'II', 'aVF'], beat: 3 },
        plain:
          '这位 19 岁男性：I 导联以向下的 S 波为主，aVF 向上。电轴 {axis}（本站 {axis:area}），明显右偏。年轻、体型瘦长的人可以出现电轴右偏；也可见于右心室负荷增加、肺部疾病等。',
        pro: '原报告诊断为左后分支阻滞（诊断标准：电轴 > +90°，I 呈 rS，III 呈 qR）。左后分支阻滞的诊断需先排除右心室肥厚、侧壁心肌梗死、体型等原因，单凭心电图往往不能确定。',
      },
      {
        read: 's-axis',
        title: '小结',
        focus: null,
        plain:
          '电轴是心室"通电"的平均方向。正常 −30° 至 +90°；更"往上"为左偏，越过 +90° 为右偏。快速判断看 I 和 aVF 两个导联的主波方向。电轴偏移本身不是诊断，要结合其他表现。',
        next: { tour: 'av-block', label: '继续：房室传导阻滞 →' },
      },
    ],
  },
  {
    id: 'av-block',
    title: '房室传导阻滞：从一度到三度',
    audience: '医学生',
    proOpen: true,
    steps: [
      {
        title: '正常：每个 P 波都传到心室',
        case: 'ptbxl-33',
        view: { showWaves: true, showRef: false, speed: 25, mtab: 'intervals' },
        cursor: { beat: 3, phase: 'PR', frac: 0.5 },
        lead: 'II',
        focus: '.paper-wrap',
        spot: { leads: ['II'] },
        plain:
          '心房的信号要经过房室结这道"关口"才能传到心室。正常时每个 P 波后面都跟着一个 QRS，PR 间期固定，本例约 {pr} ms。',
        pro: '房室传导经房室结、希氏束、左右束支到浦肯野纤维。PR 间期主要反映房室结传导时间。',
      },
      {
        title: '一度：变慢，但没有中断',
        case: 'ptbxl-4387',
        cursor: { beat: 3, phase: 'PR', frac: 0.5 },
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II'] },
        plain: '这位 48 岁男性：PR 间期约 {pr} ms，超过 200 ms；但每个 P 波后面仍然都有 QRS。信号只是走得慢，没有中断。',
        pro: '一度房室传导阻滞：PR > 200 ms，1:1 传导。单独出现时通常无症状；β 受体阻滞剂、非二氢吡啶类钙通道阻滞剂等可延长 PR。',
      },
      {
        title: '二度 I 型（文氏型）',
        case: 'ptbxl-1222',
        cursor: { beat: 3, phase: 'PR', frac: 0.5 },
        focus: ['.paper-wrap'],
        spot: { leads: ['II', 'aVF'] },
        plain:
          '这位 71 岁男性。看最下面的节律条：底部蓝线上的数字是每次下传的 PR 间期（ms），红色 ✕ 是没有下传的 P 波。按时间顺序是：{avseq}。PR 一次比一次长，直到有一个 P 波传不过去；停一下之后，PR 又恢复到最短。周而复始。',
        pro: '本例 4:3 传导（每 4 个 P 波下传 3 个）。PR 增量逐搏递减（+84、+36 ms），所以组内 RR 反而逐渐缩短；含脱落的长 RR 短于两个 PP 之和。阻滞部位多在房室结，预后通常较好。P 波位置为本站在 aVF 导联上手工标注。',
      },
      {
        title: '没有下传的 P 波',
        cursor: { atrial: 3 },
        lead: 'aVF',
        focus: ['.paper-wrap', '.now-card'],
        spot: { leads: ['II', 'aVF'] },
        plain:
          '光标停在一个没有下传的 P 波上（aVF 导联最清楚）。心房"通电"了，可信号卡在房室结，心室这一拍没有跳。看右侧"此刻"框的说明。',
      },
      {
        title: '二度 II 型（莫氏 II 型）',
        focus: null,
        plain:
          '另一种二度阻滞：PR 间期<b>固定不变</b>，却突然有一个 P 波传不过去，事先没有"越来越长"的预兆。它的阻滞部位通常更低（希氏束以下），更容易进展为完全性阻滞，危险性比文氏型高。本站的数据中暂时没有可靠的二度 II 型病例，这里只作文字说明。',
        pro: '鉴别要点：脱落前后的 PR 是否相同。2:1 传导时每个下传的 PR 都"相同"，无法区分 I 型和 II 型；QRS 宽（合并束支阻滞）更提示希氏束以下阻滞。',
      },
      {
        title: '高度房室传导阻滞（3:1）',
        case: 'ptbxl-8048',
        cursor: { beat: 2, phase: 'PR', frac: 0.5 },
        lead: 'II',
        focus: ['.paper-wrap', '.compare-card'],
        spot: { leads: ['II'] },
        plain:
          '这位 58 岁男性：心房跳得不慢（PP 约 {pp} ms，约 {arate} 次/分），但每 3 个 P 波只有 1 个传到心室，心室率只有约 {hr} 次/分。节律条上依次为：{avseq}。下传的 PR 固定。空心三角是藏在 T 波里的 P 波，位置按 PP 间期推定。',
        pro: '连续两个及以上 P 波不下传称高度（进展性）房室阻滞。本例 QRS 约 {qrs} ms，原报告为右束支阻滞合并左后分支阻滞，提示阻滞部位可能在希氏束以下。',
      },
      {
        title: '三度（完全性）房室传导阻滞',
        case: 'ptbxl-959',
        cursor: { beat: 2, phase: 'R', frac: 0 },
        caliper: { from: 2, to: 3, march: true },
        lead: 'II',
        focus: ['.paper-wrap', '.compare-card'],
        spot: { leads: ['II'] },
        plain:
          '这位 88 岁女性：P 波按约 {arate} 次/分规律出现，QRS 按约 {hr} 次/分规律出现（卡尺的虚线每次都对上下一个 QRS），但两者<b>互不相关</b>：每个 QRS 与它前面那个 P 波的距离各不相同（{pqlist} ms），有的 P 波落在 QRS 或 T 波里。节律条底部全是红色 ✕：没有一个 P 波传下去。',
        pro: '房室分离，心房率 > 心室率。心室由逸搏维持：本例 QRS 约 {qrs} ms、频率约 40 次/分，提示逸搏点在希氏束以下（原报告称"室性逸搏"）。原报告提到晕厥并建议植入永久起搏器。',
      },
      {
        read: 's-conduction',
        title: '小结',
        focus: null,
        plain:
          '一度：变慢不中断。二度 I 型：越来越慢直到脱落一次。二度 II 型：突然脱落，没有预兆。高度：连续多个 P 波脱落。三度：完全不通，心房、心室各跳各的。二度 II 型、高度和三度阻滞可能引起头晕、晕厥，通常需要评估是否植入起搏器；出现晕厥、明显乏力或胸闷要及时就医。',
        pro: '分级与处理参考 2018 ACC/AHA/HRS 心动过缓与传导延迟指南。',
        next: { tour: 'bbb', label: '继续：束支阻滞 →' },
      },
    ],
  },
  {
    id: 'bbb',
    title: '束支阻滞：右束支与左束支',
    audience: '医学生',
    proOpen: true,
    steps: [
      {
        title: '正常：两侧心室几乎同时"通电"',
        case: 'ptbxl-33',
        view: { showWaves: true, showRef: false, speed: 25, mtab: 'intervals' },
        cursor: { beat: 3, phase: 'QRS', frac: 0.3 },
        lead: 'V1',
        focus: ['.paper-wrap', '.heart-card', '.axes-card'],
        spot: { leads: ['V1', 'V6'], beat: 3 },
        plain:
          '信号经左、右两条束支同时到达两侧心室，QRS 窄（本例约 {qrs} ms）。选中 V1 时，右侧切换为水平面（胸导联）向量图：正常 QRS 环先短暂指向右前（室间隔从左向右"通电"），随后转向左侧。',
        pro: '起始向右前的向量形成 V1 的小 r 波和 V6 的小 q 波（间隔 q 波）。水平面向量由 12 导联经 Kors 矩阵推导，前后方向误差较大，只作示意。',
      },
      {
        title: '右束支阻滞',
        case: 'ptbxl-3953',
        cursor: { beat: 3, phase: 'QRS', frac: 0.85 },
        lead: 'V1',
        focus: ['.paper-wrap', '.compare-card'],
        spot: { leads: ['V1', 'V6', 'I'], beat: 3 },
        plain:
          '这位 73 岁男性：QRS 约 {qrs} ms，变宽了。V1 导联最后多出一个向上的波（R′），I、V6 导联最后是一个宽而钝的 S 波。右心室要等左心室的信号"绕过来"才通电，晚了一步。',
        pro: 'QRS ≥ 120 ms，V1 呈 rsR′，I、V6 终末 S 波宽钝。右胸导联常伴继发性 ST-T 改变。完全性右束支阻滞可见于健康人，也可见于右心室负荷增加、缺血等。',
      },
      {
        title: '右束支阻滞的向量环',
        cursor: { beat: 3, phase: 'QRS', frac: 0.85 },
        lead: 'V1',
        focus: ['.paper-wrap', '.axes-card'],
        spot: { leads: ['V1'], beat: 3 },
        plain:
          '看右侧水平面向量图：QRS 环的后半段（最后约 50 ms）一直指向右前方，也就是 V1 那一侧，而且走得慢（小箭头很密）。这一段就是右心室"晚通电"，在 V1 上画出了 R′ 波。',
        pro: '本例 QRS 起点后 80–120 ms 的水平面向量方向约 130°（V1 方向为 120°），幅度持续较大，与右室延迟除极一致（Kors 推导向量，仅作示意）。',
      },
      {
        title: '左束支阻滞',
        case: 'ptbxl-11193',
        cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
        lead: 'V6',
        focus: ['.paper-wrap', '.compare-card'],
        spot: { leads: ['V1', 'V6', 'I'], beat: 3 },
        plain:
          '这位 59 岁女性：QRS 约 {qrs} ms。V1 以一个又深又宽的向下的波为主；I、V6 是一个宽而圆钝的向上的波，前面没有正常的小 q 波。T 波的方向和 QRS 主波相反。',
        pro: 'QRS ≥ 120 ms，V1 呈 QS 或 rS，I、aVL、V5、V6 宽大 R 波且间隔 q 波消失。继发性 ST-T 与 QRS 主波方向相反属预期表现。',
      },
      {
        title: '左束支阻滞的向量环',
        cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
        lead: 'V1',
        focus: ['.paper-wrap', '.axes-card'],
        spot: { leads: ['V1', 'V6'], beat: 3 },
        plain:
          '水平面向量图：QRS 环一开始就没有正常那样短暂指向右前，随后长时间指向左后方，环又大又"慢"。所以 V1 几乎全是向下的波，V6 是宽大的向上的波，而且没有小 q 波。',
        pro: '室间隔改为从右向左除极，起始向右前的向量消失；本例 QRS 起点后 50–150 ms 水平面向量方向稳定在约 −60°（左后），持续约 100 ms（Kors 推导向量，仅作示意）。',
      },
      {
        read: 's-conduction',
        title: '小结',
        focus: null,
        plain:
          '束支阻滞的共同点是 QRS 变宽（≥ 120 ms）。右束支阻滞看 V1 的 R′ 和 I、V6 的宽 S 波；左束支阻滞看 V1 的深宽 S 波和 I、V6 的宽钝 R 波。右束支阻滞可见于健康人；新出现的左束支阻滞通常需要进一步检查。左束支阻滞时，左心室肥厚的电压标准和多数 ST 段判断都不再可靠。',
        pro: '注意：下方 3D 心脏的"通电"顺序是按正常人示意的，不反映束支阻滞时的实际顺序。',
      },
    ],
  },
  {
    id: 'mi',
    title: '心肌梗死：从急性到陈旧',
    audience: '患者与医学生',
    steps: [
      {
        title: '先看正常人的 ST 段',
        case: 'ptbxl-33',
        view: { showWaves: true, showRef: true, speed: 25, mtab: 'st' },
        cursor: { beat: 3, phase: 'T', frac: 0.1 },
        lead: 'III',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II', 'III', 'aVF'], beat: 3 },
        plain:
          'ST 段是 QRS 波群结束到 T 波开始之间的那一小段，正常时基本贴着基线（图上紫色虚线是本站用的零点）。本例 III 导联 J 点为 {stj:III} mV，几乎没有偏离。右栏"ST 段"页列出了每个导联的读数。',
        pro: 'J 点 = QRS 终点。第四版全球心梗定义在 J 点测量 ST 偏移，以 QRS 起点为参照；本站以 QRS 起点前的 PR 段为零点。',
      },
      {
        title: '急性下壁心肌梗死',
        case: 'ptbxl-12899',
        view: { showWaves: true, showRef: true, speed: 25, mtab: 'st' },
        cursor: { beat: 3, phase: 'T', frac: 0.1 },
        lead: 'III',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['II', 'III', 'aVF', 'I', 'aVL'], beat: 3 },
        plain:
          '这位 67 岁女性：II、III、aVF 三个导联的 ST 段明显抬高（III 为 {stj:III} mV）。心脏下壁受累时，改变就出现在这三个导联上。同时 I、aVL 的 ST 段压低（aVL 为 {stj:aVL} mV），像镜子里的倒影，叫"对应性改变"。<b>出现持续胸痛，请立即拨打 120。</b>',
        pro: 'II、III、aVF 均 ≥ 1 mm，达到 ST 段抬高型心梗（STEMI）的心电图阈值。III 抬高 > II、I 和 aVL 压低，按 AHA 2009 更像右冠状动脉阻塞（本例无造影资料）。下壁 STEMI 应尽早加做 V3R、V4R 排查右心室受累。',
      },
      {
        title: '急性前壁和侧壁心肌梗死',
        case: 'ptbxl-13913',
        view: { showWaves: true, showRef: true, speed: 25, mtab: 'st' },
        cursor: { beat: 3, phase: 'T', frac: 0.1 },
        lead: 'V3',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['V2', 'V3', 'V4', 'I', 'aVL'], beat: 3 },
        plain:
          '这位 68 岁男性：胸前的 V2–V6 和 I、II、aVL 都抬高，V3 抬高 {stj:V3} mV，约 10 小格。抬高的导联越多，受累的心肌往往越多。原报告记录 V2、V3 已出现 Q 波。',
        pro: '前壁的 ST 段抬高型心梗（STEMI）几乎都由左前降支阻塞引起（AHA 2009）。AHA 2009 所说近段阻塞的典型表现是 V1–V4 与 I、aVL 抬高、II、III、aVF 压低；本例 II 反而抬高（{stj:II} mV），只有 III 轻度压低（{stj:III} mV），具体阻塞位置无法从心电图确定（无造影资料）。',
      },
      {
        title: '看不见的后壁：V1–V3 的"镜像"',
        case: 'ptbxl-2993',
        view: { showWaves: true, showRef: true, speed: 25, mtab: 'st' },
        cursor: { beat: 3, phase: 'T', frac: 0.1 },
        lead: 'V2',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['V1', 'V2', 'V3'], beat: 3 },
        plain:
          '这位 85 岁女性：II、III、aVF 和 V5、V6 抬高，而 V1–V3 的 ST 段明显压低（V2 为 {stj:V2} mV）。常规 12 导联没有电极正对心脏的后面，后壁受累时，从前胸看到的可能是它的"镜像"，也就是压低。原报告诊断为下侧壁心梗累及后壁。',
        pro: 'V1–V3 压低本身并不特异，也可能是前壁缺血；加做 V7–V9 抬高 ≥ 0.5 mm（40 岁以下男性 ≥ 1 mm）可提供支持（第四版全球心梗定义第 28 节），本例没有记录。第四版定义称之为"下基底部"，AHA 2009 保留"后壁"一词。',
      },
      {
        title: '亚急性期：T 波倒置',
        case: 'ptbxl-11944',
        view: { showWaves: true, showRef: true, speed: 25, mtab: 'st' },
        cursor: { beat: 3, phase: 'T', frac: 0.5 },
        lead: 'V2',
        focus: ['.paper-wrap', '.measure-card'],
        spot: { leads: ['V1', 'V2', 'V3', 'V4'], beat: 3 },
        plain:
          '这位 74 岁男性的前壁心梗已进入亚急性期：V1–V4 的 ST 段仍轻度抬高（V2 为 {stj:V2} mV），原报告记录 T 波已经倒置。心梗的心电图会随时间演变，大致是：T 波高尖 → ST 段抬高 → 出现 Q 波 → T 波倒置。',
        pro: 'T 波倒置可持续数天，也可能不再恢复；血管再通后抬高的 ST 段通常很快回落（AHA 2009；第四版定义第 27 节）。指南没有给出各阶段的固定时间。',
      },
      {
        title: '陈旧期：只剩下 Q 波',
        case: 'ptbxl-12841',
        view: { showWaves: true, showRef: false, speed: 25, mtab: 'st' },
        cursor: { beat: 3, phase: 'QRS', frac: 0.2 },
        lead: 'III',
        focus: ['.paper-wrap'],
        spot: { leads: ['II', 'III', 'aVF'], beat: 3 },
        plain:
          '这位 52 岁男性过去发生过下壁心梗：ST 段已经回到基线附近（各导联 < 0.1 mV），III、aVF 的 QRS 一开始是宽而深的向下的波，II 也有较小的这种波，即病理性 Q 波，是坏死心肌留下的"疤痕记号"。',
        pro: '第四版定义表 3：I、II、aVL、aVF、V4–V6 同组相邻两个导联 Q 波 ≥ 0.03 s 且深 ≥ 1 mm。III 导联单独的 Q 波可见于正常人。',
      },
      {
        read: 's-stemi',
        title: '小结',
        focus: null,
        plain:
          '急性心梗时，相邻导联的 ST 段抬高，"对面"的导联常压低；抬高出现在哪些导联，大致说明是心脏哪一面、哪一支冠状动脉出了问题。之后会出现 Q 波、T 波倒置，陈旧期往往只剩 Q 波。<b>心电图只是诊断依据之一，胸痛时最重要的是立即拨打 120。</b>',
        pro: '读片手册"急性 ST 段抬高型心肌梗死"一章有阈值表、各部位的对应导联（交互演示）和容易混淆的情况。',
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
  const pp = () => {
    const w = meta.annotations?.atrial?.waves;
    if (!w || w.length < 2) return null;
    const d = w.slice(1).map((x, i) => x.peak - w[i].peak).sort((a, b) => a - b);
    return d[d.length >> 1];
  };
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
    // P 波时限用 GE / Glasgow 算法的全局测量值（ECGDeli 自动标注的 P 波偏宽，见 docs/数据核查.md）
    pdur: () => fmt0(measure(meta, 'P_ms') ?? (pd.length ? pd[pd.length >> 1] : null)),
    rrmin: () => fmt0(rr.length ? Math.min(...rr) : null),
    rrmax: () => fmt0(rr.length ? Math.max(...rr) : null),
    // 电轴：{axis} 用 Glasgow 算法，{axis:area} 用本站面积法
    axis: (src) => {
      const v = meta.measurements.find((m) => m.id === (src ?? 'unig'))?.values?.axis_deg;
      return v == null ? '—' : `${v < 0 ? '−' : '+'}${Math.abs(Math.round(v))}°`;
    },
    // 房室传导（需要手工 P 波标注）：PP 间期中位数、心房率、逐个 P 波的 PR（未下传记 ✕）
    pp: () => fmt0(pp()),
    arate: () => fmt0(pp() && 60000 / pp()),
    avseq: () => {
      const a = meta.annotations?.atrial;
      if (!a) return '—';
      return a.waves.map((w) => (w.conducts == null ? '✕' : fmt0(beats[w.conducts].QRS.on - w.on))).join('、');
    },
    // 完全性房室阻滞：每个 QRS 与它前面最近一个可见 P 波起点的距离（各不相同）
    pqlist: () => {
      const a = meta.annotations?.atrial;
      if (!a) return '—';
      const vis = a.waves.filter((w) => !w.hidden);
      const xs = beats
        .map((b) => vis.filter((w) => w.on < b.QRS.on).pop())
        .map((w, i) => (w ? beats[i].QRS.on - w.on : null))
        .filter((v) => v != null);
      return xs.length ? xs.map(fmt0).join('、') : '—';
    },
    // 带符号：负值 = 低于 PR 段零点（压低），正值 = 抬高。stj = J 点，st80 = J 点后 80 ms
    stj: (lead) => (own?.[lead]?.STJ == null ? '—' : `${own[lead].STJ < 0 ? '−' : '+'}${Math.abs(own[lead].STJ).toFixed(2)}`),
    st80: (lead) => (own?.[lead]?.ST80 == null ? '—' : `${own[lead].ST80 < 0 ? '−' : '+'}${Math.abs(own[lead].ST80).toFixed(2)}`),
  };
  return text.replace(/\{(\w+)(?::(\w+))?\}/g, (m, name, arg) => (table[name] ? table[name](arg) : m));
}

/** 光标位置：第 beat 个心搏某时相的 frac 处（ms）；R = QRS 峰值 */
/**
 * 心电图内聚光灯的范围：{leads, t0?, t1?}。
 * 给了 beat 时，时间窗从该心跳开始（P 波前一点）到下一次心跳开始，包含其后的休息段（TP 段）。
 */
export function spotOf(spot, beats, durationMs) {
  if (!spot) return null;
  if (spot.beat == null) return { leads: spot.leads };
  const w = beatWindow(beats, spot.beat);
  if (!w) return { leads: spot.leads };
  const next = beatWindow(beats, spot.beat + 1);
  return { leads: spot.leads, t0: Math.max(0, w.start - 40), t1: Math.min(durationMs, next ? next.start - 20 : w.end + 300) };
}

/** 导览光标：{atrial: i} 停在第 i 个手工标注的 P 波峰上；其余同 cursorTime */
export function cursorAt(meta, spec) {
  if (spec?.atrial != null) return meta.annotations?.atrial?.waves?.[spec.atrial]?.peak ?? null;
  return cursorTime(meta.annotations?.beats ?? [], spec);
}

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
