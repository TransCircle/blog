/**
 * 构建配置层（astro.config.mjs 的 sitemap、src/integrations/seo-files.ts）读取文章元数据用。
 *
 * 这两处运行在 Astro 内容层之外，拿不到 astro:content，只能直接读文件。frontmatter 的解析、
 * slug 与日期规则都来自 src/lib/seo/frontmatter.ts，与内容集合 / Astro 得出完全相同的结果。
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_AUTHOR_ID } from '../authors';
import { extractImages, type BodyImage } from './content';
import { postSlug, slugProblem, splitFrontmatter, toDate, toPeople, toStringList } from './frontmatter';
import { contentModifiedDates, resolveModified } from './git-dates';

export { splitFrontmatter, toDate, toPeople } from './frontmatter';

export interface PostFileMeta {
  /** 文章 URL 的 slug（与 Astro 一致：frontmatter slug 或 github-slugger(文件名)）。 */
  readonly slug: string;
  /** 源文件名去掉 .md，保留原大小写。 */
  readonly fileStem: string;
  readonly title: string;
  readonly draft: boolean;
  readonly tags: string[];
  /** 正文配图（图片 sitemap 用）。 */
  readonly images: BodyImage[];
  /** 作者、编辑与审阅者的作者 id（去重）。 */
  readonly people: string[];
  readonly pubDate: Date | null;
  readonly updatedDate: Date | null;
}

export function readPostFiles(postsDir: string): PostFileMeta[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(postsDir);
  } catch {
    return [];
  }

  const out: PostFileMeta[] = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8');
    const { data, body } = splitFrontmatter(raw);
    const fileStem = file.replace(/\.md$/i, '');
    const authors = toPeople(data.author);
    // 自定义 slug 直接成为 URL：不规范的写法（首尾空白等）在这里就拒绝，而不是在某一层被悄悄修正、
    // 与 Astro 实际生成的地址对不上
    const problem = slugProblem(data);
    if (problem) throw new Error(`[posts] ${file}：${problem}（当前为 ${JSON.stringify(data.slug)}）`);
    out.push({
      slug: postSlug(fileStem, data),
      fileStem,
      title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : fileStem,
      draft: data.draft === true,
      tags: toStringList(data.tags),
      images: extractImages(body),
      // author 缺省值与 src/content/config.ts 一致
      people: [
        ...new Set([
          ...(authors.length > 0 ? authors : [DEFAULT_AUTHOR_ID]),
          ...toPeople(data.editor),
          ...toPeople(data.reviewedBy),
        ]),
      ],
      pubDate: toDate(data.pubDate),
      updatedDate: toDate(data.updatedDate),
    });
  }
  return out;
}

/**
 * 文章最后修改时间，与页面同口径（src/lib/seo/git-dates.ts 的 resolveModified：
 * frontmatter updatedDate 与 git 正文修改时间取较晚者）。pubDate 缺失时为 null。
 */
export function postLastmod(post: PostFileMeta): Date | null {
  if (!post.pubDate) return post.updatedDate;
  return resolveModified(post.pubDate, post.updatedDate, contentModifiedDates().get(post.fileStem));
}
