/**
 * 文章 frontmatter 的解析规则：构建配置层（sitemap、集成）、URL 历史、内容集合 schema 共用，
 * 保证 slug 与日期在所有地方得出完全相同的结果。纯函数模块（只依赖 yaml / github-slugger）。
 */
import { slug as githubSlug } from 'github-slugger';
import { parse as parseYaml } from 'yaml';

/** 拆出 frontmatter 与正文。frontmatter 解析失败时返回空对象（这里只做尽力读取，报错交给内容集合）。 */
export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  // 编辑器可能以 UTF-8 BOM 保存；Astro 的 frontmatter 解析接受它，这里也要接受，否则两层读出的元数据不一致
  const text = raw.startsWith('﻿') ? raw.slice(1) : raw;
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fm) return { data: {}, body: text };
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(fm[1] ?? '');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { data, body: text.slice(fm[0].length) };
}

/**
 * 文章 URL 的 slug，与 Astro（legacy content collection 的 parseEntrySlug）完全一致：
 * frontmatter 写了字符串 `slug` 就**原样**使用（Astro 不裁剪空白）；否则对文件名（不含 .md）
 * 做 github-slugger 处理（转小写、空格变连字符、去掉大部分标点，例如 `Blood Test` → `blood-test`）。
 * 非规范的自定义 slug（空串、首尾空白）由 slugProblem 在读取文章时拒绝，这里不静默修正。
 */
export function postSlug(fileStem: string, data: Record<string, unknown> = {}): string {
  return typeof data.slug === 'string' ? data.slug : githubSlug(fileStem);
}

/** frontmatter 自定义 slug 不规范时返回原因（Astro 会原样采用，生成带空白或空段的 URL）。 */
export function slugProblem(data: Record<string, unknown>): string | null {
  if (data.slug === undefined) return null;
  if (typeof data.slug !== 'string') return 'slug 必须是字符串';
  if (data.slug.length === 0) return 'slug 不能为空';
  if (data.slug !== data.slug.trim()) return 'slug 首尾不能有空白';
  return pathSegmentProblem(data.slug);
}

/**
 * 作为 URL 一段（/posts/<slug>/、/tags/<标签>/）的值不能用的写法：
 * `/` `\` 会拆成多段，`#` `?` 会被当成锚点 / 查询，`%` 与百分号编码混淆（Astro 的输出目录与链接对不上），
 * `.` `..` 会被浏览器折叠成上级目录（文章地址变成首页，产物互相覆盖）。slug 与标签共用这条规则。
 */
export function pathSegmentProblem(value: string): string | null {
  if (value === '.' || value === '..') return '不能是 . 或 ..';
  if (/[/\\#?%]/.test(value)) return '不能包含 / \\ # ? %';
  return null;
}

/**
 * 仅日期值统一按 UTC 零点解析（与页面显示、sitemap、Feed 全站同一口径），并容忍未补零的写法（2026-06-7）。
 * YAML 已解析成 Date 的值原样返回。内容集合 schema 也用它预处理日期字段，避免非 UTC 时区构建出现「差一天」。
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  // 没写时区的日期 / 日期时间一律按 UTC：Astro 的 YAML 解析器（YAML 1.1 时间戳）就是这样处理未加引号的值，
  // 而构建配置层的 yaml 库把它当字符串，交给 new Date() 会按构建机本地时区解释（本地与 CI 差 8 小时、可能跨日）
  const loose = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt ]+(\d{1,2}):(\d{2})(:\d{2}(?:\.\d+)?)?)?$/);
  const pad = (v: string | undefined): string => (v ?? '').padStart(2, '0');
  const normalized = loose
    ? `${loose[1]}-${pad(loose[2])}-${pad(loose[3])}T${loose[4] ? `${pad(loose[4])}:${loose[5]}${loose[6] ?? ':00'}` : '00:00:00'}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 解析 author / editor / reviewedBy：单个作者 id 或 id 数组（YAML 里带不带引号都行）。 */
export function toPeople(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return list
    .map((item: unknown) => (typeof item === 'string' || typeof item === 'number' ? String(item) : ''))
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** 标签等字符串列表：裁剪首尾空白、去掉空项（内容集合 schema 的 tags 用同样的 trim().min(1) 规则）。 */
export function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v: unknown) => String(v ?? '').trim()).filter((v) => v.length > 0);
}
