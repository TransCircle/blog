// 每篇文章的 OG 社交卡片端点：构建期为每个 slug 生成 /og/<slug>.png。
//
// 路由与 src/pages/posts/[...slug].astro 一一对应（同样过滤 draft、复用 post.slug），
// 因此文章页 <meta property="og:image"> 指向的 /og/<slug>.png 必然存在。
// 卡片绘制逻辑见 src/lib/og/render.ts。

import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { renderOgImage, findUncovered } from '@/lib/og/render';
import type { Person } from '@utils/posts';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  // 过滤草稿，保持与列表 / RSS / 搜索索引及文章详情页一致，避免未发布内容生成卡片
  return posts
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .map((post: CollectionEntry<'posts'>) => ({
      params: { slug: post.slug },
      props: { post },
    }));
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: CollectionEntry<'posts'> };
  const { title, description, category, tags, pubDate, updatedDate, author, editor } = post.data;
  const authors = author.map((p: Person) => p.name);
  const editors = editor.map((p: Person) => p.name);

  // 字数：中文字符 + 英文单词，与文章页 [...slug].astro 的口径保持一致
  const body = post.body || '';
  const wordCount = (body.match(/[一-龥]/g) || []).length + (body.match(/[a-zA-Z]+/g) || []).length;

  // 构建期校验：卡片要绘制的文案若有字形不在已提交字体子集中，会渲染成 □，此处告警。
  const missing = findUncovered(
    [title, description ?? '', category ?? '', ...tags, ...authors, ...editors].join('')
  );
  if (missing.length > 0) {
    console.warn(
      `[og] ${post.slug}：字体子集缺少「${missing.join('')}」，将渲染为 □；` +
        '请运行 `pnpm run og:fonts` 重新裁剪字体子集并提交。'
    );
  }

  const png = await renderOgImage({
    title,
    description,
    category,
    tags,
    pubDate,
    updatedDate,
    authors,
    editors,
    wordCount,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // 卡片内容随文章 frontmatter 变化；构建产物可长期缓存
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
