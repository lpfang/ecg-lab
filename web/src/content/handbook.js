// 读片手册：患者篇 + 专业篇。每章：正文（HTML 段落）、"在图上演示"（加载真实病例并定位）、相关导览、可选的交互演示。
//
// 章节字段：
//   id, title, en      章节 id（URL ?read=id 可直达）、标题
//   body               正文 HTML（只用 <p> <ul> <ol> <li> <b> <table> 等简单标签）
//   demos              在图上演示：[{label, case, lead?, cursor?, view?, scroll?, note}]
//                        cursor 同导览（{beat, phase, frac} 或 {atrial}）；scroll = 演示后滚动到的面板
//                        note 一句话说明"看什么"，演示时显示在顶部提示条里
//   tours              相关导览 id
//   terms              本章术语（terms.js 的 id）：章末列出，正文里每个术语第一次出现处自动加链接；
//                        术语表与术语弹窗据此反查"读片手册中讲到"
//   widget             交互演示：'axis'（拖动电轴看六个肢体导联）| 'qtc'（调心率看 QT / QTc）| 'mi'（心梗定位）
//   refs               出处（refs.js 的 id）
//
// 写作原则（docs/计划.md 第七节）：通俗版不与专业版矛盾；数值标准都有出处；病例描述只写已用数据核对过的特征
// （与 compare.js、tours.js 一致，见 docs/数据核查.md）；不对读者个人的心电图做判断。

import { TERMS } from './terms.js';

