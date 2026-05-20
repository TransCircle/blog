import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts');
  const publishedPosts = posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  return rss({
    title: 'TransCircle 开发博客',
    description: '记录项目开发进度、团队报告与技术分享',
    site: context.site || 'https://blog.transcircle.org',
    items: publishedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description || post.data.title,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
      author: post.data.author,
    })),
    customData: `<language>zh-CN</language>
<managingEditor>team@transcircle.org</managingEditor>
<webMaster>team@transcircle.org</webMaster>
    `,
    trailingSlash: true,
  });
}
