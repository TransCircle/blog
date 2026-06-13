import { getCollection, type CollectionEntry } from 'astro:content';
import { formatPeople } from '@utils/posts';

/**
 * /search-index.json — 客户端全文搜索（Fuse.js）使用的索引。
 *
 * 构建时动态生成，始终与文章保持同步。此前该文件由 /search 页面以
 * fs.writeFileSync 写入 public/ 的方式产生，会污染源码树且容易过期；
 * 改为标准 Astro 端点后，产物只进 dist/，无需提交、不会漂移。
 */
export async function GET() {
  const posts = await getCollection('posts');
  const searchData = posts
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .sort(
      (a: CollectionEntry<'posts'>, b: CollectionEntry<'posts'>) =>
        b.data.pubDate.getTime() - a.data.pubDate.getTime()
    )
    .map((post: CollectionEntry<'posts'>) => ({
      id: post.id,
      title: post.data.title,
      description: post.data.description || '',
      content: post.body || '',
      category: post.data.category,
      tags: post.data.tags,
      author: formatPeople(post.data.author),
      pubDate: post.data.pubDate.toISOString(),
      slug: post.slug,
    }));

  return new Response(JSON.stringify(searchData), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
