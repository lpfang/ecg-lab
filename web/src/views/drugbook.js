// 降压药手册：目录 + 章节正文 + 药物卡片 + 检索。
// 内容在 content/drugs.js；这里只负责渲染和检索，不含任何医学判断。

import { DRUG_BOOK, DRUG_CHAPTERS, DRUG_CLASSES, DRUGS, DRUG_CHECKED, drugById, classById } from '../content/drugs.js';
import { REFS } from '../content/refs.js';
import { addPinyin, addPinyinAll } from './pinyin.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 检索用的文字：通用名、英文名、各地商品名、别名、类别名 */
export function drugHaystack(d) {
  const c = classById(d.cls);
  return [
    d.zh,
    d.inn,
    ...(d.alias ?? []),
    ...(d.cn?.brands ?? []),
    ...(d.us?.brands ?? []),
    d.cn?.originator,
    d.cn?.holder,
    c?.zh,
    c?.short,
    c?.abbr,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** 按空格分词，每个词都要命中（不区分大小写） */
export function searchDrugs(query, list = DRUGS) {
  const toks = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!toks.length) return list;
  return list.filter((d) => {
    const h = drugHaystack(d);
    return toks.every((t) => h.includes(t));
  });
}

const refList = (ids) =>
  (ids ?? [])
    .map((r) => REFS[r])
    .filter(Boolean)
    .map((r) => `<li>${esc(r.text)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</li>`)
    .join('');

const linkList = (urls) =>
  (urls ?? [])
    .map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a></li>`)
    .join('');

/** 一张药物卡片（HTML） */
export function drugCard(d, { showClass = true } = {}) {
  const c = classById(d.cls);
  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '');
  const cn = d.cn ?? {};
  const us = d.us ?? {};
  const cnBrand = cn.brands?.length
    ? `${cn.brands.map((b) => `<b>${esc(b)}</b>`).join('、')}${cn.originator ? `（原研：${esc(cn.originator)}）` : ''}`
    : cn.note
      ? ''
      : '';
  return `<section class="dg-card" id="drug-${d.id}" data-drug-card="${d.id}">
  <h4>${esc(d.zh)} <span class="en">${esc(d.inn)}</span>${
    showClass && c ? ` <a href="#" class="dg-cls" data-drug-ch="${c.chapter}">${esc(c.short ?? c.zh)}</a>` : ''
  }${d.cnStatus === 'unavailable' ? ' <span class="dg-tag warn">国内未上市</span>' : ''}${
    d.cnStatus === 'uncertain' ? ' <span class="dg-tag warn">国内供应未核实</span>' : ''
  }</h4>
  ${d.plain ? `<p>${d.plain}</p>` : ''}
  <table class="hb-table dg-table">
    ${row('中国商品名', [cnBrand, cn.note ? esc(cn.note) : ''].filter(Boolean).join('<br>'))}
    ${row('国内持有企业', cn.holder ? esc(cn.holder) : '')}
    ${row('集采 / 医保', [cn.vbp, cn.nrdl].filter(Boolean).map(esc).join('；'))}
    ${row('美国商品名', us.brands?.length ? us.brands.map(esc).join('、') + (us.note ? `<br><span class="muted">${esc(us.note)}</span>` : '') : us.note ? esc(us.note) : '')}
    ${row('剂型', d.forms ? esc(d.forms) : '')}
    ${row('常用剂量', d.dose ? `${esc(d.dose)}<br><span class="muted">一般范围，来自中国指南 2024 表 15/16（注明"说明书"的除外），仅供了解。你自己吃多少按医嘱，不要自行增减。</span>` : '')}
    ${row('特别注意', d.notes?.length ? `<ul>${d.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : '')}
  </table>
  ${
    d.sources?.length
      ? `<details class="refs"><summary>出处（核实于 ${esc(d.checked ?? DRUG_CHECKED)}）</summary><ul>${linkList(d.sources)}</ul></details>`
      : ''
  }
</section>`;
}

/** 某类药物下的卡片（按 DRUGS 顺序） */
export const drugsOfClass = (clsId) => DRUGS.filter((d) => d.cls === clsId || d.cls2 === clsId);

export function renderDrugNav(navEl, current) {
  navEl.innerHTML =
    '<p class="hb-nav-primer"><a href="#" data-drug-ch="search" class="' +
    (current === 'search' ? 'on' : '') +
    '">🔍 药物查询<span class="muted small">按通用名、商品名、英文名</span></a></p>' +
    DRUG_BOOK.map(
      (part) =>
        `<section><h4>${esc(part.title)}<span class="muted small">${esc(part.sub)}</span></h4><ol>` +
        part.chapters
          .map(
            (c) =>
              `<li><a href="#" data-drug-ch="${c.id}" class="${c.id === current ? 'on' : ''}">${esc(c.title)}</a></li>`,
          )
          .join('') +
        '</ol></section>',
    ).join('');
}

const DISCLAIMER =
  '<p class="dg-warn">本手册只介绍药物的一般知识，<b>不能代替医生和药师的指导</b>。是否用药、用哪种、用多少，要由医生结合你的血压、其他疾病、化验结果和正在用的药决定。<b>不要自行停药、换药或增减剂量</b>。</p>';

/** 渲染一章；返回章节对象（找不到时 null） */
export function renderDrugChapter(bodyEl, id) {
  if (id === 'search') {
    bodyEl.innerHTML =
      '<h2>药物查询 <span class="en">Drug finder</span></h2>' +
      '<p class="muted small">输入通用名、商品名或英文名的一部分，例如"氨氯地平""络活喜""Norvasc""沙坦"。多个词用空格隔开。</p>' +
      '<input type="search" id="dg-q" class="dg-q" placeholder="搜索降压药…" autocomplete="off">' +
      '<p id="dg-count" class="muted small"></p><div id="dg-results"></div>' +
      DISCLAIMER;
    return { id: 'search' };
  }
  const ch = DRUG_CHAPTERS.find((c) => c.id === id);
  if (!ch) return null;
  const classes = (ch.classes ?? []).map(classById).filter(Boolean);
  const refs = refList(ch.refs);
  bodyEl.innerHTML =
    `<h2>${esc(ch.title)} <span class="en">${esc(ch.en)}</span></h2>` +
    (ch.part === 'basics' ? '' : DISCLAIMER) +
    `<div class="hb-text">${ch.body}</div>` +
    classes
      .map((c) => {
        const ds = drugsOfClass(c.id);
        return ds.length
          ? `<section class="dg-list"><h3>${esc(c.zh)}：常见药物（${ds.length} 种）</h3>${ds.map((d) => drugCard(d, { showClass: false })).join('')}</section>`
          : '';
      })
      .join('') +
    (ch.ecg ? `<p class="small"><a href="#" data-hb-read="p-drugs">这类药对心电图的影响：读片手册 →</a></p>` : '') +
    (refs ? `<details class="refs"><summary>出处</summary><ul>${refs}</ul></details>` : '') +
    (ch.part === 'basics' ? DISCLAIMER : '') +
    `<p class="muted small hb-disclaimer">本手册未经医生或药师审定；企业与商品名信息核实于 ${esc(DRUG_CHECKED)}，之后可能变化，以药盒和说明书为准。</p>`;
  return ch;
}

/** 检索结果的一行：名字、类别、商品名；点开才生成完整卡片（77 张卡片一次全画太重） */
function drugRow(d) {
  const c = classById(d.cls);
  const brands = [...(d.cn?.brands ?? []), ...(d.us?.brands ?? [])].slice(0, 4).map(esc).join('、');
  return `<details class="dg-row" data-drug-row="${d.id}"><summary><b>${esc(d.zh)}</b> <span class="en">${esc(d.inn)}</span>${
    c ? ` <span class="dg-row-cls">${esc(c.short ?? c.zh)}</span>` : ''
  }${brands ? ` <span class="muted small">${brands}</span>` : ''}</summary></details>`;
}

/** 检索结果 */
export function renderDrugSearch(bodyEl, q) {
  const res = searchDrugs(q);
  const box = bodyEl.querySelector('#dg-results');
  bodyEl.querySelector('#dg-count').textContent = q.trim()
    ? `找到 ${res.length} 种（共 ${DRUGS.length} 种），点名字展开详情`
    : `共 ${DRUGS.length} 种，按类别排列，点名字展开详情`;
  box.innerHTML = res.length
    ? res.map(drugRow).join('')
    : '<p class="muted">没有找到。可以换个写法，或只输入名字的一部分。</p>';
  box.querySelectorAll('summary').forEach((el) => addPinyin(el));
  if (!box.dataset.bound) {
    box.dataset.bound = '1';
    // toggle 不冒泡，在捕获阶段统一处理：第一次展开时才生成卡片
    box.addEventListener(
      'toggle',
      (e) => {
        const row = e.target;
        if (!row.matches?.('.dg-row') || !row.open || row.querySelector('.dg-card')) return;
        row.insertAdjacentHTML('beforeend', drugCard(drugById(row.dataset.drugRow)));
        addPinyin(row.querySelector('.dg-card'));
      },
      true,
    );
  }
  if (res.length === 1) box.querySelector('.dg-row').open = true;
}

export { drugById, DRUG_CLASSES, addPinyinAll };
