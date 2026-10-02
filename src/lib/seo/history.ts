/**
 * 已发布 URL 的历史：让「删文、改名、改标签」不再需要手写 301。
 *
 * 数据来自两处，取并集：
 *  1. git 历史（构建机有完整历史时）：所有出现过的文章文件与实际 slug、git 识别出的改名、
 *     每次修改前后 frontmatter 的标题与标签（用 YAML 解析完整文件，不解析 diff 片段）；
 *  2. 仓库里提交的清单 src/data/url-history.json：每次本地 dev / build 自动补写，
 *     保证在浅克隆（拿不到 git 历史）的构建环境里，旧 URL 依然有据可查。
 *
 * src/lib/seo/redirects.ts 用它为每个「曾经存在、现在不存在」的文章与标签生成 301，
 * LEGACY_TAGS / RENAMED_POSTS 只作为人工覆盖（优先级最高）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { dict, hasOwn } from './dict';
import { postSlug, splitFrontmatter, toStringList } from './frontmatter';
import {
  afterSpec,
  beforeSpec,
  currentStems,
  ensureFullHistory,
  hasCompleteHistory,
  readBlobs,
  readPostChanges,
  renamesOf,
  stemOf,
  type FileChange,
} from './git';

export interface UrlHistory {
  /** 出现过的文章：文件名（不含 .md，保留大小写）→ 最后已知标题。 */
  posts: Record<string, string>;
  /** 出现过的文章实际使用过的**全部** slug：文件名 → slug 列表（frontmatter 写过的 slug 与 github-slugger 结果）。 */
  slugs?: Record<string, string[]>;
  /** git 识别出的文件改名：旧文件名 → 新文件名（均不含 .md）。 */
  renames: Record<string, string>;
  /** 出现过的全部标签。 */
  tags: string[];
  /** 同一文件同一次修改里「删一个、加一个」的标签替换：旧 → 新。 */
  tagRenames: Record<string, string>;
  /** 出现过的作者 id（作者页 slug）。只来自清单：git 历史里不解析署名。 */
  authors?: string[];
  /**
   * 已删除、之后文件名又被另一篇文章复用的「前一段生命周期」：键为 `文件名@删除前最后一次提交`。
   * 它们的 slug 不能归给现在同名的文章（那是另一篇），只在能按标题找到替代文章时才 301。
   */
  retired?: Record<string, RetiredPost>;
  /**
   * 每个 slug **最后一次**公开使用时属于谁：文件名，或退休身份 `retired:<键>`。同一个地址先后被两篇文章用过时，
   * 旧地址归最后用它的那篇（按发布时间裁决，而不是按文件枚举顺序）。
   */
  slugOwners?: Record<string, string>;
  /**
   * 由完整 git 历史按文章身份推导（deriveHistory）：其中 slug 的归属是权威的。只在内存中使用，不写入清单。
   */
  derived?: boolean;
}

export interface RetiredPost {
  readonly stem: string;
  readonly title: string;
  readonly slugs: string[];
}

export const EMPTY_HISTORY: UrlHistory = { posts: {}, slugs: {}, renames: {}, tags: [], tagRenames: {}, authors: [] };

interface VersionInfo {
  title: string | null;
  slug: string;
  tags: string[];
  /** 草稿版本没有公开过：它的 slug、标签与标签替换都不进入 URL 历史。 */
  draft: boolean;
}

function versionInfo(stem: string, source: string): VersionInfo {
  const { data } = splitFrontmatter(source);
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
  return { title, slug: postSlug(stem, data), tags: toStringList(data.tags), draft: data.draft === true };
}

/**
 * 由改动列表（从新到旧）与对应的文件内容推导历史。纯函数，导出以便测试。
 * 标签替换：同一文件一次修改前后的标签集合「恰好删一个、加一个」时记为替换（例如 HRT → GAHT）。
 */
