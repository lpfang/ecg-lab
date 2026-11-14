// 参考文献。讲解中的数值标准都通过 id 引用这里。
// status：'listed' = 根据公开文献整理，尚未逐条核对原文；'verified' = 已核对原文。
// 目前全部为 'listed'，页面上如实显示。

export const REFS = {
  aha1: {
    text: 'Kligfield P, et al. Recommendations for the standardization and interpretation of the electrocardiogram: Part I. Circulation. 2007;115:1306–1324.',
    note: 'AHA/ACC/HRS 心电图标准化与解读建议（第一部分：心电图及其技术）',
    status: 'listed',
  },
  aha3: {
    text: 'Surawicz B, et al. Recommendations for the standardization and interpretation of the electrocardiogram: Part III. Intraventricular conduction disturbances. Circulation. 2009;119:e235–e240.',
    note: '室内传导障碍：QRS 时限、电轴偏移的定义',
    status: 'listed',
  },
  aha4: {
    text: 'Rautaharju PM, et al. Recommendations for the standardization and interpretation of the electrocardiogram: Part IV. The ST segment, T and U waves, and the QT interval. Circulation. 2009;119:e241–e250.',
    note: 'QT / QTc 的测量与延长标准',
    status: 'listed',
  },
  bazett: { text: 'Bazett HC. An analysis of the time-relations of electrocardiograms. Heart. 1920;7:353–370.', status: 'listed' },
  fridericia: {
    text: 'Fridericia LS. Die Systolendauer im Elektrokardiogramm bei normalen Menschen und bei Herzkranken. Acta Med Scand. 1920;53:469–486.',
    status: 'listed',
  },
  framingham: {
    text: 'Sagie A, et al. An improved method for adjusting the QT interval for heart rate (the Framingham Heart Study). Am J Cardiol. 1992;70:797–801.',
    status: 'listed',
  },
  hodges: {
    text: 'Hodges M, et al. Bazett’s QT correction reviewed: evidence that a linear QT correction for heart rate is better. J Am Coll Cardiol. 1983;1:694 (abstract).',
    status: 'listed',
  },
  kors: {
    text: 'Kors JA, et al. Reconstruction of the Frank vectorcardiogram from standard electrocardiographic leads: diagnostic comparison of different methods. Eur Heart J. 1990;11:1083–1092.',
    note: '本站已用 PTB 数据库的真实 Frank 导联核对系数（见仓库 docs/数据核查.md）',
    status: 'listed',
  },
  durrer: {
    text: 'Durrer D, van Dam RT, Freud GE, Janse MJ, Meijler FL, Arzbaecher RC. Total excitation of the isolated human heart. Circulation. 1970;41:899–912.',
    note: '心室除极顺序：左室面室间隔中部最早，左室后基底部最晚（本站 3D 示意心脏的依据）',
    status: 'listed',
  },
  goldberger: {
    text: 'Goldberger E. A simple, indifferent, electrocardiographic electrode of zero potential and a technique of obtaining augmented, unipolar, extremity leads. Am Heart J. 1942;23:483–492.',
    note: '加压单极肢体导联（aVR、aVL、aVF）的来源',
    status: 'listed',
  },
  wilson: {
    text: 'Wilson FN, Johnston FD, Macleod AG, Barker PS. Electrocardiograms that represent the potential variations of a single electrode. Am Heart J. 1934;9:447–458.',
    note: 'Wilson 中心电端与单极导联',
    status: 'listed',
  },
  aha5: {
    text: 'Hancock EW, et al. Recommendations for the standardization and interpretation of the electrocardiogram: Part V. Electrocardiogram changes associated with cardiac chamber hypertrophy. Circulation. 2009;119:e251–e261.',
    note: '心室肥厚、心房异常的心电图改变；电压标准敏感性较低',
    status: 'listed',
  },
  sokolow: {
    text: 'Sokolow M, Lyon TP. The ventricular complex in left ventricular hypertrophy as obtained by unipolar precordial and limb leads. Am Heart J. 1949;37:161–186.',
    status: 'listed',
  },
  casale: {
    text: 'Casale PN, Devereux RB, Kligfield P, et al. Electrocardiographic detection of left ventricular hypertrophy: development and prospective validation of improved criteria. J Am Coll Cardiol. 1985;6:572–580.',
    note: 'Cornell 电压标准',
    status: 'listed',
  },
  peguero: {
    text: 'Peguero JG, Lo Presti S, Perez J, et al. Electrocardiographic criteria for the diagnosis of left ventricular hypertrophy. J Am Coll Cardiol. 2017;69:1694–1703.',
    status: 'listed',
  },
  brady2018: {
    text: 'Kusumoto FM, et al. 2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay. Circulation. 2019;140:e382–e482.',
    note: '心动过缓与传导延迟指南：房室传导阻滞的分型',
    status: 'listed',
  },
  cn2024: {
    text: '中国高血压防治指南修订委员会, 等. 中国高血压防治指南（2024 年修订版）. 中华高血压杂志（中英文）. 2024;32(7):603–700. DOI: 10.16439/j.issn.1673-7245.2024.07.002',
    note: '降压药手册的主要依据：表 15（常用降压药与剂量）、表 16（单片复方）、表 17（适应证与禁忌证）、表 18（联合方案）、表 25（妊娠用药）',
    status: 'listed',
  },
  cnBasic2025: {
    text: '国家心血管病中心国家基本公共卫生服务项目基层高血压管理办公室, 等. 国家基层高血压防治管理指南 2025 版. 中国循环杂志. 2025;40(9):836–850. DOI: 10.3969/j.issn.1000-3614.2025.09.002',
    note: '基层用药流程（A、B、C、D 四类药与联合步骤）',
    status: 'listed',
  },
  aha2025: {
    text: 'Jones DW, et al. 2025 AHA/ACC/AANP/AAPA/ABC/ACCP/ACPM/AGS/AMA/ASPC/NMA/PCNA/SGIM Guideline for the Prevention, Detection, Evaluation and Management of High Blood Pressure in Adults. Circulation. 2025;152(11):e114–e218. doi:10.1161/CIR.0000000000001356',
    note: '美国 2025 高血压指南（取代 2017 版）',
    status: 'listed',
  },
  esc2024: {
    text: 'McEvoy JW, et al. 2024 ESC Guidelines for the management of elevated blood pressure and hypertension. Eur Heart J. 2024;45(38):3912–4018. doi:10.1093/eurheartj/ehae178',
    note: '欧洲 2024 指南。本站未能读到全文，相关内容来自指南作者在 Hypertension 2025;82:432–444 发表的解读，引用时已注明',
    status: 'listed',
  },
  nmpaLabel: {
    text: '国家食品药品监督管理局. 药品说明书和标签管理规定（局令第 24 号）. 2006.',
    note: '药品标签上通用名与商品名的字体要求',
    status: 'listed',
  },
  innStems: {
    text: 'World Health Organization. The use of stems in the selection of International Nonproprietary Names (INN) for pharmaceutical substances.',
    note: 'WHO 国际非专利药名的词干（-pril、-sartan、-dipine、-olol、-azosin 等）',
    status: 'listed',
  },
  fdaLabels: {
    text: '美国 FDA 药品说明书（DailyMed，dailymed.nlm.nih.gov）与 Drugs@FDA 数据库。',
    note: '美国商品名、黑框警告、上市与停产状态；具体链接见每张药物卡片',
    status: 'listed',
  },
  udmi4: {
    text: 'Thygesen K, Alpert JS, Jaffe AS, et al. Fourth Universal Definition of Myocardial Infarction (2018). Circulation. 2018;138:e618–e651. doi:10.1161/CIR.0000000000000617',
    note: '第四版全球心肌梗死定义：表 2（ST 段抬高 / 压低的阈值）、第 27 节（ST 改变与易混淆情况）、第 28 节（右胸与背后导联）、表 3（病理性 Q 波）、第 31 节（Q 波的易混淆情况）、第 32 节（束支阻滞与起搏）',
    status: 'listed',
  },
  aha6: {
    text: 'Wagner GS, Macfarlane P, Wellens H, et al. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: Part VI. Acute ischemia/infarction. Circulation. 2009;119:e262–e270.',
    note: '急性缺血 / 梗死：ST 改变与罪犯血管的对应、对应性改变、"后壁"一词的取舍、左束支阻滞时的判断',
    status: 'listed',
  },
  esc2023acs: {
    text: 'Byrne RA, Rossello X, Coughlan JJ, et al. 2023 ESC Guidelines for the management of acute coronary syndromes. Eur Heart J. 2023;44:3720–3826. doi:10.1093/eurheartj/ehad191',
    status: 'listed',
  },
  acc2025acs: {
    text: 'Rao SV, O\'Donoghue ML, Ruel M, et al. 2025 ACC/AHA/ACEP/NAEMSP/SCAI Guideline for the Management of Patients With Acute Coronary Syndromes. Circulation. 2025. doi:10.1161/CIR.0000000000001309',
    note: '第 5.1 节：出现症状拨打急救电话，不要自己开车去医院',
    status: 'listed',
  },
  cnStemi2019: {
    text: '中华医学会心血管病学分会, 中华心血管病杂志编辑委员会. 急性 ST 段抬高型心肌梗死诊断和治疗指南（2019）. 中华心血管病杂志. 2019;47(10):766–783. doi:10.3760/cma.j.issn.0253-3758.2019.10.003',
    note: '首次医疗接触 10 分钟内完成心电图、尽早拨打 120、时间目标（90 / 120 / 30 分钟）、发病 12 小时内的再灌注窗口',
    status: 'listed',
  },
  cnStemiPrimary2019: {
    text: '中华医学会, 等. ST 段抬高型心肌梗死基层诊疗指南（2019 年）. 中华全科医师杂志. 2020;19(12):1083–1091. doi:10.3760/cma.j.cn114798-20200904-00961',
    note: '中文写明的 ST 段抬高阈值（与第四版全球心梗定义一致）',
    status: 'listed',
  },
  ptbxl: {
    text: 'Wagner P, Strodthoff N, Bousseljot RD, et al. PTB-XL, a large publicly available electrocardiography dataset. Sci Data. 2020;7:154. doi:10.1038/s41597-020-0495-6',
    note: '梗死分期（Stadium I / II / III）是从原始诊断报告的文字里提取的，不是按统一标准重新判读',
    status: 'listed',
  },
  textbook: {
    text: '常用教学范围，各教材略有差异；具体出处待核实。',
    status: 'listed',
  },
};

export function refLabel(id) {
  return REFS[id] ? `［${id}］` : '';
}
