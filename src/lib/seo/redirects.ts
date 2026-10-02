/**
 * Cloudflare Pages `_redirects` 规则的唯一来源（构建时由 src/integrations/seo-files.ts 写入 dist/）。
 *
 * **全自动**：删文、改名、删改标签后不需要手写规则。构建时从 git 历史与 src/data/url-history.json
 * 得知「曾经存在过哪些文章与标签」，凡是现在不存在的，都按 history.ts 推导出的去向生成 301。
 * 下面的 LEGACY_TAGS / RENAMED_POSTS 只用于覆盖自动推导的结果（例如想把某个标签指向别处）。
 *
 * 每一条都对应一个曾经公开过、被搜索引擎收录或被外部引用过的旧 URL。GSC 的「未找到（404）」
 * 大部分来自这些 URL：删掉的旧标签、改名的文章、早期 `/posts/<文件名>.md/` 路由、大小写不同的 slug。
 * 用 301 把它们合并到现存页面，既消除 404，也把旧链接积累的信号传给新页面。
 *
 * 新增规则时：来源必须是**不存在**的路径（Cloudflare 静态文件优先于重定向规则），
 * 目标必须是**存在**的页面——两点都由 validateRedirects() 在构建与测试时检查。
 */
import { hasOwn, own } from './dict';
import { postSlug as slugifyPost } from './frontmatter';
import { EMPTY_HISTORY, type UrlHistory } from './history';
import {
  AUTHORS_PATH,
  HOME_PATH,
  TAGS_PATH,
  authorPath,
  encodePathSegment,
  postMarkdownPath,
  postPath,
  postPdfPath,
  tagPath,
} from './url';

export interface RedirectRule {
  readonly from: string;
  readonly to: string;
  readonly status: 301 | 302;
}

/**
 * 历史上用过、后来被合并或删除的标签 → 现行标签。
 * 来源：git log -p -- src/content/posts 中所有 tags 行（9402486 标签体系重整、9e3ae64 HRT→GAHT）。
 * 值为 null 表示没有对应的现行标签，跳到标签总览。
 */
export const LEGACY_TAGS: Readonly<Record<string, string | null>> = {
  HRT: 'GAHT',
  astro: 'Astro',
  architecture: '架构',
  setup: null,
  frontend: '前端',
  'design-system': '设计规范',
  历史记载: '争议',
  规范: '文章规范',
  公开: null,
  意见: null,
  wiki: null,
  语言: '语言学',
  文章: null,
  issues: '问答',
  RE: '问答',
};

/**
 * 改过文件名（即改过 URL）的文章：旧文件名（不含 .md）→ 现行 slug。
 * 来源：git log --diff-filter=R -- src/content/posts。
 */
export const RENAMED_POSTS: Readonly<Record<string, string>> = {
  反扭转媒体错用小言代词争议: 'xiaoyan-misgendering-business',
};

/** 常见的猜测路径（阅读器、爬虫、手动输入）→ 真实入口。 */
export const STATIC_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['/sitemap.xml', '/sitemap-index.xml'],
  ['/feed', '/rss.xml'],
  ['/feed.xml', '/rss.xml'],
  ['/index.xml', '/rss.xml'],
  ['/rss', '/rss.xml'],
  ['/atom', '/atom.xml'],
  ['/feed.atom', '/atom.xml'],
  // 首页列出全部文章：/posts/ 列表入口并回首页。
  // （分页 /page/<n>/ 从未真正生成过页面——文章数一直少于每页上限——所以不为它生成规则，任意 /page/… 返回真实 404）
  ['/posts', HOME_PATH],
  ['/blog', HOME_PATH],
  ['/home', HOME_PATH],
  ['/archive', HOME_PATH],
  ['/archives', HOME_PATH],
  ['/post', HOME_PATH],
  ['/tag', TAGS_PATH],
  ['/categories', TAGS_PATH],
  ['/category', TAGS_PATH],
  ['/author', AUTHORS_PATH],
  ['/print', HOME_PATH],
];