export function deriveHistory(
  changes: readonly FileChange[],
  blobs: ReadonlyMap<string, string | null>
): UrlHistory {
  // 键是任意文件名 / 标签（可能是 constructor、__proto__），一律用无原型字典
  const posts = dict<string>();
  const slugs = dict<Set<string>>();
  const tags = new Set<string>();
  const tagRenames = dict<string>();
  const retired = dict<{ stem: string; title: string | null; slugs: Set<string> }>();
  const slugOwners = dict<string>();
  // 文件名 → 正在收集的「前一段生命周期」键（遇到那段生命周期的 A 时关闭）
  const openLife = new Map<string, string>();
  // 每条改动属于哪篇**现存身份**；不在其中的改动属于文件名被复用之前的另一篇文章
  const identities = currentStems(changes);

  const record = (stem: string, info: VersionInfo, life: string | null, owner: string): void => {
    // 只记录公开过的版本：从未发布的草稿不产生旧地址；曾经发布、后来转为草稿的，发布期的版本照样记下
    if (info.draft) return;
    // 从新到旧：第一次见到某个 slug 时的主人，就是最后一次使用它的文章
    if (!hasOwn(slugOwners, info.slug)) slugOwners[info.slug] = life ? `retired:${life}` : owner;
    if (life) {
      const entry = (retired[life] ??= { stem, title: null, slugs: new Set() });
      entry.title ??= info.title;
      entry.slugs.add(info.slug);
      info.tags.forEach((t) => tags.add(t));
      return;
    }
    // 从新到旧遍历：第一次见到的就是最新的标题与 slug
    if (!hasOwn(posts, stem) || posts[stem] === stem) posts[stem] = info.title ?? stem;
    // 每个版本的 slug 都记下（连续改过几次 slug，每个旧地址都要 301），并记在这篇文章**现在**的文件名下：
    // 改名后原文件名又被另一篇文章复用时，按当时的文件名记会把两篇的旧地址混在一起
    (slugs[owner] ??= new Set()).add(info.slug);
    info.tags.forEach((t) => tags.add(t));
  };

  for (const c of changes) {
    const beforeStem = c.oldPath ? stemOf(c.oldPath) : null;
    const afterStem = c.newPath ? stemOf(c.newPath) : null;
    const beforeSrc = blobs.get(beforeSpec(c) ?? '') ?? null;
    const afterSrc = blobs.get(afterSpec(c) ?? '') ?? null;
    const before = beforeStem && beforeSrc !== null ? versionInfo(beforeStem, beforeSrc) : null;
    const after = afterStem && afterSrc !== null ? versionInfo(afterStem, afterSrc) : null;

    // 文件名被复用之前的那篇文章（删除后同名重新添加）：单独归档，不与现在的同名文章混在一起
    const name = afterStem ?? beforeStem;
    let life: string | null = null;
    if (name && !identities.has(c)) {
      life = openLife.get(name) ?? `${name}@${c.hash.slice(0, 12)}`;
      openLife.set(name, life);
      // 退休的那篇改过名：改名前的文件名仍是同一段生命周期，不能拆成两条退休记录
      if (c.status === 'R' && beforeStem && beforeStem !== name) openLife.set(beforeStem, life);
    }
    const owner = identities.get(c);
    if (afterStem && after) record(afterStem, after, life, owner ?? afterStem);
    if (beforeStem && before) record(beforeStem, before, life, owner ?? beforeStem);
    if (afterStem && !after && !life && !hasOwn(posts, afterStem)) posts[afterStem] = afterStem;
    // 这段生命周期从这里开始，更早的又是另一篇：关掉挂在它身上的**全部**文件名（含改名前后的），
    // 否则更早时期复用那个文件名的另一篇文章会被并进来
    if (c.status === 'A' && name) {
      const closing = openLife.get(name);
      for (const [file, key] of openLife) if (file === name || (closing && key === closing)) openLife.delete(file);
    }

    // 标签替换只看「公开 → 公开」的修改：草稿里改标签不能改变已发布标签的去向
    if (before && after && !before.draft && !after.draft) {
      const gone = before.tags.filter((t) => !after.tags.includes(t));
      const fresh = after.tags.filter((t) => !before.tags.includes(t));
      // 从新到旧遍历：同一个旧标签先后被替换几次时只保留最新一次（alpha → beta → alpha → gamma
      // 得到 alpha → gamma、beta → alpha，沿替换链两者都直达 gamma）
      if (gone.length === 1 && fresh.length === 1 && gone[0] && fresh[0] && !hasOwn(tagRenames, gone[0])) {
        tagRenames[gone[0]] = fresh[0];
      }
    }
  }

  const slugLists = dict<string[]>();
  for (const [stem, set] of Object.entries(slugs)) slugLists[stem] = [...set].sort();
  const retiredOut = dict<RetiredPost>();
  for (const [key, entry] of Object.entries(retired)) {
    retiredOut[key] = { stem: entry.stem, title: entry.title ?? entry.stem, slugs: [...entry.slugs].sort() };
  }
  return {
    posts,
    slugs: slugLists,
    renames: renamesOf(changes),
    tags: [...tags],
    tagRenames,
    authors: [],
    retired: retiredOut,
    slugOwners,
    derived: true,
  };
}

