/**
 * 与 SEO / GEO 相关的正文分析：纯函数，不依赖 astro:content，便于单元测试。
 */
import type {
  Definition,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Html,
  Image,
  ImageReference,
  Link,
  LinkReference,
  Root,
} from 'mdast';
import type { Element } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { EXIT, SKIP, visit } from 'unist-util-visit';
import { own } from './dict';

export interface Citation {
  readonly name: string;
  readonly url: string;
}

/** 中文长文的平均阅读速度（字 / 分钟）；countWords 的口径是「汉字 + 英文单词」。 */
const READING_SPEED = 400;

export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / READING_SPEED));
}

/** ISO 8601 时长（schema.org timeRequired）。 */
export function isoDuration(minutes: number): string {
  return `PT${Math.max(1, Math.round(minutes))}M`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 与 Astro 相同的 Markdown 语法（CommonMark + GFM 脚注 / 自动链接），只解析不渲染。 */
const markdownParser = unified().use(remarkParse).use(remarkGfm);

/**
 * 从脚注定义（`[^id]: …`）中提取外部参考文献链接，写进 BlogPosting.citation。
 * 医疗类文章的参考文献是 E-E-A-T 的关键信号，也方便 AI 追溯原始出处。
 *
 * 用 Markdown 语法树判断引用，而不是逐行正则：只取从**正文**出发实际引用到的脚注（含脚注里再引用的脚注）。
 * 渲染器不输出没被引用的脚注定义，行内代码 / 代码块里的 `[^id]` 也不是引用——结构化数据不能声称
 * 页面上看不到的参考文献（check:seo 会核对每条 citation 都是页面上的可见链接）。
 */
export function extractCitations(body: string, limit = 50): Citation[] {
  const tree = markdownParser.parse(body) as Root;
  const definitions = new Map<string, FootnoteDefinition>();
  visit(tree, 'footnoteDefinition', (node: FootnoteDefinition) => {
    if (!definitions.has(node.identifier)) definitions.set(node.identifier, node);
  });
  const linkDefinitions = new Map<string, string>();
  visit(tree, 'definition', (node: Definition) => {
    if (!linkDefinitions.has(node.identifier)) linkDefinitions.set(node.identifier, node.url);
  });

  const referencesIn = (node: Root | FootnoteDefinition, skipDefinitions: boolean): string[] => {
    const ids: string[] = [];
    visit(node, (child) => {
      if (skipDefinitions && child.type === 'footnoteDefinition') return SKIP;
      if (child.type === 'footnoteReference') ids.push((child as FootnoteReference).identifier);
      return undefined;
    });
    return ids;
  };

  // 从正文的引用出发，沿「脚注里引用别的脚注」递归，得到页面上实际会渲染的脚注
  const reachable = new Set<string>();
  const queue = referencesIn(tree, true);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const def = definitions.get(id);
    if (reachable.has(id) || !def) continue;
    reachable.add(id);
    queue.push(...referencesIn(def, false));
  }

  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const [id, def] of definitions) {
    if (!reachable.has(id)) continue;
    // 链接文字常是「Scholars@Duke」「PubMed」这类站名；整条脚注的纯文本更能说明文献是什么
    const whole = toString(def).replace(/\s+/g, ' ').trim();
    let done = false;
    visit(def, (node) => {
      if (done) return EXIT;
      if (node.type !== 'link' && node.type !== 'linkReference') return undefined;
      // 引用式文献链接（`[临床指南][guide]` + `[guide]: URL`）同样会渲染出来，按定义解析
      const raw = node.type === 'link' ? (node as Link).url : linkDefinitions.get((node as LinkReference).identifier);
      if (!raw) return undefined;
      const link = node as Link | LinkReference;
      // 语法树已经把链接目标与正文标点分开，目标里的末尾句点是地址的一部分，不能删；
      // 按 WHATWG URL 规范化（中文、空格百分号编码），与渲染器输出的 href 同一写法
      if (!/^https?:\/\//i.test(raw)) return undefined;
      let url: string;
      try {
        url = new URL(raw).href;
      } catch {
        return undefined;
      }
      if (seen.has(url)) return undefined;
      seen.add(url);
      const name = whole.length > 0 && whole.length <= 200 ? whole : toString(link).trim() || url;
      out.push({ name, url });
      if (out.length >= limit) done = true;
      return undefined;
    });
    if (done) break;
  }
  return out;
}

