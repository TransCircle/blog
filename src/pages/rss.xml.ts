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
    title: 'Oakley Huang/羊圈Yan-Gyan 的个人博客',
    description: '记录本地化、翻译与游戏相关的笔记与作品',
    site: context.site || 'https://blog.transcircle.org',
    items: publishedPosts.map((post: CollectionEntry<'posts'>) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description || post.data.title,
      link: `/posts/${post.slug}/`,
      categories: post.data.tags,
      author: formatPeople(post.data.author),
    })) ,
    customData: `<language>zh-CN</language>
<managingEditor>team@transcircle.org</managingEditor>
<webMaster>team@transcircle.org</webMaster>
    `,
    trailingSlash: true,
  });
}