/**
 * 从 git 读取历史。没有 git、不是仓库时返回 null；浅克隆时先尝试补全（见 ensureFullHistory）。
 * 补全不了（历史不完整）时结果只作补充：不带 derived 标记，不会据此修正、删除清单里的记录。
 */
export function readGitHistory(root: string): UrlHistory | null {
  if (!ensureFullHistory(root)) return null;
  try {
    const changes = readPostChanges(root);
    const specs = changes.flatMap((c) => [beforeSpec(c), afterSpec(c)].filter((s): s is string => s !== null));
    const history = deriveHistory(changes, readBlobs(root, specs));
    return hasCompleteHistory(root) ? history : { ...history, derived: false };
  } catch {
    return null;
  }
}

export function mergeHistory(...sources: ReadonlyArray<UrlHistory | null | undefined>): UrlHistory {
  const slugs = dict<string[]>();
  const retired = dict<RetiredPost>();
  const slugOwners = dict<string>();
  const out: UrlHistory = {
    posts: dict(),
    slugs,
    renames: dict(),
    tags: [],
    tagRenames: dict(),
    authors: [],
    retired,
    slugOwners,
  };
  const tags = new Set<string>();
  const authors = new Set<string>();
  for (const src of sources) {
    if (!src) continue;
    for (const [stem, title] of Object.entries(src.posts)) {
      // 保留有意义的标题（不是文件名本身的那个）
      if (!hasOwn(out.posts, stem) || out.posts[stem] === stem) out.posts[stem] = title;
    }
    // slug 的最后归属：git 推导（derived）的结果权威、整体覆盖；其余来源（清单）只补充还没有的
    for (const [slug, owner] of Object.entries(src.slugOwners ?? {})) {
      if (src.derived || !hasOwn(slugOwners, slug)) slugOwners[slug] = owner;
    }
    for (const [stem, list] of Object.entries(src.slugs ?? {})) {
      const merged = new Set([...(hasOwn(slugs, stem) ? (slugs[stem] ?? []) : []), ...list]);
      slugs[stem] = [...merged].sort();
    }
    // 后面的来源覆盖前面的：调用方按「当前 → 清单 → git」排列，git 推导出的最新去向优先
    Object.assign(out.renames, src.renames);
    Object.assign(out.tagRenames, src.tagRenames);
    for (const [key, entry] of Object.entries(src.retired ?? {})) {
      const prev = hasOwn(retired, key) ? retired[key] : undefined;
      retired[key] = {
        stem: entry.stem,
        title: prev && prev.title !== prev.stem ? prev.title : entry.title,
        slugs: [...new Set([...(prev?.slugs ?? []), ...entry.slugs])].sort(),
      };
    }
    src.tags.forEach((t) => tags.add(t));
    (src.authors ?? []).forEach((a) => authors.add(a));
  }
  // 身份隔离也要作用在合并结果上：旧清单是在「改名 / 删除后文件名被复用」之前写下的，slug 记在当时的
  // 文件名下。git 按身份推导出的归属是权威的：某个 slug 在 git 里属于别的文章（或已退休的前一篇）时，
  // 从这个文件名下移走。拿不到 git（浅克隆）时清单本身已是上次清理过的结果，原样使用
  const owners = new Map<string, Set<string>>();
  const own = (slug: string, owner: string): void => {
    let set = owners.get(slug);
    if (!set) owners.set(slug, (set = new Set()));
    set.add(owner);
  };
  for (const src of sources) {
    if (!src?.derived) continue;
    for (const [stem, list] of Object.entries(src.slugs ?? {})) list.forEach((slug) => own(slug, stem));
    for (const [key, entry] of Object.entries(src.retired ?? {})) entry.slugs.forEach((slug) => own(slug, `retired:${key}`));
  }
  // 改名关系同理：git 认识的文件名，以 git 推导的（按生命周期判断过的）改名关系为准——旧清单里
  // 「a → b」在 a 后来被另一篇文章复用后就失效了，不能因为清单还记着就把那篇的旧地址跳到 b
  const derivedSources = sources.filter((src): src is UrlHistory => Boolean(src?.derived));
  // 退休身份完全由 git 历史推导：拿得到 git 时，清单里 git 推导不出的退休记录（例如早先误读了其他分支）丢弃
  if (derivedSources.length > 0) {
    for (const key of Object.keys(retired)) {
      if (!derivedSources.some((src) => hasOwn(src.retired ?? {}, key))) delete retired[key];
    }
  }
  // 标题也以 git 为准：旧清单记的是文件名被复用之前那篇的标题，按标题找替代文章时会找错
  for (const src of derivedSources) {
    for (const [stem, title] of Object.entries(src.posts)) if (title !== stem) out.posts[stem] = title;
  }
  for (const from of Object.keys(out.renames)) {
    const known = derivedSources.some((src) => hasOwn(src.posts, from));
    if (known && !derivedSources.some((src) => hasOwn(src.renames, from))) delete out.renames[from];
  }
  for (const stem of Object.keys(slugs)) {
    slugs[stem] = (slugs[stem] ?? []).filter((slug) => {
      const set = owners.get(slug);
      return !set || set.has(stem);
    });
  }
  out.tags = [...tags].sort();
  out.authors = [...authors].sort();
  return out;
}