export interface BodyImage {
  /** 站内路径（/images/…）或绝对 URL。 */
  readonly src: string;
  readonly alt: string;
}

/**
 * 正文里的图片（Markdown `![alt](src)` 与 HTML `<img>`），去重、保持出现顺序。
 * 用于 BlogPosting.image 与图片 sitemap：让配图也能进入图片搜索与 AI 的多模态引用。
 */
export function extractImages(body: string): BodyImage[] {
  // 用与页面相同的 Markdown 语法树：代码块 / 行内代码里的 `![示例](…)` 不是图片，
  // 引用式图片（`![配图][photo]` + `[photo]: /images/a.png`）要按定义解析
  const tree = markdownParser.parse(body) as Root;
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node: Definition) => {
    if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
  });

  const seen = new Set<string>();
  const out: BodyImage[] = [];
  const add = (src: string, alt: string): void => {
    // 地址已由 Markdown 解析器取出（`<…>` 写法可以含空格），只去掉首尾空白，不能按空格截断
    const clean = src.trim();
    if (!clean || clean.startsWith('data:') || seen.has(clean)) return;
    seen.add(clean);
    out.push({ src: clean, alt: alt.trim() });
  };
  visit(tree, (node) => {
    if (node.type === 'image') add((node as Image).url, (node as Image).alt ?? '');
    else if (node.type === 'imageReference') {
      const ref = node as ImageReference;
      const url = definitions.get(ref.identifier);
      if (url) add(url, ref.alt ?? '');
    } else if (node.type === 'html') {
      // 正文里手写的 <img>（HTML 注释里的不算）
      const html = (node as Html).value.replace(/<!--[\s\S]*?-->/g, '');
      // 标签边界跳过引号内容（alt 里可以有 `>`），属性按语法逐个读取并解码实体
      for (const m of html.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
        const attrs = readAttributes(m[0]);
        const src = attrs.get('src');
        if (src) add(src, attrs.get('alt') ?? '');
      }
    }
  });
  return out;
}

/** 正文图片地址按页面 URL 解析为绝对地址；无法解析的（不完整的地址）跳过，不让一张坏图阻断整站构建。 */
export function resolveImageUrls(
  images: readonly BodyImage[],
  pageUrl: string
): Array<{ url: string; alt: string }> {
  return images.flatMap((img) => {
    try {
      return [{ url: new URL(img.src, pageUrl).href, alt: img.alt }];
    } catch {
      return [];
    }
  });
}

export interface RelatableEntry {
  readonly slug: string;
  readonly tags: readonly string[];
  readonly category: string;
  readonly pubDate: Date;
}

/**
 * 相关文章：按共享标签数（权重 2）+ 同分类（权重 1）打分，同分按发布时间新者优先。
 * 没有任何关联的文章不入选——宁可少推，也不推无关内容。
 */
export function selectRelated<T extends RelatableEntry>(current: T, candidates: readonly T[], limit = 3): T[] {
  return candidates
    .filter((c) => c.slug !== current.slug)
    .map((c) => {
      const shared = c.tags.filter((tag) => current.tags.includes(tag)).length;
      const score = shared * 2 + (c.category === current.category ? 1 : 0);
      return { c, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.c.pubDate.getTime() - a.c.pubDate.getTime())
    .slice(0, limit)
    .map(({ c }) => c);
}

/**
 * 正文第一段纯文本（跳过标题、引用块、提示框、列表、表格、脚注定义、HTML 注释与分隔线）。
 * 用于补足过短的 meta description——只截取作者原文，不编写新内容。
 */
export function firstParagraph(body: string): string {
  // 按语法树只看顶层段落：代码块（哪怕内部有空行）、引用块、列表、表格、HTML、脚注定义都不是导语
  const tree = markdownParser.parse(body) as Root;
  let headings = 0;
  for (const node of tree.children) {
    // 只看导语与第一节：更靠后的段落往往是示例或细节（例如标点规范里的例句），不能代表全文
    if (node.type === 'heading' && ++headings >= 2) break;
    if (node.type !== 'paragraph') continue;
    const plain = toString(node, { includeHtml: false }).replace(/\s+/g, ' ').trim();
    if (plain.length >= 20) return plain;
  }
  return '';
}

/** 按字符截断，尽量停在句读处。 */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max).join('');
  // 只在句末标点处收尾；停在逗号上读起来像话没说完，不如直接加省略号
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('；'));
  if (stop > cut.length * 0.6) return cut.slice(0, stop + 1);
  return `${[...cut].slice(0, max - 1).join('').replace(/[，、：；,\s]+$/, '')}…`;
}

