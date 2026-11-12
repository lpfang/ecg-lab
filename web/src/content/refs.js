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
  textbook: {
    text: '常用教学范围，各教材略有差异；具体出处待核实。',
    status: 'listed',
  },
};

export function refLabel(id) {
  return REFS[id] ? `［${id}］` : '';
}