/** 文件名 → Astro 的默认 slug（github-slugger）。 */
const slugify = (stem: string): string => slugifyPost(stem);

export interface RedirectInput {
  /** 现存文章：slug（URL 用，小写）、源文件名（不含 .md，保留原大小写）与标题。 */
  readonly posts: ReadonlyArray<{ readonly slug: string; readonly fileStem: string; readonly title?: string }>;
  /** 现存标签。 */
  readonly tags: readonly string[];
  /** 现存作者页的作者 id。 */
  readonly authors?: readonly string[] | undefined;
  /** 归一化的名称 / 别名 / id → 作者 id（见 src/lib/authors.ts 的 authorAliasIndex）。 */
  readonly authorAliases?: ReadonlyMap<string, string> | undefined;
  /** 发布过的 URL 历史（git + 清单，见 history.ts）；缺省时只用人工表。 */
  readonly history?: UrlHistory | undefined;
}

/**
 * 一个路径的全部等价写法：原文 / 百分号编码 × 带 / 不带尾斜杠。
 * exact 为 true 时不增减尾斜杠：`/posts/x.md/`（早期文章路由）与 `/posts/x.md`（旧版原文地址）去向不同，不能互相派生。
 */
function variants(path: string, exact = false): string[] {
  const base = exact ? path : path.replace(/\/+$/, '');
  const encoded = base.split('/').map(encodePathSegment).join('/');
  const forms = exact ? [base, encoded] : [base, `${base}/`, encoded, `${encoded}/`];
  return [...new Set(forms)].filter((p) => p.length > 1 && isLiteral(p));
}

/**
 * 只保留能按字面量写进 `_redirects` 的写法：
 * - 每行是空白分隔的三个字段，含空格（标签「Trans Health」、文件名「Blood Test」）的原文写法整行会被判为非法；
 * - `:name` 是占位符、`*` 是通配符，含它们的原文写法（标签「QA:testing」）会变成动态规则，匹配到不存在的地址。
 * 这些路径只保留百分号编码形式（浏览器请求时空格本来就会编码）。所有规则都由数据生成，构建断言动态规则数为零。
 */
function isLiteral(path: string): boolean {
  return !/[\s:*]/.test(path);
}

function push(rules: RedirectRule[], from: string, to: string, exact = false): void {
  for (const source of variants(from, exact)) {
    if (source === to) continue;
    if (rules.some((r) => r.from === source)) continue;
    rules.push({ from: source, to, status: 301 });
  }
}

/**
 * 旧标签的去向，优先级：人工表 LEGACY_TAGS → git 里观察到的替换链（HRT → GAHT）
 * → 大小写不同的现行标签（astro → Astro）→ 标签总览。
 */
function resolveTag(legacy: string, tagSet: ReadonlySet<string>, history: UrlHistory): string {
  if (hasOwn(LEGACY_TAGS, legacy)) {
    const manual = own(LEGACY_TAGS, legacy);
    return manual && tagSet.has(manual) ? tagPath(manual) : TAGS_PATH;
  }
  let current = legacy;
  for (let step = 0; step < 10; step++) {
    const next = own(history.tagRenames, current);
    if (!next || next === current) break;
    current = next;
    if (tagSet.has(current)) return tagPath(current);
  }
  const caseMatch = [...tagSet].find((tag) => tag.toLowerCase() === legacy.toLowerCase());
  return caseMatch ? tagPath(caseMatch) : TAGS_PATH;
}

/**
 * 已不存在的文章的去向，优先级：人工表 RENAMED_POSTS → git 改名链 → 同标题的现存文章。
 * 返回现行 slug；删掉且没有替代文章时返回 null（不生成重定向，返回真实 404）。
 */
