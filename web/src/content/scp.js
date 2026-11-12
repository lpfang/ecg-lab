// PTB-XL 诊断标签（SCP-ECG 编码）的中文名。英文原文保留在 meta.json 的 description 中。
export const SCP_ZH = {
  NORM: '正常心电图',
  SR: '窦性心律',
  SBRAD: '窦性心动过缓',
  STACH: '窦性心动过速',
  SARRH: '窦性心律不齐',
  AFIB: '心房颤动',
  AFLT: '心房扑动',
  '1AVB': '一度房室传导阻滞',
  LVH: '左心室肥厚',
  VCLVH: '符合左心室肥厚的 QRS 电压标准',
  'LAO/LAE': '左心房负荷过重 / 增大',
  ISC_: '非特异性缺血性改变',
  ISCAL: '前侧壁缺血性改变',
  STD_: '非特异性 ST 段压低',
  STE_: '非特异性 ST 段抬高',
  NST_: '非特异性 ST 段改变',
  NDT: '非诊断性 T 波异常',
  INVT: 'T 波倒置',
  LOWT: 'T 波低平',
  CRBBB: '完全性右束支阻滞',
  CLBBB: '完全性左束支阻滞',
  IRBBB: '不完全性右束支阻滞',
  LAFB: '左前分支阻滞',
  IMI: '下壁心肌梗死',
  ASMI: '前间壁心肌梗死',
  AMI: '前壁心肌梗死',
};

/** 标签的说明：可信度为 0 的多为"形态 / 节律"描述性标签，不是概率 0 */
export function scpLabel(d) {
  return SCP_ZH[d.code] ?? d.description;
}
