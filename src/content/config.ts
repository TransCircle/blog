import { defineCollection, z } from 'astro:content';
import { DEFAULT_AUTHOR_ID, authorIds, getAuthor, resolvePerson, type Person } from '../lib/authors';
import { pathSegmentProblem, toDate } from '../lib/seo/frontmatter';

/**
 * 作者 / 编辑只填作者 id（登记在 src/data/authors.json）。写法：
 *  - 单个：author: axzameyzed
 *  - 多个：editor: [axzameyzed, yangyanh5]
 *
 * 显示名、简介、外部主页一律从登记表取，保证同一个人在全站信息一致。
 * 写了未登记的 id 会在构建时报错并列出所有可用的 id。
 */
function people(fallback: string | never[]) {
  return z
    .union([z.string(), z.array(z.string())])
    .default(fallback)
    .superRefine((value, ctx) => {
      const ids = Array.isArray(value) ? value : [value];
      for (const id of ids) {
        if (!getAuthor(id.trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `未登记的作者 id「${id}」。请先在 src/data/authors.json 登记，现有 id：${authorIds().join('、')}`,
          });
        }
      }
    })
    // 显式标注返回类型，确保 transform 后字段被推断为具体类型而非 any
    .transform((value): Person[] => {
      const ids = Array.isArray(value) ? value : [value];
      return [...new Set(ids.map((id) => id.trim()))].map(resolvePerson);
    });
}

/**
 * 日期字段：与构建配置层（sitemap、301、推送）用同一个解析函数（src/lib/seo/frontmatter.ts 的 toDate）。
 * 仅日期值一律按 UTC 零点，并容忍未补零的写法（2026-06-7）——直接用 z.coerce.date() 时，
 * 未补零的字符串会按构建机本地时区解析，非 UTC 时区下页面会比 sitemap 早一天。
 */
function dateField() {
  return z.preprocess((value) => toDate(value) ?? value, z.date());
}

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: dateField(),
    updatedDate: dateField().optional(),
    author: people(DEFAULT_AUTHOR_ID),
    // 编辑：frontmatter 里没写就是没有编辑——不再自动挂上团队署名，
    // 空数组会让所有消费方（文章页、OG 卡片、结构化数据、导出）都不渲染「编辑」
    editor: people([]),
    // 审阅者（作者 id）：对内容做过专业 / 事实审阅的人（任何文章都可以写）。不写就是没有审阅，
    // 页面与结构化数据都不会声称「已审阅」
    reviewedBy: people([]),
    // 最近一次审阅 / 证据复核的日期（与正文修改日期无关：改错别字不等于重新核对了文献）
    lastReviewed: dateField().optional(),
    category: z.string().default('general'),
    // 与构建配置层（frontmatter.ts 的 toStringList）同一规则：裁剪首尾空白，空标签直接报错
    // 标签是 URL 的一段（/tags/<标签>/）：与自定义 slug 共用 pathSegmentProblem 的规则（见其注释）
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .superRefine((tag, ctx) => {
            const problem = pathSegmentProblem(tag);
            if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `标签「${tag}」${problem}` });
          })
      )
      .default([]),
    cover: z.string().optional(),
    draft: z.boolean().default(false),
    contentLicense: z.enum([
      'CC-BY-SA-4.0',
      'CC-BY-4.0',
      'CC0-1.0',
      'Proprietary',
    ]).default('CC-BY-SA-4.0'),
    // 代码协议只约束正文里的代码片段——不给默认值：没写就是「这篇文章没有代码要授权」，
    // 给零代码文章挂徽章是空转，还会让读者误以为整站源码受它约束（那归仓库根的 LICENSE 管）
    codeLicense: z
      .enum(['AGPL-3.0', 'MIT', 'Apache-2.0', 'BSD-3-Clause', 'Proprietary'])
      .optional(),
  }),
});

export const collections = {
  posts: postsCollection,
};
