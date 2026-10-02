/**
 * 作者登记表（src/data/authors.json）的读取与校验。
 *
 * 文章 frontmatter 的 author / editor 只写作者 id；显示名、简介、外部主页都从这里取，
 * 所以同一个人在所有文章、作者页、JSON-LD（sameAs）里的信息永远一致，改一处全站生效。
 *
 * 纯数据模块：页面、构建配置（astro.config.mjs / 集成）与测试都直接 import。
 */
import registry from '../data/authors.json';
import { authorSlug } from './seo/url';

export type AuthorType = 'person' | 'team';

/** 支持的外部链接类型（顺序即作者页上的展示顺序）。 */
export const LINK_KINDS = ['website', 'x', 'github', 'bluesky', 'mastodon', 'blog'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_LABELS: Readonly<Record<LinkKind, string>> = {
  website: '个人网站',
  x: 'X（Twitter）',
  github: 'GitHub',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  blog: '博客',
};

export interface Author {
  readonly id: string;
  readonly name: string;
  readonly type: AuthorType;
  readonly bio: string;
  readonly links: Readonly<Partial<Record<LinkKind, string>>>;
  /** 曾用名 / 其他写法：旧署名对应的作者页会 301 到本作者。 */
  readonly aliases: readonly string[];
}

/** 文章署名：作者条目 + 主链接（展示用，按 LINK_KINDS 顺序取第一个）。 */
export interface Person extends Author {
  readonly link?: string | undefined;
}

export const DEFAULT_AUTHOR_ID = 'transcircle-team';
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** 校验登记表，返回问题列表（空数组表示通过）。导出以便测试。 */
export function validateRegistry(data: unknown): string[] {
  const problems: string[] = [];
  const list = (data as { authors?: unknown })?.authors;
  if (!Array.isArray(list)) return ['authors.json 缺少 authors 数组'];
  const ids = new Set<string>();
  const names = new Map<string, string>();
  list.forEach((raw: unknown, i: number) => {
    const a = raw as Partial<Author>;
    const where = `authors[${i}]${a?.id ? `（${a.id}）` : ''}`;
    if (typeof a.id !== 'string' || !ID_PATTERN.test(a.id)) {
      problems.push(`${where}：id 只能用小写字母、数字、- 或 _，且以字母或数字开头`);
    } else if (ids.has(a.id)) {
      problems.push(`${where}：id 重复`);
    } else {
      ids.add(a.id);
    }
    if (typeof a.name !== 'string' || a.name.trim() === '') problems.push(`${where}：缺少 name`);
    if (a.type !== 'person' && a.type !== 'team') problems.push(`${where}：type 只能是 person 或 team`);
    if (a.bio !== undefined && typeof a.bio !== 'string') problems.push(`${where}：bio 必须是字符串`);
    for (const [kind, url] of Object.entries(a.links ?? {})) {
      if (!(LINK_KINDS as readonly string[]).includes(kind)) problems.push(`${where}：未知链接类型 ${kind}`);
      if (typeof url !== 'string' || !isHttpUrl(url)) problems.push(`${where}：链接 ${kind} 必须是 http(s) URL`);
    }
    // 按旧作者页 URL 的归一化规则（authorSlug）判重：「Alex Smith」与「Alex-Smith」会落到同一个旧 URL，
    // 必须视为冲突，否则 301 会被后登记的作者静默覆盖
    for (const n of [a.id, a.name, ...(a.aliases ?? [])]) {
      if (typeof n !== 'string') continue;
      const key = authorSlug(n);
      const owner = names.get(key);
      if (owner && owner !== a.id) problems.push(`${where}：id / 名称 / 别名「${n}」与 ${owner} 冲突（归一化后相同）`);
      else if (a.id) names.set(key, a.id);
    }
  });
  return problems;
}

const problems = validateRegistry(registry);
if (problems.length > 0) {
  throw new Error(`[authors] src/data/authors.json 有误：\n  ${problems.join('\n  ')}`);
}

export const AUTHORS: readonly Author[] = (registry.authors as Array<Partial<Author>>).map((a) => ({
  id: a.id as string,
  name: (a.name as string).trim(),
  type: a.type as AuthorType,
  bio: (a.bio ?? '').trim(),
  links: a.links ?? {},
  aliases: a.aliases ?? [],
}));

const byId = new Map(AUTHORS.map((a) => [a.id, a]));

export function getAuthor(id: string): Author | undefined {
  return byId.get(id);
}

export function authorIds(): string[] {
  return AUTHORS.map((a) => a.id);
}

/** 按 LINK_KINDS 顺序排列的全部外部链接（JSON-LD sameAs、作者页链接列表）。 */
export function authorLinks(author: Author): Array<{ kind: LinkKind; url: string }> {
  return LINK_KINDS.flatMap((kind) => {
    const url = author.links[kind];
    return url ? [{ kind, url }] : [];
  });
}

/** id → 文章署名；未登记的 id 抛错（内容集合 schema 会先给出友好的报错）。 */
export function resolvePerson(id: string): Person {
  const author = byId.get(id);
  if (!author) throw new Error(`[authors] 未登记的作者 id：${id}`);
  return { ...author, link: authorLinks(author)[0]?.url };
}

/**
 * 作者的 X（Twitter）账号，形如 `@handle`；没有登记 X 链接或无法解析时为 undefined。
 * 用于文章页的 twitter:creator。
 */
export function xHandle(author: Author): string | undefined {
  const url = author.links.x;
  if (!url) return undefined;
  try {
    const { hostname, pathname } = new URL(url);
    if (!/(^|\.)(x|twitter)\.com$/i.test(hostname)) return undefined;
    const handle = pathname.split('/').filter(Boolean)[0];
    return handle && /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `@${handle}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 名称 → 作者 id 的索引（显示名、别名、id 本身，均按作者页 slug 规则归一化）。
 * 用于把历史上按署名生成过的作者页 301 到现在的 /authors/<id>/。
 */
export function authorAliasIndex(slugify: (name: string) => string): Map<string, string> {
  const index = new Map<string, string>();
  for (const a of AUTHORS) {
    for (const name of [a.id, a.name, ...a.aliases]) index.set(slugify(name), a.id);
  }
  return index;
}