function resolvePost(
  stem: string,
  posts: RedirectInput['posts'],
  history: UrlHistory
): string | null {
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const byStem = new Map(posts.map((p) => [p.fileStem, p]));
  const manual = own(RENAMED_POSTS, stem);
  if (manual && bySlug.has(manual)) return manual;

  let current = stem;
  for (let step = 0; step < 20; step++) {
    const next = own(history.renames, current);
    if (!next || next === current) break;
    current = next;
    const hit = byStem.get(current);
    if (hit) return hit.slug;
  }

  const title = own(history.posts, stem);
  if (title && title !== stem) {
    const sameTitle = posts.find((p) => p.title === title);
    if (sameTitle) return sameTitle.slug;
  }
  return null;
}

/**
 * 一个曾经公开过的地址键（旧文件名、旧 slug、按原大小写访问的文件名）的**全部**公开格式，
 * 一跳直达现行文章的对应格式：页面、早期 `/posts/<文件名>.md/` 路由、旧版 `.md` 原文、
 * 新版 `index.html.md` 原文、打印视图与 PDF。键与现行 slug 相同时，现存的页面 / 原文本身不重定向。
 */
function pushPostFormats(rules: RedirectRule[], key: string, slug: string): void {
  const isCurrent = key === slug;
  if (!isCurrent) {
    push(rules, `/posts/${key}`, postPath(slug));
    push(rules, `/posts/${key}/index.html.md`, postMarkdownPath(slug), true);
    push(rules, `/print/${key}.pdf`, postPdfPath(slug), true);
  }
  push(rules, `/posts/${key}.md/`, postPath(slug), true);
  push(rules, `/posts/${key}.md`, postMarkdownPath(slug), true);
  // 打印视图的 HTML 在生成 PDF 后被删除，旧链接指回文章
  push(rules, `/print/${key}`, postPath(slug));
}

/**
 * 历史上发布过、现在不存在、也找不到去向的文章（文件名列表）：它们的旧地址会返回 404。
 * 真正删除时这是预期结果；但「文件名与标题同时修改」而构建机又拿不到改名提交（浅克隆）时也会落到这里，
 * 所以由构建日志列出来提醒，而不是静默当作删除。
 */
export function unresolvedPosts(
  posts: RedirectInput['posts'],
  history: UrlHistory = EMPTY_HISTORY
): string[] {
  const currentStems = new Set(posts.map((p) => p.fileStem));
  return Object.keys(history.posts)
    .filter((stem) => !currentStems.has(stem) && resolvePost(stem, posts, history) === null)
    .sort();
}

