export const POSTS_PER_PAGE = 10;

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