export const HANDBOOK = [
  {
    id: 'patient',
    title: '患者篇',
    sub: '读懂我的心电图',
    chapters: [
      {
        id: 'p-howto',
        title: '心电图是怎么做的',
        en: 'Having an ECG',
        body: `
<p>做心电图时，要在两只手腕、两只脚踝和左胸前贴上 10 个电极。电极只是"听"心脏自己发出的微弱电信号，<b>不会往身体里通电</b>，没有痛感，也没有辐射。</p>
<p>标准的心电图机记录 10 秒，同时从 12 个方向（12 个导联）看心脏。每个导联像一台摆在不同位置的摄像机，所以同一次心跳在不同导联上形状不一样，这是正常的。</p>
<p>检查时平躺、放松、不说话、不动。肌肉紧张、发抖、说话会在图上留下细碎的"毛刺"（肌电干扰），影响判读。</p>
<p>一份心电图只是 10 秒的"快照"。偶尔发作的心律问题，这 10 秒里可能没有出现，医生有时会建议做 24 小时动态心电图。</p>`,
        demos: [
          {
            label: '看一份正常的 12 导联心电图',
            case: 'ptbxl-33',
            lead: 'II',
            view: { showWaves: false },
            note: '上面三行是 12 个导联，最下面一长条是 II 导联完整的 10 秒。每行开头的方波是 1 mV 标定脉冲。',
          },
        ],
        primer: 'intro',
        tours: ['what-is-ecg'],
        terms: ['ecg', 'lead'],
        refs: ['aha1'],
      },
      {
        id: 'p-report',
        title: '报告单上的常见词',
        en: 'Words on the report',
        body: `
<p>心电图报告上的结论，很多是心电图机自动分析给出的，再由医生确认。下面是常见的词，以及大致意思。<b>同一个词对不同的人意义可能不同，要由医生结合病情判断。</b></p>
<table class="hb-table">
<tr><th>报告上的词</th><th>大致意思</th></tr>
<tr><td>窦性心律</td><td>心跳由心脏自己的"起搏点"（窦房结）正常发起。这是正常的节律来源。</td></tr>
<tr><td>窦性心动过缓 / 过速</td><td>节律来源正常，只是心率低于 60 或高于 100 次/分。睡眠、运动员可以心率慢；发热、紧张、贫血等可以心率快。</td></tr>
<tr><td>电轴左偏 / 右偏</td><td>心脏电信号的总方向偏向左上或右下。本身不是病，可以提示某些情况，也可见于正常人。</td></tr>
<tr><td>ST-T 改变、T 波低平 / 倒置</td><td>心电图"复位"阶段的形状有变化。原因很多（心肌缺血、心肌肥厚、药物、电解质，甚至体位、呼吸），常常需要结合症状和其他检查。</td></tr>
<tr><td>左心室高电压</td><td>胸前导联的波比较高。可以提示左心室肥厚，但年轻、偏瘦的人也常见，不能单凭它诊断。</td></tr>
<tr><td>一度房室传导阻滞</td><td>心房到心室的信号传得慢一点，但没有中断。多数不引起症状。</td></tr>
<tr><td>完全性 / 不完全性右束支阻滞</td><td>心室里右侧的传导支路慢了。健康人也可以出现，尤其是不完全性。</td></tr>
<tr><td>心房颤动（房颤）</td><td>心房电活动杂乱，心跳快慢不齐。会增加中风风险，需要医生评估是否抗凝。</td></tr>
</table>
<p>"<b>心电图正常</b>"也不代表心脏一定没有问题：比如左心室肥厚、平时不发作的心律失常，常规心电图都可能看不出来。</p>`,
        demos: [
          {
            label: '窦性心动过缓',
            case: 'ptbxl-6998',
            lead: 'II',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            scroll: '.compare-card',
            note: '和正常对照比：P 波、QRS 形态相同，只是心跳之间的距离更远。',
          },
          {
            label: '电轴左偏',
            case: 'ptbxl-2239',
            lead: 'aVF',
            cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
            note: 'II、aVF 导联的 QRS 以向下的波为主，I 导联向上。',
          },
          {
            label: '左心室高电压',
            case: 'ptbxl-10171',
            lead: 'V1',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            view: { mtab: 'lvh' },
            note: 'V1 向下的 S 波很深，V5、V6 向上的 R 波很高。右栏"左室肥厚电压"页给出各项标准。',
          },
          {
            label: '完全性右束支阻滞',
            case: 'ptbxl-3953',
            lead: 'V1',
            cursor: { beat: 3, phase: 'QRS', frac: 0.85 },
            scroll: '.compare-card',
            note: 'QRS 变宽，V1 导联最后多出一个向上的波。',
          },
          {
            label: '心房颤动',
            case: 'ptbxl-8215',
            lead: 'II',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            note: '没有 P 波，心跳间隔忽长忽短。',
          },
        ],
        terms: ['sinusRhythm', 'heartRate', 'axis', 'lvh', 'tWave', 'avBlock', 'bbb', 'afib'],
        refs: ['aha1', 'aha3'],
      },
      {
        id: 'p-htn',
        title: '高血压与心脏',
        en: 'Hypertension and the heart',
        body: `
<p>血压长期偏高，左心室每次都要更用力地把血泵出去，心肌会逐渐变厚（<b>左心室肥厚</b>）。变厚的心肌电信号更强，心电图上胸前导联的波会变高、变深。</p>
<p>心肌肥厚进一步发展，心电图上还可能出现 ST 段压低、T 波倒置（常称"劳损"）；左心房压力升高会扩大，P 波变宽；心房扩大又容易引发<b>心房颤动</b>。</p>
<p>需要知道两点：</p>
<ul>
<li>心电图发现左心室肥厚的能力有限，<b>"没有达到标准"不能说明心脏没有变厚</b>，确诊通常要靠心脏超声。</li>
<li>反过来，电压高也不一定是肥厚，年轻、偏瘦的人胸前导联本来就可以比较高。</li>
</ul>
<p>控制好血压，左心室肥厚在一部分人中可以减轻。定期复查心电图，主要是和自己过去的心电图对比，看有没有新变化。</p>`,
        demos: [
          {
            label: '左心室肥厚：电压增高',
            case: 'ptbxl-10171',
            lead: 'V5',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            view: { mtab: 'lvh' },
            scroll: '.compare-card',
            note: '和正常对照比：V1 的 S 波更深，V5、V6 的 R 波更高。',
          },
          {
            label: '伴 ST-T 改变（"劳损"）',
            case: 'ptbxl-13904',
            lead: 'aVL',
            cursor: { beat: 4, phase: 'ST', frac: 0.6 },
            view: { mtab: 'st', showRef: true },
            note: '侧壁导联（I、aVL、V5、V6）的 ST 段压低、T 波倒置或低平。',
          },
          {
            label: '心房颤动',
            case: 'ptbxl-8215',
            lead: 'II',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            scroll: '.compare-card',
            note: '没有 P 波，心跳间隔忽长忽短。',
          },
        ],
        tours: ['hypertension'],
        terms: ['lvh', 'strain', 'lae', 'afib'],
        refs: ['aha5', 'sokolow'],
      },
      {
        id: 'p-drugs',
        title: '降压药和其他药物的影响',
        en: 'Medicines and the ECG',
        body: `
<p>一些常用药物会让心电图出现可预期的变化。看到这些变化，<b>不要自行停药或换药</b>，是否需要调整由医生决定。</p>
<table class="hb-table">
<tr><th>药物</th><th>可能的心电图变化</th></tr>
<tr><td>β 受体阻滞剂（如美托洛尔、比索洛尔）</td><td>心率变慢；PR 间期可能延长。</td></tr>
<tr><td>部分钙通道阻滞剂（维拉帕米、地尔硫䓬）</td><td>心率变慢、PR 延长。常用的"地平类"（如氨氯地平）一般没有这种作用。</td></tr>
<tr><td>利尿剂（如氢氯噻嗪、呋塞米）</td><td>可能降低血钾：T 波变低、U 波变明显、QT 显得延长。</td></tr>
<tr><td>普利类、沙坦类、螺内酯</td><td>可能升高血钾（尤其肾功能不好时）：T 波高尖，严重时 QRS 变宽。</td></tr>
<tr><td>部分抗心律失常药、抗生素、抗抑郁药等</td><td>可能使 QT 间期延长。几种这类药物同时使用、或合并低钾时风险更高。</td></tr>
</table>
<p>药物对心电图的影响因人而异。复查心电图时把正在吃的药告诉医生，有助于正确解读。</p>
<p>各类降压药的作用、适用、副作用和商品名，见<a href="#" data-drug-ch="d-classes">降压药手册</a>。</p>`,
        demos: [
          {
            label: '心率慢（窦性心动过缓）',
            case: 'ptbxl-6998',
            lead: 'II',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            scroll: '.compare-card',
            note: '心跳之间的距离变远，P 波、QRS 形态正常。本例数据库没有用药记录。',
          },
          {
            label: 'PR 间期延长（一度房室传导阻滞）',
            case: 'ptbxl-4387',
            lead: 'II',
            cursor: { beat: 3, phase: 'PR', frac: 0.5 },
            scroll: '.compare-card',
            note: 'P 波离 QRS 更远（PR 超过 200 ms），但每个 P 波后都有 QRS。',
          },
          {
            label: '看本例的 QT 和 QTc',
            case: 'ptbxl-33',
            lead: 'II',
            cursor: { beat: 3, phase: 'T', frac: 1 },
            view: { mtab: 'intervals' },
            scroll: '.measure-card',
            note: '右栏测量表列出 QT 和四种公式校正后的 QTc。',
          },
        ],
        terms: ['heartRate', 'prInterval', 'tWave', 'qrs', 'qtInterval'],
        refs: ['aha4'],
      },
      {
        id: 'p-devices',
        title: '手表和家用心电设备',
        en: 'Smartwatch and home ECG',
        body: `
<p>智能手表、手持心电仪通常只记录<b>一个导联</b>：用一只手的手指去碰另一只手腕上的电极，相当于标准心电图里的 <b>I 导联</b>（左手减右手）。</p>
<p>单导联能做好的事：</p>
<ul>
<li>看心跳是否规整，<b>提示房颤</b>（没有 P 波、间隔绝对不齐）。部分产品的房颤提示功能经过了监管部门审批。</li>
<li>在有症状（心慌、心跳乱）的当下记录一段，带给医生看。</li>
</ul>
<p>单导联做不到的事：判断心肌梗死、左心室肥厚、大多数 ST 段改变，因为这些需要从多个方向看心脏。<b>手表显示"正常"不能排除心脏病；有胸痛等症状不要依赖手表，应及时就医。</b></p>`,
        demos: [
          {
            label: '正常心电图的 I 导联',
            case: 'ptbxl-33',
            lead: 'I',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            note: '红框选中的 I 导联，就是手表能记录到的那个方向。',
          },
          {
            label: '房颤时的 I 导联',
            case: 'ptbxl-8215',
            lead: 'I',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            note: '只看 I 导联，也能看出间隔忽长忽短。',
          },
        ],
        primer: 'frontal',
        terms: ['lead', 'afib'],
        refs: ['aha1'],
      },
      {
        id: 'p-mi',
        title: '心肌梗死：心电图能看出什么，胸痛怎么办',
        en: 'Heart attack and the ECG',
        body: `
<p class="hb-urgent"><b>如果你现在胸痛、胸闷，请先拨打 120，不要继续看本页。</b></p>
<p><b>心肌梗死</b>（心梗）是给心脏供血的冠状动脉突然堵住，下游的心肌因为缺血而坏死。</p>
<p><b>典型症状</b>（中国 2019 指南）：胸骨后或心前区剧烈的压榨样疼痛，通常持续 10–20 分钟以上，可以放射到左上臂、下巴、脖子、后背或肩膀；常伴恶心、呕吐、大汗、喘不上气，有的人会晕倒；含硝酸甘油也不能完全缓解。有些人症状并不典型。</p>
<p><b>怎么办</b>：</p>
<ul>
<li>立即拨打 <b>120</b>。不要自己吃药扛着、也不要反复观察"看看会不会好"（中国 2019 指南）。</li>
<li>不要自己开车去医院（美国 2025 指南；欧洲 2023 指南也建议直接叫急救车，而不是自己去急诊或先找家庭医生）。</li>
<li>用什么药，听急救人员和医生的。</li>
</ul>
<p><b>名字怎么来的</b>：医生常说的"<b>ST 段抬高型心肌梗死</b>"，英文是 <b>ST-Elevation Myocardial Infarction</b>，缩写 <b>STEMI</b>。"ST 段"是心电图上 QRS 波结束后、T 波开始前的那一小段，正常时贴着基线；"抬高"就是这一段明显高出基线。"急性"指刚发生、正在进行，和多年前留下的"陈旧心梗"相对。</p>
<p><b>心电图在这里起什么作用</b>：医生第一次接触胸痛病人后，要在 10 分钟内做完心电图（中国 2019 指南）。如果有胸痛等症状、同时相邻几个导联的 <b>ST 段</b>明显抬高，医生会按"ST 段抬高型心肌梗死"紧急处理：一支冠状动脉很可能完全堵住了，要尽快把它打通：放支架（急诊介入）或用溶栓药。</p>
<p><b>时间就是心肌</b>：堵得越久，坏死的心肌越多。中国 2019 指南的目标是：直接到能做介入的医院时，从第一次接触医护人员到打通血管不超过 90 分钟；需要转院时，总时间争取在 120 分钟内；如果做不到，在第一次接触医护人员后 30 分钟内开始溶栓。发病 12 小时内是急诊介入的主要时间窗。</p>
<p><b>第一份心电图正常也不能放松</b>：发病最早期常常还看不到典型的 ST 段抬高，有时只有 T 波突然变得又高又大。症状持续时，医生会在 15–30 分钟内复查心电图（中国 2019 指南）。确诊心梗还要抽血查肌钙蛋白；但心电图已有典型改变时，医生不会等抽血结果才开始打通血管。</p>
<p><b>心电图没有 ST 段抬高，也可能是心梗</b>：另一类叫"非 ST 段抬高型心肌梗死"（NSTEMI），血管多为部分堵塞，心电图可以只有 ST 段压低、T 波倒置，甚至看不出明显异常，要靠症状、心电图和抽血查肌钙蛋白一起判断；这几种情况之间还可能很快转变（美国 2025 指南）。所以有症状时不要因为"心电图没事"就放松。</p>
<p>本站只用公开数据库中的病例做教学，<b>不能也不会解读你自己的心电图</b>。</p>`,
        demos: [
          {
            label: '一份急性下壁心肌梗死的心电图',
            case: 'ptbxl-12899',
            lead: 'III',
            cursor: { beat: 3, phase: 'T', frac: 0.1 },
            view: { mtab: 'st' },
            scroll: '.measure-card',
            note: 'II、III、aVF 的 ST 段（QRS 之后、T 波之前那一段）明显高于基线；I、aVL 反而往下。右栏"ST 段"页有逐个导联的读数。',
          },
        ],
        tours: ['mi'],
        terms: ['stemi', 'stSegment', 'tWave'], // stemi 在前：先链接整个"ST 段抬高型心肌梗死"，免得"ST 段"先占掉开头
        refs: ['cnStemi2019', 'acc2025acs', 'esc2023acs', 'cn2024'],
      },
      {
        id: 'p-when',
        title: '什么情况要及时就医',
        en: 'When to seek care',
        body: `
<p>出现下面情况，<b>请立即就医或拨打 120</b>，不要等复查心电图：</p>
<ul>
<li>胸痛、胸闷、胸口压迫感，持续几分钟以上不缓解，或向左臂、下巴、后背放射，尤其伴出汗、恶心。</li>
<li>晕倒（晕厥）或突然眼前发黑、几乎晕倒。</li>
<li>突然严重的气短，或心慌伴头晕、胸痛。</li>
<li>一侧肢体无力、口角歪斜、说话不清（可能是中风，房颤患者风险更高）。</li>
</ul>
<p>下面情况建议尽快门诊就诊：经常心慌或心跳不齐；活动后气短、乏力明显加重；心电图报告上出现新的异常，或医生建议进一步检查。</p>
<p>本站只用公开数据库中的病例做教学，<b>不能也不会解读你自己的心电图</b>。</p>`,
        demos: [
          {
            label: '一种可能引起晕厥的心电图：完全性房室传导阻滞',
            case: 'ptbxl-959',
            lead: 'II',
            cursor: { beat: 2, phase: 'R', frac: 0 },
            note: '心房和心室各跳各的，心室只有约 40 次/分。原报告提到这位患者有晕厥。',
          },
        ],
        terms: ['afib'],
        refs: ['brady2018'],
      },
    ],
  },
  {
    id: 'pro',
    title: '专业篇',
    sub: '系统读图',
    chapters: [
      {
        id: 's-ephys',
        title: '心电活动与心电图波形',
        en: 'Cardiac electrophysiology',
        body: `
<p>窦房结发出冲动 → 心房除极（<b>P 波</b>）→ 房室结延搁（<b>PR 段</b>）→ 希氏束、左右束支、浦肯野纤维快速传导，心室除极（<b>QRS 波群</b>）→ 心室复极（<b>ST 段、T 波</b>）。心房复极波很小，通常被 QRS 掩盖。</p>
<p>体表导联记录的是心肌细胞群电活动的综合向量在该导联轴上的投影：除极波面朝向导联正极时波形向上，背离时向下。</p>
<p>心室复极从心外膜向心内膜进行（与除极方向相反），而复极电位方向也相反，二者相抵，所以正常 T 波通常与 QRS 主波<b>同向</b>。</p>
<p>心室除极顺序（Durrer 1970 离体人心标测）：左室面室间隔中部最早，由左向右，形成起始向右前的小向量（V1 的 r 波、V6 的 q 波）；随后心尖和游离壁，后基底部最晚，全程约 80 ms。</p>`,
        demos: [
          {
            label: '心室除极时的向量和 3D 心脏',
            case: 'ptbxl-33',
            lead: 'II',
            cursor: { beat: 3, phase: 'QRS', frac: 0.3 },
            scroll: '.heart-card',
            note: '光标在 QRS 里。看下方 3D 心脏哪里在"通电"，以及右侧六轴图上的紫色向量。',
          },
        ],
        tours: ['what-is-ecg'],
        terms: ['pWave', 'qrs', 'stSegment', 'tWave', 'vector', 'lead'],
        refs: ['durrer'],
      },
      {
        id: 's-leads',
        title: '导联系统',
        en: 'Lead systems',
        body: `
<p><b>双极肢体导联</b>（Einthoven）：I = LA − RA，II = LL − RA，III = LL − LA，满足 II = I + III。</p>
<p><b>加压单极肢体导联</b>（Goldberger）：aVR = RA − (LA + LL)/2，aVL、aVF 同理。六个肢体导联的轴在额面上每隔 30° 一个，组成<b>六轴系统</b>。</p>
<p><b>胸导联</b>（Wilson）：探查电极减去中心电端（RA + LA + LL）/3，从水平面看心脏。V1、V2 对着右心室和室间隔，V3、V4 对着前壁和心尖，V5、V6 对着侧壁。</p>
<p>12 个导联中只有 8 个是独立的：III、aVR、aVL、aVF 都可以由 I、II 算出。本站对每个病例用 Einthoven 关系检查数据质量（病例卡片的"数据质量"）。</p>`,
        demos: [
          {
            label: '对照看 I、II、III',
            case: 'ptbxl-33',
            lead: 'III',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            scroll: '.axes-card',
            note: '在同一时刻，II 导联的电压等于 I 加 III（右侧读数可以验证）。点导联名可以切换。',
          },
        ],
        primer: 'intro',
        terms: ['lead', 'hexaxial', 'augmented', 'chestLeads'],
        refs: ['aha1', 'goldberger', 'wilson'],
      },
      {
        id: 's-order',
        title: '系统读图顺序',
        en: 'A systematic approach',
        body: `
<ol>
<li><b>定标</b>：10 mm/mV、25 mm/s；检查电极是否接错（例如 I 导联 P 波、QRS 全部倒置要怀疑左右手反接）。</li>
<li><b>心律</b>：有无 P 波，P 波与 QRS 的关系，节律是否规整。</li>
<li><b>心率</b>：60000 ÷ RR（ms）；不规则时 10 秒内 QRS 数 × 6。</li>
<li><b>P 波</b>：时限、振幅、形态（心房异常）。</li>
<li><b>PR 间期</b>：120–200 ms。</li>
<li><b>QRS</b>：时限（< 120 ms）、形态（Q 波、R 波递增、束支阻滞）、电压（心室肥厚）、电轴。</li>
<li><b>ST 段</b>：以 PR 段为参照，看抬高、压低及分布。</li>
<li><b>T 波</b>：方向、对称性、与 QRS 的关系。</li>
<li><b>QT / QTc</b>，以及有无 U 波。</li>
<li><b>综合</b>：与既往心电图对比，结合临床。</li>
</ol>
<p>固定顺序的意义在于不漏项：看到一个明显异常时，其他异常最容易被忽略。</p>`,
        demos: [
          {
            label: '在正常心电图上按顺序读一遍',
            case: 'ptbxl-33',
            lead: 'II',
            cursor: { beat: 3, phase: 'P', frac: 0.5 },
            note: '可以接着走"正常心电图：按顺序逐项读"导览，每一步对应上面一项。',
          },
        ],
        tours: ['normal-systematic'],
        terms: ['heartRate', 'pWave', 'prInterval', 'qrs', 'axis', 'stSegment', 'tWave', 'qtc'],
        refs: ['aha1'],
      },
      {
        id: 's-intervals',
        title: '波段与间期的正常值',
        en: 'Waves and intervals',
        body: `
<table class="hb-table">
<tr><th>项目</th><th>成人常用正常范围</th><th>异常时提示</th></tr>
<tr><td>心率</td><td>60–100 次/分</td><td>&lt; 60 心动过缓，&gt; 100 心动过速</td></tr>
<tr><td>P 波</td><td>时限 &lt; 120 ms；II 导联振幅 &lt; 0.25 mV</td><td>增宽、双峰：左心房异常；高尖：右心房异常</td></tr>
<tr><td>PR 间期</td><td>120–200 ms</td><td>&gt; 200：一度房室阻滞；&lt; 120 伴 delta 波：预激</td></tr>
<tr><td>QRS 时限</td><td>&lt; 110–120 ms</td><td>≥ 120：完全性束支阻滞、室性节律等</td></tr>
<tr><td>QTc</td><td>男 ≤ 450 ms，女 ≤ 460 ms</td><td>延长：药物、低钾、低镁、先天性长 QT 等；&lt; 390 ms 偏短</td></tr>
</table>
<p>QT 随心率变化（心率快 QT 短），所以要换算成 QTc。不同公式在心率偏离 60 次/分时结果差别明显：<b>Bazett 公式在心率快时校正过度、心率慢时校正不足</b>，Fridericia 等公式受心率影响较小。用下面的演示调心率，看四种公式怎样分开。</p>
<p>各项界值来自 AHA/ACCF/HRS 心电图标准化建议，不同教材略有差异。</p>`,
        widget: 'qtc',
        demos: [
          {
            label: '本例测量表（正常心电图）',
            case: 'ptbxl-33',
            lead: 'II',
            cursor: { beat: 3, phase: 'T', frac: 1 },
            view: { mtab: 'intervals' },
            scroll: '.measure-card',
            note: '右栏测量表：两种算法的间期，以及按四种公式算出的 QTc。',
          },
          {
            label: '心率快时 QTc 公式的差别（窦性心动过速）',
            case: 'ptbxl-19728',
            lead: 'II',
            cursor: { beat: 3, phase: 'T', frac: 1 },
            view: { mtab: 'intervals' },
            scroll: '.measure-card',
            note: '本例心率约 105 次/分：Bazett 算出的 QTc 比另外三种公式高 30–50 ms。',
          },
        ],
        terms: ['heartRate', 'pWave', 'prInterval', 'qrs', 'qtc', 'qtInterval'],
        refs: ['aha4', 'bazett', 'fridericia', 'framingham', 'hodges'],
      },
      {
        id: 's-axis',
        title: '电轴',
        en: 'Electrical axis',
        body: `
<p>额面 QRS 平均向量的方向。成人 <b>−30° 至 +90°</b> 为正常；<b>−30° 至 −90°</b> 为电轴左偏；<b>+90° 至 +180°</b> 为电轴右偏；−90° 至 ±180° 为极度电轴偏移（"无人区"），见于室性节律、电极接错等。</p>
<p>某导联 QRS 的净振幅 ≈ 平均向量在该导联轴上的投影：向量与导联轴越接近，波越向上、越高；垂直时正负相抵（等电位）；方向相反时向下。</p>
<p>快速判断：看 I 与 aVF 的主波方向；I 正、aVF 负时再看 II，II 以正向为主为 0° 至 −30°（仍正常），II 以负向为主为左偏。也可以找 QRS 正负相抵最接近的导联，电轴与它垂直。</p>
<p>左偏常见于左前分支阻滞、下壁心肌梗死、左心室肥厚等；右偏常见于右心室肥厚、肺部疾病、左后分支阻滞，年轻、瘦长体型也可轻度右偏。</p>`,
        widget: 'axis',
        demos: [
          {
            label: '正常电轴',
            case: 'ptbxl-33',
            lead: 'aVF',
            cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
            scroll: '.axes-card',
            note: 'I、aVF 的 QRS 都以向上为主。',
          },
          {
            label: '电轴左偏（左前分支阻滞）',
            case: 'ptbxl-2239',
            lead: 'II',
            cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
            scroll: '.axes-card',
            note: 'I 向上，II、aVF 以向下的 S 波为主。',
          },
          {
            label: '电轴右偏',
            case: 'ptbxl-9355',
            lead: 'I',
            cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
            scroll: '.axes-card',
            note: 'I 以向下的 S 波为主，aVF 向上。',
          },
        ],
        tours: ['axis'],
        terms: ['axis', 'vector', 'lead'],
        refs: ['aha3'],
      },
      {
        id: 's-hypertrophy',
        title: '心室肥厚与心房异常',
        en: 'Hypertrophy and atrial abnormality',
        body: `
<p><b>左心室肥厚</b>的电压标准（本站在每个病例上实时计算，右栏"左室肥厚电压"页）：</p>
<ul>
<li>Sokolow-Lyon：SV1 + RV5 或 RV6 ≥ 3.5 mV</li>
<li>Cornell 电压：RaVL + SV3 &gt; 2.8 mV（男）/ 2.0 mV（女）</li>
<li>RaVL ≥ 1.1 mV</li>
<li>Peguero-Lo Presti：任一导联最深 S + SV4 ≥ 2.8 mV（男）/ 2.3 mV（女）</li>
</ul>
<p>这些标准<b>特异性较高、敏感性较低</b>：达标支持诊断，不达标不能排除。左束支阻滞、预激等情况下不适用。伴随的继发性 ST-T 改变（"劳损"）：以 R 波为主的侧壁导联 ST 压低、T 波倒置。</p>
<p><b>左心房异常</b>：P 波 ≥ 120 ms，II 导联可呈双峰，V1 P 波终末负向部分 ≥ 1 mm 深、≥ 40 ms 宽。<b>右心房异常</b>：II 导联 P 波 ≥ 0.25 mV。</p>`,
        demos: [
          {
            label: '电压明显增高',
            case: 'ptbxl-10171',
            lead: 'V1',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            view: { mtab: 'lvh' },
            scroll: '.measure-card',
            note: '右栏列出四种标准在本例的数值，以及三种来源的对比。',
          },
          {
            label: '电压在标准边缘',
            case: 'ptbxl-20211',
            lead: 'V5',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            view: { mtab: 'lvh' },
            scroll: '.measure-card',
            note: '不同测量来源，有的达标、有的不达标。',
          },
          {
            label: '伴 ST-T 改变',
            case: 'ptbxl-5971',
            lead: 'V5',
            cursor: { beat: 3, phase: 'ST', frac: 0.6 },
            view: { mtab: 'st', showRef: true },
            scroll: '.compare-card',
            note: 'V4–V6 T 波倒置（V5 最深），V5、V6 ST 段压低。',
          },
          {
            label: '左心房异常',
            case: 'ptbxl-17160',
            lead: 'V1',
            cursor: { beat: 3, phase: 'P', frac: 0.85 },
            scroll: '.compare-card',
            note: 'V1 的 P 波先正后负，后半部分向下。',
          },
        ],
        tours: ['hypertension'],
        terms: ['lvh', 'strain', 'lae'],
        refs: ['aha5', 'sokolow', 'casale', 'peguero'],
      },
      {
        id: 's-conduction',
        title: '传导阻滞',
        en: 'Conduction blocks',
        body: `
<p><b>房室传导阻滞</b>：</p>
<ul>
<li>一度：PR &gt; 200 ms，每个 P 波均下传。</li>
<li>二度 I 型（文氏型）：PR 逐搏延长直至一个 P 波不下传；多为房室结水平，预后通常较好。</li>
<li>二度 II 型（莫氏 II 型）：PR 固定，突然出现不下传的 P 波；多为希氏束以下，易进展。2:1 传导时无法区分 I、II 型。</li>
<li>高度：连续两个及以上 P 波不下传。</li>
<li>三度：房室分离，心房率 &gt; 心室率，由交界区（QRS 多窄，40–60 次/分）或室性逸搏（QRS 宽，20–40 次/分）维持。</li>
</ul>
<p><b>束支阻滞</b>（QRS ≥ 120 ms）：右束支阻滞 V1 呈 rsR′、I 与 V6 终末 S 波宽钝；左束支阻滞 V1 呈 QS 或 rS，I、aVL、V5、V6 宽大 R 波且间隔 q 波消失，伴继发性 ST-T 改变。</p>
<p><b>分支阻滞</b>：左前分支阻滞，电轴 −45° 至 −90°、QRS &lt; 120 ms；左后分支阻滞，电轴 &gt; +90°，需先排除其他电轴右偏原因。</p>`,
        demos: [
          {
            label: '一度房室传导阻滞',
            case: 'ptbxl-4387',
            lead: 'II',
            cursor: { beat: 3, phase: 'PR', frac: 0.5 },
            scroll: '.compare-card',
            note: 'PR 延长，每个 P 波后都有 QRS。',
          },
          {
            label: '二度 I 型（文氏型）',
            case: 'ptbxl-1222',
            lead: 'aVF',
            cursor: { atrial: 3 },
            note: '节律条底部：蓝色数字是每次的 PR，逐渐延长后出现红色 ✕（P 波未下传）。光标停在未下传的 P 波上。',
          },
          {
            label: '三度房室传导阻滞',
            case: 'ptbxl-959',
            lead: 'II',
            cursor: { beat: 2, phase: 'R', frac: 0 },
            note: 'P 波与 QRS 各自规律，互不相关；节律条底部全是红色 ✕。',
          },
          {
            label: '右束支阻滞',
            case: 'ptbxl-3953',
            lead: 'V1',
            cursor: { beat: 3, phase: 'QRS', frac: 0.85 },
            scroll: '.axes-card',
            note: '选中 V1 时右侧为水平面向量图：QRS 末段指向右前（V1 方向）。',
          },
          {
            label: '左束支阻滞',
            case: 'ptbxl-11193',
            lead: 'V6',
            cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
            scroll: '.compare-card',
            note: 'V6 宽而圆钝的 R 波，前面没有小 q 波；T 波与 QRS 主波方向相反。',
          },
        ],
        tours: ['av-block', 'bbb'],
        terms: ['avBlock', 'escape', 'bbb', 'axis'],
        refs: ['brady2018', 'aha3'],
      },
      {
        id: 's-rhythm',
        title: '心律失常（本站已有的类型）',
        en: 'Arrhythmias',
        body: `
<p><b>窦性心动过缓 / 过速</b>：窦性 P 波，心率 &lt; 60 或 &gt; 100 次/分。心动过速时 TP 段缩短，P 波可接近前一个 T 波。</p>
<p><b>心房颤动</b>：P 波消失，代之以不规则的颤动波（f 波，350–600 次/分），RR 间期绝对不规则。f 波可以很细；心室率快时 f 波被掩盖，"绝对不规则"是最可靠的线索。算法仍可能输出 PR 值、自动标注可能把颤动波标成 P 波，本站对房颤病例舍弃了这些数值。</p>
<p>早搏、室上速、室速、心房扑动等类型，本站暂时没有合适的病例。</p>`,
        demos: [
          {
            label: '窦性心动过速',
            case: 'ptbxl-19728',
            lead: 'II',
            cursor: { beat: 3, phase: 'TP', frac: 0.5 },
            scroll: '.compare-card',
            note: '每个 QRS 前都有 P 波，TP 段（两次心跳之间的平线）很短。',
          },
          {
            label: '房颤（心室率正常）',
            case: 'ptbxl-8215',
            lead: 'V1',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            scroll: '.compare-card',
            note: '没有 P 波，RR 间期忽长忽短。f 波很细，可以在 V1、II 导联的基线上找找看。',
          },
          {
            label: '房颤（心室率快）',
            case: 'ptbxl-4117',
            lead: 'II',
            cursor: { beat: 3, phase: 'R', frac: 0 },
            scroll: '.compare-card',
            note: '同样绝对不齐，而且 10 秒里的心跳明显更多。',
          },
        ],
        tours: ['hypertension'],
        terms: ['sinusRhythm', 'afib', 'pWave'],
        refs: ['textbook'],
      },
      {
        id: 's-stemi',
        title: '急性 ST 段抬高型心肌梗死：标准、定位与演变',
        en: 'Acute ST-Elevation Myocardial Infarction (STEMI)',
        body: `
<h3>心电图标准</h3>
<p><b>ST 段抬高型心肌梗死</b>（STEMI）的心电图标准，第四版全球心肌梗死定义（表 2）与中国 2019 基层指南相同：相邻两个导联在 <b>J 点</b>新出现 ST 段抬高，阈值如下（前提是没有左心室肥厚和束支阻滞；欧洲 2023 指南写作左束支阻滞）。美国 2025、欧洲 2023 指南采用同样的数值。</p>
<table class="hb-table">
<tr><th>导联</th><th>人群</th><th>J 点抬高</th></tr>
<tr><td>V2、V3</td><td>男性 ≥ 40 岁</td><td>≥ 2 mm（0.2 mV）</td></tr>
<tr><td>V2、V3</td><td>男性 &lt; 40 岁</td><td>≥ 2.5 mm</td></tr>
<tr><td>V2、V3</td><td>女性</td><td>≥ 1.5 mm</td></tr>
<tr><td>其他导联</td><td>所有人</td><td>≥ 1 mm</td></tr>
</table>
<p>"相邻导联"指看向同一区域的导联：I 和 aVL；V1–V6 按顺序相邻；II、III、aVF（第四版定义表 3 的分组）。ST 段压低：相邻两个导联新出现水平型或下斜型压低 ≥ 0.5 mm，或 R 波为主的相邻导联 T 波倒置 &gt; 1 mm，提示缺血。<b>确诊心肌梗死还需要肌钙蛋白升高</b>，心电图只是其中一项依据。</p>
<p>附加导联：怀疑下壁心梗要尽早加做右胸 V3R、V4R；怀疑"后壁"受累加做背后的 V7–V9。中国 2019 指南建议有条件时做 18 导联。</p>

<h3>定位与"罪犯血管"</h3>
<p>出现 ST 段抬高的导联，大致对应受损的心肌部位，进而提示是哪一支冠状动脉堵了（AHA 2009 第六部分）。下面的交互演示列出各部位。三点提醒：</p>
<ul>
<li>个人的冠状动脉走行差别很大，"罪犯血管"只是常见情况，要靠冠脉造影确认。</li>
<li>AHA 2009 建议不要把导联本身叫"前壁导联""下壁导联"，因为 V1–V2 的 ST 段压低可能反映的是心脏背面；描述受损的<b>心肌部位</b>仍然可以。</li>
<li>"后壁"一词有争议：第四版定义改称"下基底部"（注明以前叫后壁），AHA 2009 则保留"后壁"。</li>
</ul>

<h3>对应性改变</h3>
<p>ST 段抬高的同时，从"对面"看的导联常出现 ST 段压低，称为<b>对应性改变</b>（镜像改变）。例如 III 抬高常伴 aVL 压低；V1–V3 压低相当于背后导联的抬高。有对应性改变有助于区分急性心梗与心包炎、早期复极（第四版定义第 27 节）。</p>

<h3>随时间演变</h3>
<p>大致顺序（第四版定义第 27 节、AHA 2009）：T 波可能先变得高尖（超急性 T 波），随后 ST 段抬高；心肌坏死后逐渐出现<b>病理性 Q 波</b>；之后 T 波倒置，可持续数天，也可能不再恢复；血管打通后，抬高的 ST 段通常很快明显回落。指南没有给出每个阶段的固定时间。</p>

<h3>容易混淆的情况</h3>
<p>不是所有 ST 段抬高都是心梗：心包炎、左心室肥厚（高血压患者常见）、左束支阻滞、起搏心律、早期复极、Brugada 综合征、应激性心肌病、高钾血症、心肌炎等也会出现（第四版定义第 27、32 节；AHA 2009）。左束支阻滞或起搏心律时常规标准不适用，医生会用专门的 Sgarbossa 标准（AHA 2009）。</p>

<p class="muted small">本站病例的"急性 / 亚急性 / 陈旧"取自原始诊断报告的文字。PTB-XL 另有从报告文字自动提取的梗死分期字段（Stadium I = 急性 / 早期，II = 近期 / 亚急性，III = 陈旧；Wagner 2020），本站几个病例的这一字段与报告措辞并不一致，因此不作为依据。病例都没有冠脉造影资料。</p>`,
        widget: 'mi',
        demos: [
          {
            label: '急性下壁心肌梗死',
            case: 'ptbxl-12899',
            lead: 'III',
            cursor: { beat: 3, phase: 'T', frac: 0.1 },
            view: { mtab: 'st' },
            scroll: '.measure-card',
            note: 'II、III、aVF 的 J 点抬高（本站 0.19、0.30、0.25 mV），I、aVL 压低（−0.12、−0.22 mV）。III 比 II 高、I 和 aVL 压低，符合 AHA 2009 所说更像右冠状动脉阻塞的表现（本例没有造影资料）。',
          },
          {
            label: '急性前壁和侧壁心肌梗死',
            case: 'ptbxl-13913',
            lead: 'V3',
            cursor: { beat: 3, phase: 'T', frac: 0.1 },
            view: { mtab: 'st' },
            scroll: '.measure-card',
            note: 'V2–V6 和 I、II、aVL 的 J 点都抬高，V3 最高（本站约 1.0 mV，即 10 小格）；III 轻度压低。原报告记录 V2、V3 已出现 Q 波。',
          },
          {
            label: '下侧壁心梗累及后壁：V1–V3 的"镜像"',
            case: 'ptbxl-2993',
            lead: 'V2',
            cursor: { beat: 3, phase: 'T', frac: 0.1 },
            view: { mtab: 'st' },
            scroll: '.measure-card',
            note: 'II、III、aVF 和 V5、V6 抬高；V1–V3 的 ST 段明显压低（V2 本站 −0.34 mV）。原报告诊断"累及后壁"：常规导联看不到后壁的抬高，压低可能是它的镜像。V1–V3 压低本身并不特异（也可能是前壁缺血），本例没有记录 V7–V9。',
          },
          {
            label: '亚急性前壁心肌梗死：T 波已倒置',
            case: 'ptbxl-11944',
            lead: 'V2',
            cursor: { beat: 3, phase: 'T', frac: 0.5 },
            view: { mtab: 'st' },
            scroll: '.measure-card',
            note: 'V1–V4 的 ST 段仍轻度抬高（V2 本站约 0.2 mV），原报告记录 I、aVL、V1–V5 的 T 波已倒置（aVR 的 T 波本来就向下）。和前面的急性病例比，这是演变中的一个阶段。',
          },
        ],
        tours: ['mi'],
        terms: ['stemi', 'jPoint', 'stSegment', 'reciprocal', 'qWave', 'tWave', 'lvh', 'bbb'],
        refs: ['udmi4', 'aha6', 'cnStemi2019', 'cnStemiPrimary2019', 'esc2023acs', 'acc2025acs', 'ptbxl'],
      },
      {
        id: 's-infarct',
        title: '陈旧心肌梗死',
        en: 'Old myocardial infarction',
        body: `
<p>心肌梗死后坏死的心肌不再产生电活动，对着它的导联"看"到的是背离方向的电信号，表现为<b>病理性 Q 波</b>或 R 波丢失。第四版全球心梗定义：V2–V3 任何 Q 波 &gt; 0.02 s 或呈 QS；其他导联同组相邻两个导联 Q 波 ≥ 0.03 s 且深 ≥ 1 mm。教科书上常见的"宽 ≥ 40 ms 或深 ≥ R 波的 1/4"是较老的经验标准。ST 段在急性期抬高，之后逐渐回落；陈旧期常只剩 Q 波。</p>
<p>按导联定位（教学上的习惯分组）：II、III、aVF —— 下壁；V1–V2 —— 前间壁；V3–V4 —— 前壁；I、aVL、V5、V6 —— 侧壁。</p>
<p>需要注意：III 导联单独的 Q 波可见于正常人；R 波递增不良也可见于左束支阻滞、左心室肥厚、电极位置偏高、肺气肿等。病理性 Q 波的具体标准见术语表；急性期的表现见上一章<a href="#" data-hb-read="s-stemi">急性 ST 段抬高型心肌梗死</a>。</p>`,
        demos: [
          {
            label: '陈旧下壁心肌梗死',
            case: 'ptbxl-12841',
            lead: 'III',
            cursor: { beat: 3, phase: 'QRS', frac: 0.2 },
            scroll: '.compare-card',
            note: 'II、III、aVF 的 QRS 一开始都是宽的向下的 Q 波。',
          },
          {
            label: '陈旧前间壁心肌梗死',
            case: 'ptbxl-12605',
            lead: 'V2',
            cursor: { beat: 3, phase: 'QRS', frac: 0.5 },
            scroll: '.compare-card',
            note: 'V1、V2 几乎没有向上的波（QS 型），V3 的 R 波也很小。',
          },
        ],
        terms: ['qWave', 'stSegment', 'bbb', 'lvh'],
        refs: ['udmi4', 'textbook'],
      },
    ],
  },
];

