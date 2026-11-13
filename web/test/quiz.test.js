// 测验题库与判分：每道题都必须能用病例数据算出唯一、可靠的答案
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { QUIZ_SETS } from '../src/quiz/bank.js';
import { TOL, gradeLocate, gradeEdge, gradeNumber, gradeAxis, angleDiff, wavesOf, inAnnotatedRange, leadInterval } from '../src/quiz/grade.js';
import { rateTruth, axisTruth, vectorTruth, intervalTruth } from '../src/quiz/answers.js';
import { CASES, readMeta, load } from './helpers.js';
import { computeLayout } from '../src/ecg/layout.js';

const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const TIMED = ['locate', 'edge', 'interval'];

describe('判分函数', () => {
  const meta = {
    annotations: {
      annotatedRangeMs: [1000, 9000],
      waves: {
        II: [
          { type: 'P', on: 1000, off: 1100 },
          { type: 'QRS', on: 1160, off: 1250 },
          { type: 'T', on: 1400, off: 1600 },
          { type: 'P', on: 1800, off: 1900 },
          { type: 'QRS', on: 1960, off: 2050 },
          { type: 'T', on: 2200, off: 2400 },
        ],
      },
    },
  };
  it('点出 P 波：波内或边缘外 10 ms 内算对', () => {
    expect(gradeLocate(meta, 'II', 'P', 1050).ok).toBe(true);
    expect(gradeLocate(meta, 'II', 'P', 1108).ok).toBe(true);
    expect(gradeLocate(meta, 'II', 'P', 1130).ok).toBe(false);
    expect(gradeLocate(meta, 'II', 'P', 1850).wave.on).toBe(1800);
  });
  it('P 终点正好等于 QRS 起点时，PR 仍能配对', () => {
    const m = { annotations: { waves: { II: [{ type: 'P', on: 100, off: 200 }, { type: 'QRS', on: 200, off: 290 }] } } };
    expect(leadInterval(m, 'II', 'PR').median).toBe(100);
  });
  it('起止点：取最近的标注，误差带符号；T 终点容差更宽', () => {
    const r = gradeEdge(meta, 'II', 'QRS', 'on', 1975);
    expect(r.truth).toBe(1960);
    expect(r.errMs).toBe(15);
    expect(r.ok).toBe(true);
    expect(gradeEdge(meta, 'II', 'QRS', 'on', 1985).ok).toBe(false);
    expect(gradeEdge(meta, 'II', 'T', 'off', 2425).ok).toBe(true); // ±30
  });
  it('数值与角度', () => {
    expect(gradeNumber(150, 130, 20).ok).toBe(true);
    expect(gradeNumber(151, 130, 20).ok).toBe(false);
    expect(gradeNumber(NaN, 130, 20)).toBeNull();
    expect(angleDiff(175, -170)).toBe(-15);
    expect(gradeAxis(175, -170).ok).toBe(true);
    expect(gradeAxis(-30, 60).ok).toBe(false);
    // 电轴答案取角平均并规范到 (−180, 180]
    const m = { measurements: [{ id: 'unig', values: { axis_deg: -175 } }, { id: 'area', values: { axis_deg: 178 } }] };
    expect(axisTruth(m).deg).toBeCloseTo(-178.5);
  });
  it('人工标注范围', () => {
    expect(inAnnotatedRange(meta, 500)).toBe(false);
    expect(inAnnotatedRange(meta, 5000)).toBe(true);
  });
});

