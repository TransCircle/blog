/** 作者 / 编辑署名：来自作者登记表 src/data/authors.json（见 src/lib/authors.ts）。 */
export type { Person } from '@/lib/authors';
import type { Person } from '@/lib/authors';

/**
 * 将作者 / 编辑列表拼接为纯文本，用于不渲染链接的场景
 * （如 meta 标签、RSS、搜索索引、Markdown 导出）。
 * 使用顿号（、）分隔，符合中文多人署名习惯。
 */
export function formatPeople(people: Person[]): string {
  return people.map((person) => person.name).join('、');
}

export function formatDate(date: Date): string {
  // 固定 UTC：frontmatter 的 pubDate/updatedDate 为「仅日期」值（按 UTC 零点解析），
  // 固定时区可避免在非 UTC 构建环境下显示差一天，并与 OG 卡片的日期口径保持一致。
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * 统计正文字数（中文字符 + 英文单词），**排除脚注**：既剥掉文末的脚注定义
 * （`[^id]: …`，多为参考文献），也剥掉正文里的引用标记（`[^id]`）。
 * 文章页、打印 / PDF、OG 卡片共用此口径，确保处处一致。
 */
export function countWords(body: string): number {
  const text = (body || '')
    // 脚注定义整行：[^id]: 参考文献…（含末尾换行）
    .replace(/^[ \t]*\[\^[^\]]+\]:.*(?:\r?\n|$)/gm, '')
    // 正文中的脚注引用标记：[^id]
    .replace(/\[\^[^\]]+\]/g, '');
  const chinese = (text.match(/[一-龥]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

export function getAllTags(posts: Array<{ data: { tags: string[] } }>): string[] {
  const tagSet = new Set<string>();
  posts.forEach((post) => {
    post.data.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

export function getPostsByTag<T extends { data: { tags: string[] } }>(posts: readonly T[], tag: string): T[] {
  return posts.filter((post) => post.data.tags.includes(tag));
}

/**
 * 文章列表的统一排序：发布时间新的在前；同一天发布的按 slug 排，保证每次构建顺序一致
 * （否则首页、Feed、llms 等产物会无谓地变动，上一篇 / 下一篇也可能前后跳）。
 */
export function byNewest(
  a: { readonly slug: string; readonly data: { readonly pubDate: Date } },
  b: { readonly slug: string; readonly data: { readonly pubDate: Date } }
): number {
  return b.data.pubDate.getTime() - a.data.pubDate.getTime() || a.slug.localeCompare(b.slug);
}
