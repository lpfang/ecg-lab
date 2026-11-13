// 测试用：从 public/cases 读取病例，构造与 data.js loadCase() 相同接口的对象
import { readFileSync } from 'node:fs';

export const CASES = new URL('../public/cases/', import.meta.url);
export const readMeta = (id) => JSON.parse(readFileSync(new URL(`${id}/meta.json`, CASES), 'utf8'));

export function load(id) {
  const meta = readMeta(id);
  const buf = readFileSync(new URL(`${id}/signal.i16`, CASES));
  const n = meta.nSamples;
  const leads = {};
  meta.leads.forEach((l, li) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = buf.readInt16LE((li * n + i) * 2);
    leads[l] = a;
  });
  const fs = meta.fs;
  return {
    meta,
    fs,
    durationMs: meta.durationMs,
    lead: (l) => leads[l],
    valueAt(l, t) {
      const a = leads[l];
      const x = (t / 1000) * fs;
      const i = Math.max(0, Math.min(a.length - 2, Math.floor(x)));
      const f = Math.max(0, Math.min(1, x - i));
      return a[i] * (1 - f) + a[i + 1] * f;
    },
  };
}

