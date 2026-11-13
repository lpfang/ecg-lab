// 术语表关键字检索。
// 规则：输入按空格拆成多个关键字，每个都要出现（与）；不区分大小写、全角半角（NFKC）。
// 排序：命中名称（中文 / 英文）的排在前面，只在解释正文里出现的排在后面；同分保持术语表原顺序。

/** 统一大小写与全角半角，便于比较 */
export const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase();

/** 去掉 HTML 标签与实体，只留文字 */
const plainText = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');

/** 把查询拆成关键字（去重、去空） */
export function tokens(query) {
  return [...new Set(norm(query).split(/\s+/).filter(Boolean))];
}

/**
 * @returns 命中的术语 id，按相关程度排序；查询为空时返回全部（原顺序）
 */
export function searchTerms(terms, query) {
  const ks = tokens(query);
  const ids = Object.keys(terms);
  if (!ks.length) return ids;
  const hits = [];
  ids.forEach((id, order) => {
    const t = terms[id];
    const name = norm(`${t.zh} ${t.en} ${id}`);
    const body = norm(`${plainText(t.plain)} ${plainText(t.pro)}`);
    let score = 0;
    for (const k of ks) {
      if (name.includes(k)) score += norm(t.zh) === k || norm(t.en) === k ? 10 : 3;
      else if (body.includes(k)) score += 1;
      else return; // 有一个关键字没出现就不算命中
    }
    hits.push({ id, score, order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).map((h) => h.id);
}
