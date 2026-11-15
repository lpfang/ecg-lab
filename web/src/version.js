// 构建号与缓存处理。
// GitHub Pages 对所有文件统一返回 Cache-Control: max-age=600，改不了响应头：
//   - JS / CSS 由 Vite 加指纹，不受影响；
//   - public/ 下的病例数据、图片没有指纹，引用时加 ?v=<构建号>（asset）；
//   - index.html 本身会被缓存 10 分钟：启动时绕过缓存读 version.json，
//     发现已有新版本就换一个带 ?v= 的地址重新打开（checkFreshBuild）。

/* global __BUILD_ID__ */
export const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/** public/ 下文件的地址加构建号 */
export const asset = (p) => `${p}${p.includes('?') ? '&' : '?'}v=${BUILD}`;

/** 把一段 HTML 里引用 public/ 图片的 src / href 加上构建号 */
export function versionAssets(root) {
  for (const el of root.querySelectorAll('img[src^="anatomy/"], a[href^="anatomy/"]')) {
    const attr = el.tagName === 'IMG' ? 'src' : 'href';
    const v = el.getAttribute(attr);
    if (!/[?&]v=/.test(v)) el.setAttribute(attr, asset(v));
  }
}

/**
 * 页面是旧版本（缓存里的 index.html）时，换成带 ?v=<新构建号> 的地址重新打开一次。
 * 地址里已经带着这个构建号还对不上（例如 CDN 尚未更新），就不再跳转，避免循环。
 */
export async function checkFreshBuild({ fetchImpl = fetch, loc = location } = {}) {
  if (BUILD === 'dev') return false;
  let latest;
  try {
    const r = await fetchImpl(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    latest = (await r.json()).build;
  } catch {
    return false;
  }
  if (!latest || latest === BUILD) return false;
  const u = new URL(loc.href);
  if (u.searchParams.get('v') === latest) return false;
  u.searchParams.set('v', latest);
  loc.replace(u.toString());
  return true;
}
