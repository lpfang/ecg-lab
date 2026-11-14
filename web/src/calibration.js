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
  const ruler = dlg.querySelector('.calib-ruler');
  const update = () => {
    const ppm = parseFloat(range.value);
    box.style.width = `${ppm * CARD_WIDTH_MM}px`;
    box.style.height = `${ppm * 53.98}px`;
    readout.textContent = `当前：${ppm.toFixed(2)} 像素 / mm（方框宽 ${(ppm * CARD_WIDTH_MM).toFixed(0)} 像素）`;
    drawRuler(ruler, ppm);
  };
  // − / + 微调：每次 0.01 像素 / mm ≈ 方框宽度变化 0.9 像素
  dlg.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const v = Math.min(+range.max, Math.max(+range.min, parseFloat(range.value) + parseFloat(b.dataset.step)));
      range.value = v.toFixed(2);
      update();
    };
  });
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

/** 10 cm 核对线：每 1 cm 一个刻度，每 5 cm 长刻度 */
function drawRuler(svg, ppm) {
  const w = ppm * 100;
  const x0 = 8; // 左边留出刻度数字的位置
  svg.setAttribute('width', Math.ceil(w + 2 * x0));
  let html = `<line x1="${x0}" y1="6" x2="${w + x0}" y2="6" class="calib-ruler-line"/>`;
  for (let cm = 0; cm <= 10; cm++) {
    const x = x0 + cm * ppm * 10;
    const long = cm % 5 === 0;
    html += `<line x1="${x}" y1="6" x2="${x}" y2="${long ? 18 : 13}" class="calib-ruler-tick"/>`;
    if (long) html += `<text x="${x}" y="27" class="calib-ruler-lab">${cm}</text>`;
  }
  svg.innerHTML = html;
}
