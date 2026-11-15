import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { SCP_ZH } from '../src/content/scp.js';

const CASES = new URL('../public/cases/', import.meta.url);

describe('诊断标签中文名', () => {
  it('每个病例用到的 PTB-XL 标签都有中文名', () => {
    const missing = new Set();
    for (const id of readdirSync(CASES)) {
      const f = new URL(`${id}/meta.json`, CASES);
      if (!existsSync(f)) continue;
      for (const d of JSON.parse(readFileSync(f, 'utf8')).diagnoses ?? []) if (d.code && !SCP_ZH[d.code]) missing.add(d.code);
    }
    expect([...missing]).toEqual([]);
  });
});