describe.each(QUIZ_SETS)('题库 $id', (set) => {
  const qs = set.questions.map((q, i) => ({ ...q, i }));

  it('题数与简介一致', () => {
    expect(set.intro).toContain(`${qs.length} 道题`);
  });

  it.each(qs)('第 $i 题（$type）：病例存在，字段齐全', (q) => {
    expect(existsSync(new URL(`${q.case}/meta.json`, CASES))).toBe(true);
    expect(q.prompt.length).toBeGreaterThan(5);
    expect(q.explain.length).toBeGreaterThan(10);
    if (q.lead) expect(LEADS).toContain(q.lead);
    if (q.type === 'choice') {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
      expect(new Set(q.options.map((o) => o.text)).size).toBe(q.options.length);
    }
  });

  it.each(qs.filter((q) => TIMED.includes(q.type)))('第 $i 题：时间类答案只用人工标注（LUDB）', (q) => {
    const m = readMeta(q.case);
    expect(m.source.database ?? m.source.name ?? JSON.stringify(m.source)).toMatch(/LUDB/);
    expect(m.measurements.some((x) => x.kind === 'manual')).toBe(true);
  });

  it.each(qs.filter((q) => q.type === 'locate' || q.type === 'edge'))(
    '第 $i 题：$lead 导联在屏幕上可见、且有人工标注的范围内，至少有 2 个完整的 $wave 波',
    (q) => {
      // 3×4 排版中每个导联只显示 2.5 秒（II 另有 10 秒节律条）；只算完整落在可见格子与标注范围内的波
      const m = readMeta(q.case);
      const cells = computeLayout({ durationMs: m.durationMs, speed: 25, gain: 10 }).cells.filter((c) => c.lead === q.lead);
      const visible = (w) => cells.some((c) => w.on >= c.t0 && w.off <= c.t1);
      const ws = wavesOf(m, q.lead, q.wave).filter(
        (w) => visible(w) && inAnnotatedRange(m, w.on) && inAnnotatedRange(m, w.off),
      );
      expect(ws.length).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(qs.filter((q) => q.type === 'edge'))('第 $i 题：相邻两个同类边界相距远大于容差（答案不含糊）', (q) => {
    const m = readMeta(q.case);
    const xs = wavesOf(m, q.lead, q.wave).map((w) => w[q.edge]);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeGreaterThan(4 * TOL.tEndMs);
  });

  it.each(qs.filter((q) => q.type === 'interval'))('第 $i 题：$lead 导联 $kind 逐拍稳定（极差 ≤ 容差 × 2）', (q) => {
    const r = intervalTruth(readMeta(q.case), q.lead, q.kind);
    expect(r.n).toBeGreaterThanOrEqual(4);
    const tol = q.kind === 'QT' ? TOL.qtMs : TOL.intervalMs;
    expect(r.max - r.min).toBeLessThanOrEqual(tol * 2);
  });

  it.each(qs.filter((q) => q.type === 'rate'))('第 $i 题：心率可算', (q) => {
    const r = rateTruth(readMeta(q.case));
    expect(r.bpm).toBeGreaterThan(30);
    expect(r.bpm).toBeLessThan(200);
  });

  it.each(qs.filter((q) => q.type === 'axis'))('第 $i 题：两种电轴算法一致，答案可靠', (q) => {
    expect(axisTruth(readMeta(q.case))).not.toBeNull();
  });

  it.each(qs.filter((q) => q.type === 'vector'))('第 $i 题：最近的导联轴明确（与次近相差 ≥ 10°）', (q) => {
    const r = vectorTruth(load(q.case), q.at);
    expect(r.margin).toBeGreaterThanOrEqual(10);
  });
});

describe('题目文字与数据一致', () => {
  // 按病例与题型查找（不按序号：调整题目顺序时不会悄悄测错题）
  const q = (set, type, caseId) => {
    const x = QUIZ_SETS.find((s) => s.id === set).questions.find((y) => y.type === type && y.case === caseId);
    if (!x) throw new Error(`题库中没有 ${set} / ${type} / ${caseId}`);
    return x;
  };
  it('一度房室阻滞题：II 导联 PR > 200 ms', () => {
    const x = q('advanced', 'interval', 'ludb-134');
    expect(intervalTruth(readMeta(x.case), x.lead, 'PR').median).toBeGreaterThan(200);
  });
  it('心动过缓题：心率约 50 次/分', () => {
    const x = q('advanced', 'rate', 'ludb-134');
    expect(Math.round(rateTruth(readMeta(x.case)).bpm)).toBeLessThan(55);
  });
  it('电轴题：左前分支阻滞约 −50°，另一例在 0 ~ +90°', () => {
    expect(axisTruth(readMeta(q('advanced', 'axis', 'ptbxl-2239').case)).deg).toBeLessThan(-45);
    const d = axisTruth(readMeta(q('advanced', 'axis', 'ptbxl-10171').case)).deg;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(90);
  });
  it('向量题：左前分支阻滞病例的向量最接近 aVL', () => {
    const x = q('advanced', 'vector', 'ptbxl-2239');
    expect(vectorTruth(load(x.case), x.at).lead).toBe('aVL');
    expect(vectorTruth(load('ptbxl-33'), q('advanced', 'vector', 'ptbxl-33').at).lead).toBe('II');
  });
  it('"心电图没有提示左心室肥厚"题的背景是正常心电图', () => {
    const x = QUIZ_SETS[0].questions.find((y) => y.prompt.includes('没有提示左心室肥厚'));
    expect(readMeta(x.case).diagnoses.map((d) => d.code)).toContain('NORM');
  });
});
