// 病例数据加载。数据 URL 带构建号，避免发版后读到旧缓存。

/* global __BUILD_ID__ */
const V = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const url = (p) => `./cases/${p}?v=${V}`;

async function getJson(p) {
  const r = await fetch(url(p));
  if (!r.ok) throw new Error(`${p}：HTTP ${r.status}`);
  return r.json();
}

export function loadIndex() {
  return getJson('index.json');
}

const LEAD_NAMES = new Set(['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

/** 检查 meta.json 里决定如何解析波形的字段；不合格时抛出带原因的错误，而不是画出错乱的图 */
export function validateMeta(meta, id) {
  const bad = (why) => {
    throw new Error(`${id} 元数据有误：${why}`);
  };
  if (!meta || typeof meta !== 'object') bad('不是对象');
  if (!(meta.fs > 0)) bad(`采样率 fs = ${meta.fs}`);
  if (!Number.isInteger(meta.nSamples) || meta.nSamples < 2) bad(`采样点数 nSamples = ${meta.nSamples}`);
  if (!Array.isArray(meta.leads) || !meta.leads.length) bad('缺少导联列表');
  for (const l of meta.leads) if (!LEAD_NAMES.has(l)) bad(`未知导联 ${l}`);
  if (new Set(meta.leads).size !== meta.leads.length) bad('导联重复');
  // 标准版面和向量环要用全部 12 个导联
  const missing = [...LEAD_NAMES].filter((l) => !meta.leads.includes(l));
  if (missing.length) bad(`缺少导联 ${missing.join('、')}`);
  // 下面的解码器只认这一种格式：小端 Int16、单位 µV、导联优先
  const sig = meta.signal ?? {};
  if (sig.dtype !== 'int16le') bad(`数据类型 ${sig.dtype}（只支持 int16le）`);
  if (sig.unit !== 'uV') bad(`单位 ${sig.unit}（只支持 uV）`);
  if (sig.layout !== 'lead-major') bad(`排列 ${sig.layout}（只支持 lead-major）`);
  const f = sig.file;
  if (typeof f !== 'string' || !/^[\w.-]+$/.test(f)) bad(`波形文件名 ${f}`);
  // 各面板渲染要用的字段
  if (!Array.isArray(meta.issues)) bad('缺少质量报告 issues');
  if (typeof meta.source?.name !== 'string') bad('缺少来源 source');
  for (const k of ['measurements', 'amplitudes']) if (meta[k] != null && !Array.isArray(meta[k])) bad(`${k} 不是列表`);
  const beats = meta.annotations?.beats;
  if (beats != null && (!Array.isArray(beats) || beats.some((b) => b.QRS && !(b.QRS.on <= b.QRS.off))))
    bad('心搏标注格式有误');
  const dur = (meta.nSamples / meta.fs) * 1000;
  if (!(Math.abs(meta.durationMs - dur) <= 1000 / meta.fs + 1))
    bad(`时长 ${meta.durationMs} ms 与采样点数不符（应约 ${dur} ms）`);
  return meta;
}

export async function loadCase(id) {
  const meta = validateMeta(await getJson(`${id}/meta.json`), id);
  const r = await fetch(url(`${id}/${meta.signal.file}`));
  if (!r.ok) throw new Error(`${id} 波形：HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  const n = meta.nSamples;
  const expected = meta.leads.length * n * 2;
  if (buf.byteLength !== expected) {
    throw new Error(`${id} 波形大小不符：${buf.byteLength} 字节，应为 ${expected}`);
  }
  // 小端 Int16，导联优先；DataView 保证字节序与平台无关
  const dv = new DataView(buf);
  const leads = {};
  meta.leads.forEach((name, li) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = dv.getInt16((li * n + i) * 2, true);
    leads[name] = a;
  });
  // 每个导联的直流偏移（中位数），绘图时减去；M1 加滤波后由滤波器处理
  const offsets = {};
  for (const [name, a] of Object.entries(leads)) {
    const sorted = Float32Array.from(a).sort();
    offsets[name] = sorted[sorted.length >> 1];
  }
  const fs = meta.fs;
  return {
    meta,
    fs,
    durationMs: meta.durationMs,
    lead: (name) => leads[name],
    offset: (name) => offsets[name],
    /** 某导联在 t（ms）处的电压（µV，原始值，线性插值） */
    valueAt(name, t) {
      const a = leads[name];
      const x = (t / 1000) * fs;
      const i = Math.max(0, Math.min(a.length - 2, Math.floor(x)));
      const f = Math.max(0, Math.min(1, x - i));
      return a[i] * (1 - f) + a[i + 1] * f;
    },
  };
}