/**
 * 文章的 meta description：frontmatter 的 description 足够长（≥ 60 字）就直接用；
 * 过短的（副标题式、提问式）补上正文首段，让搜索结果摘要与 AI 摘要都有实质信息。
 */
export function metaDescription(description: string | undefined, title: string, body: string, max = 120): string {
  const lead = (description ?? '').trim().replace(/^——\s*/, '');
  if ([...lead].length >= 60) return truncate(lead, max);
  const head = lead || title;
  const joiner = /[。！？!?」』）)]$/.test(head) ? '' : '。';
  const excerpt = firstParagraph(body);
  // 段落以冒号结尾（引出后面的列表）时改成句号，摘要里不留悬空的冒号
  if (excerpt) return truncate(`${head}${joiner}${excerpt.replace(/[：:]$/, '。')}`, max);
  // 没有导语段落时，用文章的二级标题概括结构（仍然只取原文）
  const sections = sectionHeadings(body).slice(0, 5);
  if (sections.length > 0) return truncate(`${head}${joiner}内容涵盖${sections.join('、')}等。`, max);
  return truncate(head, max);
}

/** 正文的二级标题（去掉编号与 Markdown 标记）。 */
export function sectionHeadings(body: string): string[] {
  return [...body.matchAll(/^##\s+(.+)$/gm)]
    .map((m) =>
      stripMarkdown(m[1] ?? '')
        .replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, '')
        .replace(/[？?：:]$/, '')
    )
    .filter((heading) => heading.length > 0);
}

/** 文章最后修改日期：有 updatedDate 用它，否则为发布日期。 */
export function lastModified(entry: { pubDate: Date; updatedDate?: Date | undefined }): Date {
  return entry.updatedDate && entry.updatedDate > entry.pubDate ? entry.updatedDate : entry.pubDate;
}

/** YYYY-MM-DD（UTC）。 */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 去掉开头与标题重复的一级标题，其余一级标题降为二级（与页面上 rehypeDemoteH1 的处理一致）。
 * 按 Markdown 语法树找标题：代码块里的 `# 注释` 不会被误改，Setext 写法（`标题\n===`）同样识别。
 */
export function normalizeHeadings(raw: string, title: string): string {
  // 源文件可能是 CRLF（Windows 检出）：导出的 Markdown 统一用 LF
  const body = raw.replace(/\r\n?/g, '\n');
  const tree = markdownParser.parse(body) as Root;
  const first = tree.children[0];
  const drop =
    first?.type === 'heading' && first.depth === 1 && toString(first).trim() === title.trim() ? first : null;
  const rest = drop?.position ? body.slice(drop.position.end.offset ?? 0) : body;
  return rewriteHeadings(rest.trim(), (depth) => (depth === 1 ? 2 : depth)).trim();
}

/**
 * 按语法树改写全部标题的级别：ATX 只换 `#` 的个数（标题内容原样保留）；Setext 写法改成单行 ATX
 * （Setext 只能表示一、二级），多行内容按软换行合并为空格。
 */
function rewriteHeadings(body: string, depthOf: (depth: number) => number): string {
  const tree = markdownParser.parse(body) as Root;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  // 全部标题（引用块、列表里的也算）：页面上的 rehype 处理也不分层级
  visit(tree, 'heading', (node: Heading) => {
    const target = depthOf(node.depth);
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (target === node.depth || start === undefined || end === undefined) return;
    const source = body.slice(start, end);
    const atx = /^(#{1,6})(?=[ \t]|$)/.exec(source);
    if (atx) {
      edits.push({ start, end: start + (atx[1]?.length ?? 0), text: '#'.repeat(target) });
      return;
    }
    // Setext：内容在最后一行下划线之前。改写成单行 ATX，多行内容按软换行（空格）合并；
    // 续行开头的容器标记（引用块的 `>`、列表缩进）在节点区间内，一并去掉
    const underline = source.lastIndexOf('\n');
    const lines = (underline > 0 ? source.slice(0, underline) : '').split('\n');
    const content = lines
      .map((line, i) => (i === 0 ? line : line.replace(/^[\s>]*/, '')).trim())
      .filter(Boolean)
      .join(' ');
    if (content) edits.push({ start, end, text: `${'#'.repeat(target)} ${content}` });
  });
  let out = body;
  for (const edit of edits.sort((x, y) => y.start - x.start)) {
    out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`;
  }
  return out;
}

/**
 * 脚注标识前缀：可读的 ASCII 部分 + 完整 slug 的稳定哈希（FNV-1a 32 位）。
 * 只做字符替换会丢信息——「甲文」「乙文」都会变成「--」，拼接后两篇的 [^1] 又会撞在一起。
 */
export function footnotePrefix(slug: string): string {
  let hash = 0x811c9dc5;
  for (const ch of slug) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const ascii = slug.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${ascii ? `${ascii}-` : ''}${hash.toString(16).padStart(8, '0')}`;
}

/**
 * 把一篇文章的 Markdown 正文改造成可以与其他文章拼接的片段（llms-full.txt 使用）：
 *  - 脚注标识加文章前缀（[^3] → [^<slug>-3]，按语法树，见 isolateLinks）：多篇文章拼在一起时，各自的 [^3] 不会互相串用参考文献；
 *  - 全部标题降一级（最深到 ######，按语法树，Setext 写法同样处理）：正文章节挂在所属文章的标题之下，按标题切分时不会丢失归属；
 *  - 链接（见 isolateLinks）：引用式定义标识加文章前缀；相对地址与页内锚点（目录、`[常见问题](#常见问题)`、
 *    `href="#…"`）改写为「本文 URL + …」——拼接后不同文章、站点 FAQ 可能有同名标题，相对地址也换了解析基准。
 * 代码内容原样保留。
 */
export function isolateForBundle(body: string, prefix: string, pageUrl: string): string {
  // 先改链接、再按新的源码重新解析降级标题：两步各自按语法树定位，编辑区间不会互相覆盖
  const linked = isolateLinks(body, footnotePrefix(prefix), pageUrl);
  return rewriteHeadings(linked, (depth) => Math.min(6, depth + 1));
}

/**
 * 拼接前按语法树改写一篇文章里的链接（代码块 / 行内代码不受影响）：
 *  - 引用式链接 / 图片（`[来源][ref]`、`[ref][]`、`[ref]` + `[ref]: URL`）的标识加文章前缀：多篇文章拼进同一个
 *    文档后，同名定义只有第一个生效，后面文章的链接会指到前一篇的来源。没有对应定义的 `[文字]` 是普通文本，保持原样；
 *  - 行内链接 / 图片、引用定义、手写 HTML 的 href / src 里的相对地址与页内锚点，按本文 URL 改成绝对地址：
 *    全文快照位于站点根目录，`../other/`、`#常见问题` 换了解析基准会指到别处。
 */
function isolateLinks(body: string, prefix: string, pageUrl: string): string {
  const tree = markdownParser.parse(body) as Root;
  const defined = new Set<string>();
  visit(tree, 'definition', (node: Definition) => {
    defined.add(node.identifier);
  });

  const edits: Array<{ start: number; end: number; text: string }> = [];
  const label = (raw: string): string => `${prefix}-${raw}`;
  const absolute = (url: string): string | null => {
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
    try {
      return url.startsWith('#') ? `${pageUrl}${url}` : new URL(url, pageUrl).href;
    } catch {
      return null;
    }
  };
  /** 把节点（在正文中的起点为 offset）源码里的目标地址区间替换成按本文 URL 解析出的绝对地址。 */
  const rewriteTarget = (offset: number, url: string, range: DestinationRange | null): void => {
    const resolved = absolute(url);
    if (!resolved || !range) return;
    // 解析出的地址可能含括号；用尖括号包起来，不必担心括号配对（< > 已被 URL 规范化编码）
    const text = range.angled || /[()]/.test(resolved) ? `<${resolved}>` : resolved;
    edits.push({ start: offset + range.start, end: offset + range.end, text });
  };

  visit(tree, (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const source = body.slice(start, end);
    if (node.type === 'definition') {
      const def = node as Definition;
      const open = `[${def.label ?? ''}]:`;
      if (!def.label || !source.startsWith(open)) return;
      edits.push({ start, end: start + open.length, text: `[${label(def.label)}]:` });
      rewriteTarget(start, def.url, destinationAt(source, skipSpace(source, open.length)));
    } else if (node.type === 'link' || node.type === 'image') {
      // 行内写法 `[文字]( <地址> "标题")`：先找到文字部分结束的 `](`，再跳过空白与 `<`，
      // 地址就从那里开始（标题里出现同样的地址也不会误改）。自动链接没有 `](`，且都是绝对地址
      rewriteTarget(start, (node as Link | Image).url, inlineDestination(node as Link | Image, source, start));
    } else if (node.type === 'footnoteReference') {
      // 脚注标识加前缀（按语法树：行内代码、缩进代码里的 `[^1]` 写法示例不受影响）
      const ref = node as FootnoteReference;
      if (ref.label && source === `[^${ref.label}]`) edits.push({ start, end, text: `[^${label(ref.label)}]` });
    } else if (node.type === 'footnoteDefinition') {
      const def = node as FootnoteDefinition;
      const open = `[^${def.label ?? ''}]:`;
      if (def.label && source.startsWith(open)) edits.push({ start, end: start + open.length, text: `[^${label(def.label)}]:` });
    } else if (node.type === 'html') {
      const rewritten = absolutizeHtmlFragment(source, pageUrl);
      if (rewritten !== source) edits.push({ start, end, text: rewritten });
    } else if (node.type === 'linkReference' || node.type === 'imageReference') {
      const ref = node as LinkReference | ImageReference;
      if (!ref.label || !defined.has(ref.identifier)) return;
      if (ref.referenceType === 'full') {
        const at = source.lastIndexOf('[');
        if (at > 0) edits.push({ start: start + at, end, text: `[${label(ref.label)}]` });
      } else if (ref.referenceType === 'collapsed') {
        if (source.endsWith('[]')) edits.push({ start: end - 2, end, text: `[${label(ref.label)}]` });
      } else {
        edits.push({ start: end, end, text: `[${label(ref.label)}]` }); // 快捷写法 → 完整写法
      }
    }
  });

  let out = body;
  for (const edit of edits.sort((x, y) => y.start - x.start)) {
    out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`;
  }
  return out;
}

interface DestinationRange {
  readonly start: number;
  readonly end: number;
  /** 源码是 `<…>` 写法（区间包含尖括号）。 */
  readonly angled: boolean;
}

function skipSpace(source: string, at: number): number {
  let i = at;
  while (i < source.length && /\s/.test(source[i] ?? '')) i++;
  return i;
}

/**
 * 按 CommonMark 的「链接目标」语法，从 at 处读出源码里完整的目标区间：`<…>` 到第一个未转义的 `>`；
 * 否则是一段不含空白、括号配对的字符（反斜杠转义的字符照单全收）。转义、实体都留在区间里，
 * 替换时整段换成解析后再规范化的地址，不需要源码与解析结果逐字相同。
 */
function destinationAt(source: string, at: number): DestinationRange | null {
  if (source[at] === '<') {
    for (let i = at + 1; i < source.length; i++) {
      const ch = source[i];
      if (ch === '\\') i++;
      else if (ch === '\n' || ch === '<') return null;
      else if (ch === '>') return { start: at, end: i + 1, angled: true };
    }
    return null;
  }
  let depth = 0;
  let i = at;
  for (; i < source.length; i++) {
    const ch = source[i] ?? '';
    if (ch === '\\') {
      i++;
      continue;
    }
    if (/\s/.test(ch)) break;
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) break;
      depth--;
    }
  }
  return i > at ? { start: at, end: i, angled: false } : null;
}

/**
 * 行内链接 / 图片 `[文字]( 目标 "标题")` 的目标区间（相对节点起点）。链接按最后一个子节点的结束位置定位
 * 文字部分的 `]`；图片的 alt 没有子节点，取第一个未被反斜杠转义的 `](`。
 */
function inlineDestination(node: Link | Image, source: string, start: number): DestinationRange | null {
  let close = -1;
  const last = node.type === 'link' ? node.children.at(-1)?.position?.end.offset : undefined;
  if (last !== undefined) close = last - start;
  else {
    for (let i = source.indexOf(']('); i >= 0; i = source.indexOf('](', i + 1)) {
      if (source[i - 1] !== '\\') {
        close = i;
        break;
      }
    }
  }
  if (close < 0 || source[close] !== ']' || source[close + 1] !== '(') return null;
  return destinationAt(source, skipSpace(source, close + 2));
}

/** 把站内相对链接改为绝对 URL；阅读器不知道文章来自哪个站点，也不在文章页的上下文里。 */
export function absolutizeHtml(html: string, pageUrl: string): string {
  // 以本篇文章的 URL 为基准解析所有相对地址：根相对（/images/a.png）、普通相对（../other/）与
  // 页内锚点（#user-content-fn-3）。阅读器会以 Feed 自身的地址为基准解析相对链接，
  // 多篇文章同屏展示时还会共用同名 id，不改写就会跳到错误地址甚至别的文章的文献。
  // 已带协议的（https:、mailto: …）原样保留；协议相对的 //host/… 补成 https。
  //
  // 按 HTML 语法树改写：只动真实元素的 href / src / srcset，注释、文本原样保留，序列化与转义交给
  // hast-util-to-html。不能用正则在 HTML 字符串里找标签——注释里的「伪标签」被改写后可能提前关闭注释，
  // 在清洗之后重新造出可执行的元素（清洗时它们只是注释文字）。
  const tree = fromHtml(html, { fragment: true });
  visit(tree, 'element', (node: Element) => {
    const props = node.properties;
    for (const key of ['href', 'src'] as const) {
      const value = props[key];
      if (typeof value !== 'string') continue;
      const resolved = absoluteFrom(value, pageUrl);
      if (resolved !== null) props[key] = resolved;
    }
    // srcset：按 HTML 的候选语法逐个绝对化（hast 里可能是原始字符串，也可能是按逗号拆好的数组）
    const srcSet = props.srcSet;
    if (typeof srcSet === 'string') props.srcSet = absolutizeSrcset(srcSet, pageUrl);
    else if (Array.isArray(srcSet)) props.srcSet = absolutizeSrcset(srcSet.join(', '), pageUrl);
  });
  return toHtml(tree);
}

/**
 * Markdown 正文里的原始 HTML 片段（isolateLinks 用）：片段可能只是半个结构（单独一个 `<a href>`），
 * 不能整体解析再序列化，所以逐个标签改写属性，但**跳过注释**，注释内容原样保留。
 */
function absolutizeHtmlFragment(html: string, pageUrl: string): string {
  return html.replace(/<!--[\s\S]*?(?:-->|$)|<[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>/g, (token) =>
    token.startsWith('<!--') ? token : absolutizeTag(token, pageUrl)
  );
}

/** 一个属性：名字，可选的 `=` 与值（双引号 / 单引号 / 无引号）。sticky：只从指定位置开始匹配。 */
const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/**
 * 属性值的字符引用解码：数字实体（Astro 把 URL 里的 & 输出为 `&#x26;`）与常用具名实体。
 * 不解码的话 `&#x26;` 里的 `#` 会被 URL 解析当成片段起点，查询参数就丢了。
 */
const decodeAttr = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return own(NAMED_ENTITIES, ref.toLowerCase()) ?? match;
  });

/** 按属性语法逐个读出标签的属性（小写名 → 解码后的值）；引号内的 `>`、`src=` 等文字不会被误认。 */
function readAttributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  const name = /^<[a-zA-Z][^\s/>]*/.exec(tag);
  if (!name) return out;
  ATTRIBUTE.lastIndex = name[0].length;
  for (let m = ATTRIBUTE.exec(tag); m; m = ATTRIBUTE.exec(tag)) {
    const key = (m[2] ?? '').toLowerCase();
    if (!out.has(key)) out.set(key, decodeAttr(m[4] ?? m[5] ?? m[6] ?? ''));
  }
  return out;
}

const encodeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * 逐个属性解析标签，只改写**属性名**为 href / src 的值。不能在整个标签字符串里搜 `src=`：
 * `title="… src=./a.png onmouseover=…"` 这样的属性文字会被当成属性，插入的引号会提前闭合 title，
 * 在清洗之后重新造出事件属性。解析不了的标签原样返回；改写后的值统一用双引号并转义。
 */
function absolutizeTag(tag: string, pageUrl: string): string {
  const name = /^<[a-zA-Z][^\s/>]*/.exec(tag);
  if (!name) return tag;
  let out = name[0];
  let at = name[0].length;
  for (;;) {
    ATTRIBUTE.lastIndex = at;
    const m = ATTRIBUTE.exec(tag);
    if (!m) break;
    at = ATTRIBUTE.lastIndex;
    const [whole, space = '', attr = '', eq, dq, sq, bare] = m;
    const raw = dq ?? sq ?? bare;
    let replaced = whole;
    if (eq !== undefined && raw !== undefined && /^(href|src)$/i.test(attr)) {
      const resolved = absoluteFrom(decodeAttr(raw), pageUrl);
      if (resolved !== null) replaced = `${space}${attr}="${encodeAttr(resolved)}"`;
    } else if (eq !== undefined && raw !== undefined && /^srcset$/i.test(attr)) {
      // 响应式图片的候选地址同样要绝对化：支持 srcset 的阅读器会优先从这里挑图
      replaced = `${space}${attr}="${encodeAttr(absolutizeSrcset(decodeAttr(raw), pageUrl))}"`;
    }
    out += replaced;
  }
  const rest = tag.slice(at);
  return /^\s*\/?>$/.test(rest) ? out + rest : tag;
}

/** 相对地址 → 绝对地址；已带协议的（https:、mailto: …）与解析不了的返回 null（保持原样）。 */
function absoluteFrom(value: string, pageUrl: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  try {
    return value.startsWith('//') ? `https:${value}` : new URL(value, pageUrl).href;
  } catch {
    return null;
  }
}

/**
 * 按 HTML 的 srcset 语法逐个候选改写地址：地址本身不含空白但可以含逗号，候选之间以逗号分隔，
 * 地址后面跟可选的描述符（`2x`、`640w`）。不能简单按逗号拆分。
 */
function absolutizeSrcset(srcset: string, pageUrl: string): string {
  const candidates: string[] = [];
  let i = 0;
  while (i < srcset.length) {
    while (i < srcset.length && /[\s,]/.test(srcset[i] ?? '')) i++;
    if (i >= srcset.length) break;
    let end = i;
    while (end < srcset.length && !/\s/.test(srcset[end] ?? '')) end++;
    let url = srcset.slice(i, end);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      const comma = srcset.indexOf(',', end);
      descriptor = srcset.slice(end, comma < 0 ? srcset.length : comma).trim();
      end = comma < 0 ? srcset.length : comma;
    }
    candidates.push([absoluteFrom(url, pageUrl) ?? url, descriptor].filter(Boolean).join(' '));
    i = end + 1;
  }
  return candidates.join(', ');
}
