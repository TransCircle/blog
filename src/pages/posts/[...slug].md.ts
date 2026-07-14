import type { APIContext } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import { formatPeople } from '@utils/posts';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .map((post: CollectionEntry<'posts'>) => ({
      params: { slug: post.slug },
      props: { post },
    }));
}

export async function GET({ props }: APIContext) {
  const { post } = props as { post: CollectionEntry<'posts'> };

  // Read raw markdown file
  const filePath = path.join(process.cwd(), 'src', 'content', 'posts', post.id);
  let content: string;

  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return new Response('Not found', { status: 404 });
  }

  // Add metadata header
  const header = `---
# TransCircle Blog / 跨环博客
# https://blog.transcircle.org/posts/${post.slug}/
# 
# Title: ${post.data.title}
# Author: ${formatPeople(post.data.author)}${post.data.editor.length > 0 ? `\n# Editor: ${formatPeople(post.data.editor)}` : ''}
# Date: ${post.data.pubDate.toISOString().split('T')[0]}
# Category: ${post.data.category}
# Tags: ${post.data.tags.join(', ') || 'none'}
# Content License: ${post.data.contentLicense || 'CC-BY-SA-4.0'}
# Code License: ${post.data.codeLicense || 'AGPL-3.0'}
---

`;

  return new Response(header + content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
