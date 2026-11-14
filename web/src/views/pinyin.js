// 难认的字注拼音：每个"单元"（一章正文、一张药物卡片）里，每个字只在第一次出现时注音。
// 只收药名、病名里的生僻字和容易读错的字；多音字按本手册里的读法（卒中 cù、沙库巴曲 qū）。

export const PINYIN = {
  噻: 'sāi',
  嗪: 'qín',
  啶: 'dìng',
  缬: 'xié',
  酮: 'tóng',
  吡: 'bǐ',
  唑: 'zuò',
  哌: 'pài',
  袢: 'pàn',
  拮: 'jié',
  哚: 'duǒ',
  吲: 'yǐn',
  醛: 'quán',
  磺: 'huáng',
  蝶: 'dié',
  呋: 'fū',
  酐: 'gān',
  肼: 'jǐng',
  屈: 'qū',
  曲: 'qū',
  琥: 'hǔ',
  珀: 'pò',
  甾: 'zāi',
  萘: 'nài',
  嗜: 'shì',
  咪: 'mī',
  酰: 'xiān',
  孢: 'bāo',
  蝮: 'fù',
  疮: 'chuāng',
  溃: 'kuì',
  疡: 'yáng',
  妊: 'rèn',
  娠: 'shēn',
  卒: 'cù',
  厄: 'è',
  嚼: 'jiáo',
  掰: 'bāi',
  踝: 'huái',
  髓: 'suǐ',
  胱: 'guāng',
  芙: 'fú',
  苯: 'běn',
  胺: 'àn',
  胚: 'pēi',
  酵: 'jiào',
  硅: 'guī',
  碱: 'jiǎn',
  蓄: 'xù',
  汀: 'tīng',
};

const RE = new RegExp(`[${Object.keys(PINYIN).join('')}]`, 'g');
const escText = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** 纯文本 → HTML：没注过音的难字包成 <ruby>，注过的记进 seen。无难字时返回 null。 */
export function rubyText(text, seen = new Set()) {
  let hit = false;
  const html = escText(text).replace(RE, (ch) => {
    if (seen.has(ch)) return ch;
    seen.add(ch);
    hit = true;
    return `<ruby>${ch}<rt>${PINYIN[ch]}</rt></ruby>`;
  });
  return hit ? html : null;
}

const SKIP = new Set(['RT', 'RUBY', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA']);

/** 给一个 DOM 单元注音（在 linkTerms 之后调用，免得拆开术语） */
export function addPinyin(root, seen = new Set()) {
  if (!root) return;
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode(n) {
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (SKIP.has(p.tagName)) return 2;
      return 1;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const html = rubyText(n.nodeValue, seen);
    if (html === null) continue;
    const tpl = root.ownerDocument.createElement('template');
    tpl.innerHTML = html;
    n.replaceWith(tpl.content);
  }
}

/** 药物手册页面：标题 + 正文一个单元，每张卡片各一个单元 */
export function addPinyinAll(bodyEl) {
  const seen = new Set();
  addPinyin(bodyEl.querySelector('h2'), seen);
  addPinyin(bodyEl.querySelector('.hb-text'), seen);
  bodyEl.querySelectorAll('.dg-card').forEach((c) => addPinyin(c));
}