export function buildRedirects({
  posts,
  tags,
  authors,
  authorAliases,
  history = EMPTY_HISTORY,
}: RedirectInput): RedirectRule[] {
  const rules: RedirectRule[] = [];
  const tagSet = new Set(tags);
  const slugSet = new Set(posts.map((p) => p.slug));

  // 1. 旧标签：人工表 + 历史上出现过、现在已不存在的全部标签
  const legacyTags = new Set([...Object.keys(LEGACY_TAGS), ...history.tags]);
  for (const legacy of legacyTags) {
    if (tagSet.has(legacy)) continue; // 标签仍在使用：页面真实存在，不能重定向
    const target = resolveTag(legacy, tagSet, history);
    push(rules, `/tags/${legacy}`, target);
    // 单数写法也直达最终页面：否则会先经第 8 步的通配规则跳到 /tags/<旧标签>/ 再跳一次
    push(rules, `/tag/${legacy}`, target);
  }

  // 2. 标签的小写别名（/tags/gaht/ → /tags/GAHT/）：Cloudflare 的路径匹配区分大小写
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower !== tag && !tagSet.has(lower) && !legacyTags.has(lower)) {
      push(rules, `/tags/${lower}`, tagPath(tag));
      push(rules, `/tag/${lower}`, tagPath(tag));
    }
  }

  // 3. 已不存在的文章（改名 / 删除）：它们用过的每一个地址键（原文件名、github-slugger 结果、历史 slug）
  //    的全部公开格式都直达现行文章
  const currentStems = new Set(posts.map((p) => p.fileStem));
  // 地址归属索引：历史 slug 属于哪篇文章（文件名），已退休的前一篇记为 retired:<键>。
  // 由文件名推出的地址键（原文件名、github-slugger 结果）只是补充别名：已经归属别的文章时不能抢——
  // 否则「删除 / 改名后复用文件名」的新文章会把旧文章的默认地址抢过去
  const owners = new Map<string, Set<string>>();
  const claim = (key: string, owner: string): void => {
    let set = owners.get(key);
    if (!set) owners.set(key, (set = new Set()));
    set.add(owner);
  };
  for (const [stem, list] of Object.entries(history.slugs ?? {})) list.forEach((key) => claim(key, stem));
  for (const [id, entry] of Object.entries(history.retired ?? {})) entry.slugs.forEach((key) => claim(key, `retired:${id}`));
  const ownedByOther = (key: string, stem: string): boolean => {
    const set = owners.get(key);
    return set !== undefined && !set.has(stem);
  };
  const stemAliases = (stem: string): string[] => [stem, slugify(stem)].filter((k) => !ownedByOther(k, stem));
  // 同一个地址先后被几篇文章用过时，归最后一次使用它的那篇（history.slugOwners）；没有记录时不限制
  const lastUsedByOther = (key: string, owner: string): boolean => {
    const last = own(history.slugOwners ?? {}, key);
    return last !== undefined && last !== owner;
  };

  const legacyStems = new Set([...Object.keys(RENAMED_POSTS), ...Object.keys(history.posts)]);
  for (const stem of legacyStems) {
    if (currentStems.has(stem)) continue; // 仍然存在：在第 4 步按现行文章处理
    const slug = resolvePost(stem, posts, history);
    // 真正删除、没有替代文章的：不重定向，让它返回真实的 404。把不相关的旧文章都 301 到首页
    // 会被 Google 视为「软 404」，反而拖累首页；404 才是「这篇文章不存在了」的正确信号
    if (!slug) continue;
    const keys = new Set([...stemAliases(stem), ...(own(history.slugs ?? {}, stem) ?? [])].filter((k) => k.length > 0));
    for (const key of keys) {
      if (slugSet.has(key) && key !== slug) continue; // 这个键现在属于另一篇现存文章，不能抢
      if (lastUsedByOther(key, stem)) continue;
      pushPostFormats(rules, key, slug);
    }
  }

  // 3b. 文件名后来被另一篇文章复用的已删除文章：它用过的 slug 只在能按标题找到替代文章时才 301，
  //     绝不能因为文件名相同就跳到现在那篇无关的文章；找不到替代就返回真实 404
  for (const [id, entry] of Object.entries(history.retired ?? {})) {
    const replacement = entry.title !== entry.stem ? posts.find((p) => p.title === entry.title) : undefined;
    if (!replacement) continue;
    for (const key of entry.slugs) {
      if (key.length === 0 || (slugSet.has(key) && key !== replacement.slug)) continue;
      if (lastUsedByOther(key, `retired:${id}`)) continue;
      pushPostFormats(rules, key, replacement.slug);
    }
  }

  // 4. 现存文章：原大小写文件名、github-slugger 结果、历史上用过的 slug 等地址键的全部公开格式
  //    （含早期 /posts/<文件名>.md/ 路由与旧版 /posts/<slug>.md 原文）
  for (const { slug, fileStem } of posts) {
    const keys = new Set(
      [slug, ...stemAliases(fileStem), ...(own(history.slugs ?? {}, fileStem) ?? [])].filter((k) => k.length > 0)
    );
    for (const key of keys) {
      if (slugSet.has(key) && key !== slug) continue;
      if (key !== slug && lastUsedByOther(key, fileStem)) continue;
      pushPostFormats(rules, key, slug);
    }
  }

  // 6b. 不再存在的作者页（旧的按署名生成的 URL、改过的 id、不再署名的作者）：
  //     能对应到登记表里现存作者的 → 该作者页；否则 → 作者总览
  if (authors) {
    const authorSet = new Set(authors);
    for (const slug of history.authors ?? []) {
      if (authorSet.has(slug)) continue;
      const id = authorAliases?.get(slug);
      push(rules, `/authors/${slug}`, id && authorSet.has(id) ? authorPath(id) : AUTHORS_PATH);
    }
  }

  // 7. 常见猜测路径
  for (const [from, to] of STATIC_ALIASES) push(rules, from, to);

  // 8. 单数形式的标签路径（/tag/<x>/ → /tags/<x>/）：只为现存标签生成显式规则（旧标签在第 1、2 步已处理）。
  //    不用 /tag/:name 通配：那会把任何不存在的 /tag/xxx/ 先 301 到同样不存在的 /tags/xxx/，形成 301 → 404。
  //    本站因此不含任何动态规则，所有规则都能在构建时逐条校验目标存在。
  for (const tag of tags) push(rules, `/tag/${tag}`, tagPath(tag));

  // 现存文章自己的页面、原文与 PDF 地址永远优先：补充别名（例如 slug 为 guide 的旧 `.md/` 路由
  // /posts/guide.md/）撞上另一篇 slug 为 guide.md 的现存页面时跳过，而不是生成一条被遮蔽、让构建失败的规则
  const reserved = new Set(
    posts.flatMap(({ slug }) => [
      ...variants(postPath(slug)),
      ...variants(postMarkdownPath(slug), true),
      ...variants(postPdfPath(slug), true),
    ])
  );
  return rules.filter((rule) => rule.from !== rule.to && !reserved.has(rule.from));
}

