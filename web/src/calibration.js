// 屏幕校准：浏览器不知道真实 DPI，让用户用银行卡（ISO/IEC 7810 ID-1，85.60 mm 宽）对齐。

const KEY = 'ecg-lab:pxPerMm';
export const CARD_WIDTH_MM = 85.6;
export const DEFAULT_PX_PER_MM = 96 / 25.4; // CSS 规范的名义值，真实屏幕通常不等于它

export function loadCalibration() {
  try {
    const v = parseFloat(localStorage.getItem(KEY));
    if (v > 1 && v < 20) return { pxPerMm: v, calibrated: true };
  } catch {
    /* 隐私模式等情况下 localStorage 不可用 */
  }
  return { pxPerMm: DEFAULT_PX_PER_MM, calibrated: false };
}

export function saveCalibration(pxPerMm) {
  try {
    localStorage.setItem(KEY, String(pxPerMm));
  } catch {
    /* 忽略：本次会话仍然生效 */
  }
}

export function clearCalibration() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

/** 打开校准对话框；确定时回调 onDone(pxPerMm)，取消时不回调 */
export function openCalibrationDialog(current, onDone) {
  const dlg = document.getElementById('calib-dialog');
  const box = dlg.querySelector('.card-box');
  const range = dlg.querySelector('input[type=range]');
  const readout = dlg.querySelector('.calib-readout');
  range.value = current;
  const update = () => {
    const ppm = parseFloat(range.value);
    box.style.width = `${ppm * CARD_WIDTH_MM}px`;
    box.style.height = `${ppm * 53.98}px`;
    readout.textContent = `${ppm.toFixed(2)} 像素 / mm`;
  };
  range.oninput = update;
  update();
  dlg.querySelector('[data-act=ok]').onclick = () => {
    dlg.close();
    onDone(parseFloat(range.value));
  };
  dlg.querySelector('[data-act=reset]').onclick = () => {
    dlg.close();
    onDone(null);
  };
  dlg.querySelector('[data-act=cancel]').onclick = () => dlg.close();
  dlg.showModal();
}
