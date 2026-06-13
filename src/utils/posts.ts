export const POSTS_PER_PAGE = 10;

/** 作者 / 编辑署名条目：name 为显示文本，link 为点击后跳转的地址。 */
export interface Person {
  name: string;
  link: string;
}

/**
 * 将作者 / 编辑列表拼接为纯文本，用于不渲染链接的场景
 * （如 meta 标签、RSS、搜索索引、Markdown 导出）。
 * 使用顿号（、）分隔，符合中文多人署名习惯。
 */
export function formatPeople(people: Person[]): string {
  return people.map((person) => person.name).join('、');
}

export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getAllTags(posts: Array<{ data: { tags: string[] } }>): string[] {
  const tagSet = new Set<string>();
  posts.forEach((post) => {
    post.data.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

export function getPostsByTag(posts: Array<{ data: { tags: string[] } }>, tag: string) {
  return posts.filter((post) => post.data.tags.includes(tag));
}
