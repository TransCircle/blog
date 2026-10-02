#!/usr/bin/env node
/**
 * 构建后 SEO 全站校验：扫描 dist/，把 Search Console 会报的问题在部署前拦下来。
 *
 *   pnpm build && pnpm check:seo
 *
 * 错误（退出码 1）：
 *  - 内链不带尾斜杠（会触发 308，GSC「网页会自动重定向」）或指向不存在的页面（404）
 *  - 可收录页面缺 canonical、canonical 不等于自身 URL；noindex 页面带 canonical
 *  - 缺 <title> / description、<h1> 不是恰好一个
 *  - JSON-LD 无法解析，或 @id 引用在本页找不到
 *  - sitemap 中的 URL 不存在 / 是 noindex / canonical 指向别处；可收录页面没进 sitemap
 *  - _redirects 规则被现存文件遮蔽、目标不存在；robots.txt 屏蔽了 sitemap 中的 URL
 * 警告：title / description 过长过短或重复、图片缺 alt、标签导语为自动生成等。
 *
 * 已接入 pnpm build（在 PDF 之后、推送之前）：有错误时构建失败，Cloudflare 保持线上旧版本，
 * 不会把坏掉的 SEO 部署出去，也不会向搜索引擎推送。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://blog.transcircle.org';
const distDir = fileURLToPath(new URL('../dist', import.meta.url));

const errors = [];
const warnings = [];
const error = (where, message) => errors.push(`${where}：${message}`);
const warn = (where, message) => warnings.push(`${where}：${message}`);

if (!fs.existsSync(distDir)) {
  console.error('dist/ 不存在，请先运行 pnpm build。');
  process.exit(1);
}

/* ── 收集文件 ───────────────────────────────────────────── */

const files = new Set();
(function walk(dir, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    else files.add(rel);
  }
})(distDir, '');

// --require-pdfs（正式 pnpm build 使用）：每篇文章的 PDF 都必须存在。PDF 生成脚本在 Cloudflare 上失败时
// 会软退出，若不在这里拦住，全站的「下载 PDF」链接与 JSON-LD 里的 PDF 编码都会指向不存在的文件。
// 本地 build:site 不生成 PDF，不带这个参数，此时 PDF 链接视为存在。
const requirePdfs = process.argv.includes('--require-pdfs');
const pdfsBuilt = requirePdfs || [...files].some((f) => /^\/print\/[^/]+\.pdf$/.test(f));

const decode = (p) => {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};