/**
 * 正文里用来识别术语的文字（按顺序尝试，先长后短）。没列的术语用 terms.js 的 zh，
 * 以及去掉括号后的部分、括号里的简称。
 */
export const TERM_MATCH = {
  qrs: ['QRS 波群', 'QRS'],
  qtc: ['校正 QT', 'QTc'],
  qtInterval: ['QT 间期', 'QT'],
  prInterval: ['PR 间期'],
  axis: ['心电轴', '电轴'],
  hexaxial: ['六轴系统', '六轴'],
  isoelectric: ['等电位线', '基线'],
  lae: ['左心房增大', '左心房异常', '左心房'],
  strain: ['劳损'],
  escape: ['逸搏'],
  vector: ['心电向量', '向量'],
  calPulse: ['标定脉冲', '标定'],
  augmented: ['加压肢体导联', '加压导联', 'aVR、aVL、aVF'],
  sinusRhythm: ['窦性心律', '窦性'],
  stSegment: ['ST 段'],
  jPoint: ['J 点'],
  stemi: ['ST 段抬高型心肌梗死', 'STEMI'],
  reciprocal: ['对应性改变', '镜像改变'],
  qWave: ['病理性 Q 波'],
  tWave: ['T 波'],
  pWave: ['P 波'],
  bbb: ['束支阻滞', '束支传导阻滞'],
  avBlock: ['房室传导阻滞', '房室阻滞'],
};

export const CHAPTERS = HANDBOOK.flatMap((part) => part.chapters.map((c) => ({ ...c, part: part.id })));
export const chapterById = (id) => CHAPTERS.find((c) => c.id === id) ?? null;

/** 讲到某个术语的章节（按手册顺序） */
export const chaptersForTerm = (termId) => CHAPTERS.filter((c) => c.terms?.includes(termId));

/** 某术语在正文里的识别文字 */
export function termNames(termId) {
  if (TERM_MATCH[termId]) return TERM_MATCH[termId];
  const zh = TERMS[termId]?.zh ?? '';
  const bare = zh.replace(/（.*?）/g, '');
  const abbr = zh.match(/（(.*?)）/)?.[1];
  return [...new Set([zh, bare, abbr].filter(Boolean))];
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 识别文字 → 正则：以英文字母开头/结尾的（QT、QRS）不能紧贴别的字母（QT 不匹配 QTc） */
export const termRegex = (names) =>
  new RegExp(
    names
      .map(
        (n) => `${/^[A-Za-z]/.test(n) ? '(?<![A-Za-z])' : ''}${escRe(n)}${/[A-Za-z]$/.test(n) ? '(?![A-Za-z])' : ''}`,
      )
      .join('|'),
  );
