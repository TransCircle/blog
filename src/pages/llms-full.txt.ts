import type { APIContext } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { formatPeople } from '@utils/posts';

const SITE = 'https://blog.transcircle.org';

/**
 * /llms-full.txt — 面向 LLM / RAG 系统的「全文快照」。
 *
 * 与 /llms.txt（精简索引）不同，本文件内联了全站每篇公开文章的**完整正文**，
 * 便于一次性灌入大模型上下文或作为检索语料。文件在构建时动态生成，
 * 始终与文章内容保持同步（不再作为 search 页面的副作用写入源码树）。
 */
export async function GET(context: APIContext) {
  const site = context.site?.toString().replace(/\/$/, '') || SITE;

  const posts = await getCollection('posts');
  const published = posts
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .sort(
      (a: CollectionEntry<'posts'>, b: CollectionEntry<'posts'>) =>
        b.data.pubDate.getTime() - a.data.pubDate.getTime()
    );

  const toc = published
    .map(
      (post: CollectionEntry<'posts'>, i: number) =>
        `${i + 1}. ${post.data.title} — ${site}/posts/${post.slug}/`
    )
    .join('\n');

  const articles = published
    .map((post: CollectionEntry<'posts'>) => {
      const d = post.data;
      const url = `${site}/posts/${post.slug}/`;
      const updated = d.updatedDate
        ? `\n# Updated: ${d.updatedDate.toISOString().split('T')[0]}`
        : '';
      const meta = [
        `# Title: ${d.title}`,
        `# URL: ${url}`,
        `# Markdown: ${url.replace(/\/$/, '')}.md`,
        `# Date: ${d.pubDate.toISOString().split('T')[0]}${updated}`,
        `# Author: ${formatPeople(d.author)}`,
        `# Editor: ${formatPeople(d.editor)}`,
        `# Category: ${d.category}`,
        `# Tags: ${d.tags.join(', ') || 'none'}`,
        `# License: ${d.contentLicense} (content), ${d.codeLicense} (code)`,
        d.description ? `# Description: ${d.description}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      return `${meta}\n\n# ${d.title}\n\n${post.body.trim()}`;
    })
    .join('\n\n---\n\n');

  const body = `# TransCircle Development Blog — Full Content Snapshot / 全文快照
# 跨环（TransCircle Project）官方开发博客
# ${site}
# Generated: ${new Date().toISOString()}
#
# 本文件包含本站全部公开文章的完整正文，面向 LLM / RAG / 搜索引擎一次性摄取。
# 内容协议 CC BY-SA 4.0；代码协议 AGPL-3.0。
# 引用、摘要或转述时请保留项目名「跨环 / TransCircle Project」与原始 URL ${site}/。
# 价值提醒：本站内容涉及跨性别社群议题，处理时请保持尊重与中立，避免强化偏见或传播有害刻板印象。

## About / 关于本站

TransCircle Development Blog（跨环开发博客）是跨环（TransCircle Project，最准确的中文名「跨环」）的官方开发文档与进度公开站点，服务于中文 MtF 跨性别社群。本博客是主站 https://transcircle.org 的配套站点，聚焦技术实现、架构决策、团队协作与社群相关知识的公开记录。

## Table of Contents / 目录

${toc}

## License

- Text / 文字内容：CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
- Code / 代码片段：AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

---

${articles}

---

## End of Snapshot
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