/** 站内路径（已解码）是否对应 dist 中的真实文件。区分大小写。 */
function exists(p) {
  const clean = decode(p.split(/[?#]/)[0]);
  if (files.has(clean)) return true;
  if (clean.endsWith('/') && files.has(`${clean}index.html`)) return true;
  // 未生成 PDF 的本地构建（build:site）：PDF 链接视为存在
  if (!pdfsBuilt && /^\/print\/[^/]+\.pdf$/.test(clean)) return true;
  return false;
}

const isFileLike = (p) => /\.[a-z0-9]+$/i.test(p.split(/[?#]/)[0].split('/').pop() || '');

/** 文件路径 → 页面 URL path（编码形式）。 */
function pagePathOf(file) {
  const dir = file.replace(/index\.html$/, '');
  return dir
    .split('/')
    // 与 src/lib/seo/url.ts 的 encodePathSegment 同一规则（`*` 也编码）
    .map((part) => encodeURIComponent(part).replace(/\*/g, '%2A'))
    .join('/');
}

/* ── 结构化数据语义检查 ─────────────────────────────────── */

const typesOf = (node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).filter(Boolean);
/** 空白归一化：页面文本与结构化数据里的字符串比较前都要经过它（标题里的连续空格、换行不算不一致）。 */
const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const textOf = (html) =>
  squash(unescapeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')));

/**
 * 按类型检查 Google 富结果与 schema.org 的必需 / 推荐字段，以及结构化数据与页面可见内容是否一致。
 * 只检查本站实际使用的类型；语法与 @id 引用在上面已检查。
 */
function checkSchemaSemantics(where, graph, html, canonical, noindex) {
  const byId = new Map(graph.filter((n) => typeof n['@id'] === 'string').map((n) => [n['@id'], n]));
  const need = (node, fields, label) => {
    for (const f of fields) {
      const v = node[f];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        error(where, `${label} 缺少 ${f}`);
      }
    }
  };
  const visible = textOf(html);

  for (const node of graph) {
    const types = typesOf(node);
    const label = `JSON-LD ${types.join('/')}`;

    if (types.includes('Organization') && node['@id'] === 'https://transcircle.org/#organization') {
      need(node, ['name', 'url', 'logo'], label);
    }
    if (types.includes('WebSite') && node['@id'] === 'https://blog.transcircle.org/#website') {
      need(node, ['name', 'url', 'publisher'], label);
    }
    // 页面级 WebPage（含子类型）：url 必须与 canonical 一致
    const pageTypes = ['WebPage', 'CollectionPage', 'ItemPage', 'AboutPage', 'ProfilePage', 'SearchResultsPage'];
    if (types.some((t) => pageTypes.includes(t)) && String(node['@id'] ?? '').endsWith('#webpage')) {
      need(node, ['name', 'url', 'isPartOf'], label);
      if (canonical && node.url !== canonical) error(where, `${label} 的 url ${node.url} ≠ canonical ${canonical}`);
      if (types.includes('ProfilePage')) {
        need(node, ['mainEntity'], label);
        const entity = byId.get(node.mainEntity?.['@id']);
        if (!entity) error(where, 'ProfilePage 的 mainEntity 在本页未定义');
        else need(entity, ['name', 'url'], 'ProfilePage.mainEntity');
      }
    }
    // 文章节点必须完整（Google Article 要求）：本站不在列表页输出缺字段的简要节点
    if (types.includes('BlogPosting')) {
      need(node, ['headline', 'datePublished', 'dateModified', 'author', 'image', 'publisher', 'mainEntityOfPage', 'description'], label);
      if (String(node.headline ?? '').length > 110) error(where, `${label} headline 超过 110 字符`);
      if (node.dateModified && node.datePublished && node.dateModified < node.datePublished) {
        error(where, `${label} dateModified 早于 datePublished`);
      }
      // 属性值类型：editor 只接受 Person（团队编辑应写在 contributor）
      for (const r of [].concat(node.editor ?? [])) {
        const target = byId.get(r?.['@id']);
        if (target && !typesOf(target).includes('Person')) error(where, `${label} 的 editor 指向非 Person 实体 ${r['@id']}`);
      }
      if (node.headline && !visible.includes(squash(node.headline).slice(0, 20))) {
        error(where, `${label} headline 不在页面可见内容中`);
      }
      // citation 应当是页面上可见的参考链接（没被正文引用的脚注不会渲染出来）。只告警不阻断：这只影响结构化数据，
      // 不能因此让整站无法部署。
      // 两边都按 WHATWG URL 规范化后比较：中文 / 空格的百分号编码写法统一
      const normalizeUrl = (u) => {
        try {
          return new URL(u).href;
        } catch {
          return u;
        }
      };
      const hrefs = new Set(
        [...html.replace(/<script[\s\S]*?<\/script>/gi, '').matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map((m) =>
          normalizeUrl(unescapeHtml(m[1]))
        )
      );
      for (const c of [].concat(node.citation ?? [])) {
        if (c?.url && !hrefs.has(normalizeUrl(c.url))) warn(where, `${label} 的 citation 不是页面上的可见链接：${c.url}`);
      }
    }
    if (types.includes('BreadcrumbList')) {
      const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
      if (items.length === 0) error(where, 'BreadcrumbList 为空');
      items.forEach((item, i) => {
        if (item.position !== i + 1) error(where, `BreadcrumbList 第 ${i + 1} 项 position 为 ${item.position}`);
        if (!item.name || !/^https:\/\//.test(String(item.item ?? ''))) error(where, `BreadcrumbList 第 ${i + 1} 项缺少 name 或绝对 URL`);
      });
      const last = items[items.length - 1];
      if (last && canonical && last.item !== canonical) error(where, `BreadcrumbList 最后一项 ${last.item} ≠ canonical`);
      // 与可见面包屑一致（Google 要求结构化数据反映页面可见内容）
      const nav = html.match(/<nav[^>]*aria-label="面包屑导航"[^>]*>([\s\S]*?)<\/nav>/);
      if (!noindex) {
        if (!nav) error(where, '有 BreadcrumbList 但页面没有可见面包屑');
        else {
          const navText = textOf(nav[1]);
          for (const item of items) {
            if (!navText.includes(squash(item.name))) error(where, `可见面包屑缺少「${item.name}」`);
          }
        }
      }
    }
    if (types.includes('FAQPage')) {
      const qs = Array.isArray(node.mainEntity) ? node.mainEntity : [];
      if (qs.length === 0) error(where, 'FAQPage 没有问题');
      for (const q of qs) {
        if (!q.name || !q.acceptedAnswer?.text) error(where, 'FAQPage 问题缺少 name 或 acceptedAnswer.text');
        else if (!visible.includes(squash(q.name))) error(where, `FAQPage 问题「${q.name}」不在页面可见内容中`);
      }
    }
    if (types.includes('Person')) need(node, ['name', 'url'], label);
  }
}

/* ── 逐页检查 ───────────────────────────────────────────── */

const htmlPages = [...files].filter((f) => f.endsWith('.html') && !f.startsWith('/print/'));
const pages = new Map(); // path → { noindex, canonical, title, description }

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3] ?? '') : null;
};
// 字符引用解码：Astro 把链接里的 & 输出为 &#x26;，不解码的话 # 会被当成锚点截断，误报内链缺尾斜杠
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unescapeHtml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return Object.hasOwn(NAMED_ENTITIES, ref.toLowerCase()) ? NAMED_ENTITIES[ref.toLowerCase()] : match;
  });

for (const file of htmlPages) {
  const html = fs.readFileSync(path.join(distDir, file), 'utf-8');
  const where = file;
  const is404 = file === '/404.html';
  const pagePath = is404 ? '/404.html' : pagePathOf(file);

  const robots = html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i)?.[1] ?? '';
  const noindex = /noindex/i.test(robots);
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1] ?? null;
  const title = unescapeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
  const description = unescapeHtml(html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ?? '');

  pages.set(pagePath, { noindex, canonical, title, description });

  if (!robots) error(where, '缺少 <meta name="robots">');
  if (!title) error(where, '缺少 <title>');
  if (!description) error(where, '缺少 meta description');

  if (noindex) {
    if (canonical) error(where, `noindex 页面不应声明 canonical（${canonical}）`);
  } else {
    const expected = `${ORIGIN}${pagePath}`;
    if (!canonical) error(where, '可收录页面缺少 canonical');
    else if (canonical !== expected) error(where, `canonical ${canonical} ≠ 自身 URL ${expected}`);

    const len = [...description].length;
    if (len > 160) warn(where, `description 过长（${len} 字）`);
    if (len < 16) warn(where, `description 过短（${len} 字）`);
    if ([...title].length > 64) warn(where, `title 过长（${[...title].length} 字）`);
  }

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count !== 1) error(where, `<h1> 数量为 ${h1Count}，应为 1`);

  for (const img of html.match(/<img\b[^>]*>/gi) || []) {
    // 缺 alt 不阻塞发布（作者容易漏写），但要提示补上
    if (attr(img, 'alt') === null) warn(where, `图片缺少 alt：${attr(img, 'src')}`);
  }

  // 内链
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    let href = attr(tag, 'href');
    if (href === null) continue;
    href = unescapeHtml(href);
    // 外链（非 transcircle.org）必须带 nofollow noopener noreferrer（AGENTS.md「内容安全」）
    // 含协议相对链接（//host/…）：浏览器按 https 打开，同样是外链
    if (/^(https?:)?\/\//i.test(href)) {
      let host = '';
      try {
        host = new URL(href, ORIGIN).hostname;
      } catch {
        host = '';
      }
      if (host && !/(^|\.)transcircle\.org$/i.test(host)) {
        const rel = (attr(tag, 'rel') ?? '').split(/\s+/);
        const missing = ['nofollow', 'noopener', 'noreferrer'].filter((r) => !rel.includes(r));
        if (missing.length > 0) error(where, `外链缺少 rel="${missing.join(' ')}"：${href}`);
      }
    }
    if (href.startsWith(ORIGIN)) href = href.slice(ORIGIN.length) || '/';
    // 文档相对的内链（../other/、./section/）按本页的正式 URL 解析后同样检查存在性与尾斜杠；
    // 页内锚点（#…）与带协议的链接（mailto: 等）不在这里检查
    if (!href.startsWith('/') && !href.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      try {
        const resolved = new URL(href, `${ORIGIN}${pagePath}`);
        href = `${resolved.pathname}${resolved.search}${resolved.hash}`;
      } catch {
        error(where, `无法解析的链接：${href}`);
        continue;
      }
    }
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const bare = href.split(/[?#]/)[0];
    if (!bare) continue;
    if (!isFileLike(bare) && !bare.endsWith('/')) error(where, `内链缺尾斜杠（会被 308）：${href}`);
    else if (!exists(bare)) error(where, `内链指向不存在的页面：${href}`);
  }

  // JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      error(where, `JSON-LD 解析失败：${e.message}`);
      continue;
    }
    const ids = new Set();
    const refs = [];
    (function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      const keys = Object.keys(node);
      if (typeof node['@id'] === 'string') {
        if (keys.length === 1) refs.push(node['@id']);
        else ids.add(node['@id']);
      }
      for (const key of keys) if (key !== '@id') visit(node[key]);
    })(data);
    for (const r of refs) if (!ids.has(r)) error(where, `JSON-LD 引用 ${r} 在本页未定义`);
    checkSchemaSemantics(where, Array.isArray(data['@graph']) ? data['@graph'] : [data], html, canonical, noindex);
  }

  // 标签页导语
  if (/^\/tags\/[^/]+\/$/.test(pagePath) && /^跨环博客中标记为「.*」的 \d+ 篇文章/.test(description)) {
    warn(where, '标签导语为自动生成（可在 src/data/tag-descriptions.ts 补一句人工导语）');
  }
}

