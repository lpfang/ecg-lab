// 缓存处理：旧首页发现新版本时换地址重开一次，不循环
import { describe, it, expect } from 'vitest';
import { asset, checkFreshBuild, BUILD } from '../src/version.js';

const fakeLoc = (href) => ({ href, replaced: null, replace(u) { this.replaced = u; } });
const fakeFetch = (build, ok = true) => async () => ({ ok, json: async () => ({ build }) });

describe('version', () => {
  it('asset 加构建号', () => {
    expect(asset('anatomy/x.svg')).toBe(`anatomy/x.svg?v=${BUILD}`);
    expect(asset('a.json?x=1')).toBe(`a.json?x=1&v=${BUILD}`);
  });
  it('有新版本：换成带 ?v=新构建号 的地址，保留原有参数', async () => {
    const loc = fakeLoc('https://x/ecg-lab/?read=s-stemi&case=ptbxl-33');
    expect(await checkFreshBuild({ fetchImpl: fakeFetch('newer'), loc })).toBe(true);
    const u = new URL(loc.replaced);
    expect(u.searchParams.get('v')).toBe('newer');
    expect(u.searchParams.get('read')).toBe('s-stemi');
    expect(u.searchParams.get('case')).toBe('ptbxl-33');
  });
  it('已是最新版本：不跳转', async () => {
    const loc = fakeLoc('https://x/ecg-lab/');
    expect(await checkFreshBuild({ fetchImpl: fakeFetch(BUILD), loc })).toBe(false);
    expect(loc.replaced).toBeNull();
  });
  it('地址里已带新构建号仍对不上：不再跳转，避免循环', async () => {
    const loc = fakeLoc('https://x/ecg-lab/?v=newer');
    expect(await checkFreshBuild({ fetchImpl: fakeFetch('newer'), loc })).toBe(false);
    expect(loc.replaced).toBeNull();
  });
  it('version.json 读取失败：不跳转', async () => {
    const loc = fakeLoc('https://x/ecg-lab/');
    expect(await checkFreshBuild({ fetchImpl: fakeFetch('newer', false), loc })).toBe(false);
    const boom = async () => { throw new Error('offline'); };
    expect(await checkFreshBuild({ fetchImpl: boom, loc })).toBe(false);
  });
});