/** 规范化输出（键排序），保证清单文件内容稳定、diff 干净。 */
export function serializeHistory(history: UrlHistory): string {
  const sortObj = <V,>(o: Record<string, V>): Record<string, V> =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify(
    {
      $comment:
        '由 src/integrations/seo-files.ts 在 dev / build 时自动维护：记录所有发布过的文章与标签，用于自动生成 301。请随文章一起提交，不要手改。',
      posts: sortObj(history.posts),
      slugs: sortObj(history.slugs ?? {}),
      renames: sortObj(history.renames),
      tags: [...history.tags].sort(),
      authors: [...(history.authors ?? [])].sort(),
      tagRenames: sortObj(history.tagRenames),
      retired: sortObj(history.retired ?? {}),
      slugOwners: sortObj(history.slugOwners ?? {}),
    },
    null,
    2
  )}\n`;
}

export function readHistoryFile(file: string): UrlHistory {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<UrlHistory>;
    const slugs = dict<string[]>();
    // 兼容旧格式（文件名 → 单个 slug 字符串）
    for (const [stem, v] of Object.entries((raw.slugs ?? {}) as Record<string, string | string[]>)) {
      slugs[stem] = Array.isArray(v) ? v : [v];
    }
    return {
      posts: toDict(raw.posts),
      slugs,
      renames: toDict(raw.renames),
      tags: raw.tags ?? [],
      tagRenames: toDict(raw.tagRenames),
      retired: toDict(raw.retired),
      slugOwners: toDict(raw.slugOwners),
      authors: raw.authors ?? [],
    };
  } catch {
    return { posts: {}, slugs: {}, renames: {}, tags: [], tagRenames: {}, authors: [] };
  }
}

/** JSON 对象转成无原型字典（JSON.parse 的 `__proto__` 键是自有属性，复制时也不能触发原型赋值）。 */
function toDict<V>(src: Record<string, V> | undefined): Record<string, V> {
  const out = dict<V>();
  for (const [k, v] of Object.entries(src ?? {})) out[k] = v;
  return out;
}

/** 内容有变化才写，避免无意义的文件改动。返回是否写入。 */
export function writeHistoryFile(file: string, history: UrlHistory): boolean {
  const next = serializeHistory(history);
  let prev = '';
  try {
    prev = fs.readFileSync(file, 'utf-8');
  } catch {
    /* 首次生成 */
  }
  if (prev === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}