/* ── PDF 里的链接 ───────────────────────────────────────── */

// PDF 从本地打印视图生成：链接注释里出现构建机地址，说明正文链接没按正式 URL 改写，读者点不开
for (const file of [...files].filter((f) => /^\/print\/[^/]+\.pdf$/.test(f))) {
  const pdf = fs.readFileSync(path.join(distDir, file)).toString('latin1');
  if (/\/URI\s*\(\s*https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(pdf)) error(file, 'PDF 中含指向构建机（127.0.0.1 / localhost）的链接');
}

/* ── 重复的 title / description ─────────────────────────── */

const dup = (key) => {
  const seen = new Map();
  for (const [p, info] of pages) {
    if (info.noindex || !info[key]) continue;
    seen.set(info[key], [...(seen.get(info[key]) ?? []), p]);
  }
  for (const [value, list] of seen) if (list.length > 1) warn(list.join(', '), `${key} 重复：${value}`);
};
dup('title');
dup('description');

/* ── sitemap ───────────────────────────────────────────── */

const sitemapUrls = new Set();
for (const file of [...files].filter((f) => /^\/sitemap-\d+\.xml$/.test(f))) {
  const xml = fs.readFileSync(path.join(distDir, file), 'utf-8');
  for (const m of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const loc = m[1].trim();
    if (!loc.startsWith(ORIGIN)) continue;
    const p = loc.slice(ORIGIN.length);
    if (p.startsWith('/og/') || p.endsWith('.png')) continue; // image:loc
    sitemapUrls.add(p);
  }
}
if (sitemapUrls.size === 0) error('sitemap', '没有找到任何 URL');

for (const p of sitemapUrls) {
  const info = pages.get(p);
  if (!info) {
    error('sitemap', `${p} 不存在`);
    continue;
  }
  if (info.noindex) error('sitemap', `${p} 是 noindex 页面`);
  if (info.canonical && info.canonical !== `${ORIGIN}${p}`) error('sitemap', `${p} 的 canonical 指向 ${info.canonical}`);
}
for (const [p, info] of pages) {
  if (!info.noindex && !sitemapUrls.has(p)) error('sitemap', `可收录页面 ${p} 没有进入 sitemap`);
}

/* ── _redirects ────────────────────────────────────────── */

if (!files.has('/_redirects')) error('_redirects', '缺失');
else {
  const lines = fs
    .readFileSync(path.join(distDir, '_redirects'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'));
  const sources = new Set(lines.map((l) => l.split(/\s+/)[0]));
  for (const line of lines) {
    // Cloudflare 格式：[来源] [目标] [状态码]，字段数不对的行会被整行忽略
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 3 || !/^30[12378]$/.test(fields[2] ?? '')) {
      error('_redirects', `格式错误（应为「来源 目标 状态码」三个字段）：${line}`);
      continue;
    }
    const [from, to] = fields;
    if (from.includes(':') || from.includes('*')) continue;
    // /print/<slug>/ 只在未生成 PDF 的本地构建里存在
    const shadowOk = !pdfsBuilt && from.startsWith('/print/');
    if (!shadowOk && exists(from)) error('_redirects', `${from} 是现存文件，规则不会生效`);
    if (!exists(to)) error('_redirects', `${from} → ${to}：目标不存在`);
    if (sources.has(to)) error('_redirects', `${from} → ${to}：链式跳转`);
  }
}
if (!files.has('/_headers')) error('_headers', '缺失');

/* ── robots.txt ────────────────────────────────────────── */

const robotsTxt = files.has('/robots.txt') ? fs.readFileSync(path.join(distDir, 'robots.txt'), 'utf-8') : '';
if (!robotsTxt) error('robots.txt', '缺失');
if (!/^Sitemap:\s*https:\/\/blog\.transcircle\.org\/sitemap-index\.xml$/m.test(robotsTxt)) {
  error('robots.txt', '缺少 Sitemap 行');
}
const disallows = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
for (const p of sitemapUrls) {
  const hit = disallows.find((d) => decode(p).startsWith(d));
  if (hit) error('robots.txt', `Disallow: ${hit} 屏蔽了 sitemap 中的 ${p}`);
}

/* ── 必备文件 ──────────────────────────────────────────── */

for (const f of [
  '/llms.txt',
  '/llms-full.txt',
  '/ai.txt',
  '/humans.txt',
  '/.well-known/security.txt',
  '/site.webmanifest',
  '/browserconfig.xml',
  '/rss.xml',
  '/atom.xml',
  '/feed.json',
  '/sitemap-index.xml',
  '/og-cover.png',
  '/favicon.ico',
  '/b1ba2832c93fda19d24eb2a7b7e91ca3.txt',
]) {
  if (!files.has(f)) error('必备文件', `${f} 缺失`);
}

/* ── 报告 ──────────────────────────────────────────────── */

for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
console.log(
  `\n检查了 ${htmlPages.length} 个页面、${sitemapUrls.size} 个 sitemap URL：${errors.length} 个错误，${warnings.length} 个警告。`
);
process.exit(errors.length > 0 ? 1 : 0);
