import rss from '@astrojs/rss';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { APIContext } from 'astro';
import { formatPeople } from '@utils/posts';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts');
  const publishedPosts = posts
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .sort((a: CollectionEntry<'posts'>, b: CollectionEntry<'posts'>) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  return rss({
    title: '跨环博客 TransCircle Blog',
    description: '记录项目进展、社群知识与跨性别议题',
    site: context.site || 'https://blog.transcircle.org',
    items: publishedPosts.map((post: CollectionEntry<'posts'>) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description || post.data.title,
      link: `/posts/${post.slug}/`,
      categories: post.data.tags,
      author: formatPeople(post.data.author),
    })),
    customData: `<language>zh-CN</language>
<managingEditor>team@transcircle.org</managingEditor>
<webMaster>team@transcircle.org</webMaster>
    `,
    trailingSlash: true,
  });
}
