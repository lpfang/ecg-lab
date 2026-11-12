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

export async function loadCase(id) {
  const meta = await getJson(`${id}/meta.json`);
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
  return {
    meta,
    fs: meta.fs,
    durationMs: meta.durationMs,
    lead: (name) => leads[name],
    offset: (name) => offsets[name],
  };
}