export function serializeRedirects(rules: readonly RedirectRule[]): string {
  const header = [
    '# 由 src/integrations/seo-files.ts 在构建时生成，规则来源见 src/lib/seo/redirects.ts。',
    '# 请勿手改 dist/_redirects；修改 redirects.ts 后重新构建。',
    '',
  ];
  return `${[...header, ...rules.map((r) => `${r.from} ${r.to} ${r.status}`)].join('\n')}\n`;
}

/** Cloudflare Pages `_redirects` 的上限：静态规则 2000 条、动态（含 : 或 *）规则 100 条。 */
export const MAX_STATIC_REDIRECTS = 2000;

/** Cloudflare Pages：_redirects 每条声明最多 1000 个字符，超出的规则会被忽略。 */
export const MAX_REDIRECT_LINE = 1000;

/**
 * 拆出超长的规则（很长的中文标签编码后可能超过 1000 字符）。这类规则不能写进 _redirects：
 * 调用方跳过它们并告警，需要保留的历史地址改用 Cloudflare Bulk Redirects（见 docs/SEO.md）。
 */
export function splitOverlong(rules: readonly RedirectRule[]): { kept: RedirectRule[]; overlong: RedirectRule[] } {
  const kept: RedirectRule[] = [];
  const overlong: RedirectRule[] = [];
  for (const rule of rules) {
    (`${rule.from} ${rule.to} ${rule.status}`.length > MAX_REDIRECT_LINE ? overlong : kept).push(rule);
  }
  return { kept, overlong };
}
export const MAX_DYNAMIC_REDIRECTS = 100;

export function countRedirects(rules: readonly RedirectRule[]): { static: number; dynamic: number } {
  const dynamic = rules.filter((r) => r.from.includes(':') || r.from.includes('*')).length;
  return { static: rules.length - dynamic, dynamic };
}

/**
 * 构建期的「这个站内路径存在吗」：dist 里的文件（未编码的文件路径，目录页按 index.html），
 * 加上随后由 scripts/generate-pdfs.mjs 生成、此刻还不在 dist 里的每篇文章 PDF。
 * validateRedirects 会先解码规则里的路径再调用它，所以这里一律用未编码的写法。
 */
