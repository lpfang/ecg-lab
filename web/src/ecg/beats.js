// 心搏与时相：根据全局波形起止点，判断某一时刻处于心动周期的哪个阶段。
// 时间单位一律为 ms。

/** 时相顺序：P 波 → PR 段 → QRS 波群 → ST 段 → T 波 → TP 段（静息） */
export const PHASES = ['P', 'PR', 'QRS', 'ST', 'T', 'TP'];

const PRE_QRS_MS = 120; // 没有 P 波时，心搏窗口从 QRS 前 120 ms 开始
const POST_T_MS = 250; // 最后一个心搏 T 波后仍视为本心搏 TP 段的时长
const ST_NO_T_MS = 120; // 没有 T 波标注时，QRS 后只把这么长视为 ST 段，之后视为未标注
const GAP_FACTOR = 1.6; // 下一个心搏比中位 RR 晚这么多倍，视为中间有心搏缺失

function medianRR(beats) {
  const rr = [];
  for (let i = 1; i < beats.length; i++) rr.push(beats[i].QRS.on - beats[i - 1].QRS.on);
  rr.sort((a, b) => a - b);
  return rr.length ? rr[rr.length >> 1] : null;
}

function beatStart(b) {
  return b.P ? b.P.on : b.QRS.on - PRE_QRS_MS;
}

/**
 * @param {Array} beats meta.annotations.beats（按时间排序）
 * @param {number} t 时刻（ms）
 * @returns {{index:number, beat:object, phase:string, frac:number|null, start:number, end:number}|null}
 *   frac：在本时相中的进度 0–1；null 表示无法确定
 */
export function locate(beats, t) {
  if (!beats?.length) return null;
  const rr = medianRR(beats);
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const start = beatStart(b);
    const next = beats[i + 1];
    let end = next ? beatStart(next) : (b.T ? b.T.off : b.QRS.off) + POST_T_MS;
    // 中间缺了心搏（标注被舍弃）时，不把空白算进本心搏
    if (rr && next && next.QRS.on - b.QRS.on > GAP_FACTOR * rr) {
      end = Math.min(end, (b.T ? b.T.off : b.QRS.off + ST_NO_T_MS) + POST_T_MS);
    }
    if (t < start || t >= end) continue;
    const res = (phase, a, z) => ({
      index: i,
      beat: b,
      phase,
      frac: a == null || z == null || z <= a ? null : Math.min(1, Math.max(0, (t - a) / (z - a))),
      start,
      end,
    });
    if (b.P && t <= b.P.off) return res('P', b.P.on, b.P.off);
    if (t < b.QRS.on) return res('PR', b.P ? b.P.off : start, b.QRS.on);
    if (t <= b.QRS.off) return res('QRS', b.QRS.on, b.QRS.off);
    if (b.T) {
      if (t < b.T.on) return res('ST', b.QRS.off, b.T.on);
      if (t <= b.T.off) return res('T', b.T.on, b.T.off);
      return res('TP', b.T.off, end);
    }
    if (t <= b.QRS.off + ST_NO_T_MS) return res('ST', null, null);
    return null; // 没有 T 波标注，无法判断
  }
  return null;
}

/** 本心搏从 start 到 end 的时间窗（用于画向量环） */
export function beatWindow(beats, index) {
  const b = beats[index];
  if (!b) return null;
  const next = beats[index + 1];
  const start = beatStart(b);
  const end = b.T ? b.T.off : next ? beatStart(next) : b.QRS.off + 200;
  return { start, end };
}