export function buildExists(files: ReadonlySet<string>, slugs: readonly string[]): (path: string) => boolean {
  const pdfs = new Set(slugs.map((slug) => `/print/${slug}.pdf`));
  return (p) => pdfs.has(p) || files.has(p) || files.has(`${p.replace(/\/$/, '')}/index.html`);
}

export interface RedirectProblem {
  readonly rule: RedirectRule;
  readonly problem: string;
}

/**
 * 校验：来源不得是现存页面 / 文件（否则规则永远不会生效），目标必须存在，且不得形成链式跳转。
 * @param exists 判断某个站内路径（已解码）是否对应 dist 中的真实文件。
 * @param ignoreShadowPrefixes 这些前缀下的来源允许暂时被遮蔽（例如 /print/<slug>/ 在 PDF 生成前还在）。
 */
export function validateRedirects(
  rules: readonly RedirectRule[],
  exists: (path: string) => boolean,
  ignoreShadowPrefixes: readonly string[] = []
): RedirectProblem[] {
  const problems: RedirectProblem[] = [];
  const sources = new Set(rules.map((r) => r.from));
  const decode = (p: string): string => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  };

  for (const rule of rules) {
    if (rule.from.includes(':') || rule.from.includes('*')) continue; // 动态规则无法静态校验
    const from = decode(rule.from);
    const to = decode(rule.to.split('?')[0] ?? rule.to);

    if (!ignoreShadowPrefixes.some((prefix) => from.startsWith(prefix)) && exists(from)) {
      problems.push({ rule, problem: `来源 ${from} 是现存文件，规则不会生效` });
    }
    if (!exists(to)) {
      problems.push({ rule, problem: `目标 ${to} 不存在` });
    }
    if (sources.has(rule.to)) {
      problems.push({ rule, problem: `目标 ${rule.to} 本身也会被重定向（链式跳转）` });
    }
  }

  // 动态规则的链式跳转：按 Cloudflare 的顺序匹配模拟一次跳转，看落点是否还会再被重定向。
  // 探测路径 = 全部静态来源，以及把 /tags/ 换成 /tag/ 的单数写法（通配规则最容易在这里形成两跳）。
  const probes = new Set<string>();
  for (const rule of rules) {
    if (rule.from.includes(':') || rule.from.includes('*')) continue;
    probes.add(rule.from);
    if (rule.from.startsWith('/tags/')) probes.add(`/tag/${rule.from.slice('/tags/'.length)}`);
  }
  for (const probe of probes) {
    const first = matchRedirect(rules, probe);
    if (!first || first.rule.from === probe) continue; // 静态规则自身的链已在上面检查
    const second = matchRedirect(rules, first.to.split('?')[0] ?? first.to);
    if (second) {
      problems.push({
        rule: first.rule,
        problem: `${probe} 经通配规则到 ${first.to}，又被重定向到 ${second.to}（链式跳转）`,
      });
    }
  }
  return problems;
}

/**
 * 按 Cloudflare Pages 的语义找出第一条匹配 path 的规则（规则按文件顺序匹配）：
 * `:name` 匹配一个路径段，`*` 匹配其后任意字符，目标里的同名占位符 / `:splat` 会被替换。
 */
export function matchRedirect(
  rules: readonly RedirectRule[],
  path: string
): { rule: RedirectRule; to: string } | null {
  for (const rule of rules) {
    const names: string[] = [];
    const pattern = rule.from
      .split(/(:[A-Za-z]\w*|\*)/)
      .map((part) => {
        if (part === '*') {
          names.push('splat');
          return '(.*)';
        }
        if (/^:[A-Za-z]\w*$/.test(part)) {
          names.push(part.slice(1));
          return '([^/]+)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    const m = path.match(new RegExp(`^${pattern}$`));
    if (!m) continue;
    let to = rule.to;
    names.forEach((name, i) => {
      to = to.replace(name === 'splat' ? ':splat' : `:${name}`, m[i + 1] ?? '');
    });
    return { rule, to };
  }
  return null;
}
