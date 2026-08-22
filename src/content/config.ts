import { defineCollection, z } from 'astro:content';

// 仅允许 http(s) 外链；拒绝 javascript: / data: 等可执行脚本的协议，
// 防止内容可控的 frontmatter 在点击署名时触发脚本执行（XSS）。
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// 单个作者 / 编辑：name 必填；link 可省略——省略就是「这个人没有链接」，
// 渲染成纯文本，而不是替他指向主站
const personEntrySchema = z.object({
  name: z.string(),
  link: z
    .string()
    .refine(isSafeHttpUrl, { message: 'link 必须是 http(s) 协议的合法 URL' })
    .optional(),
});

// 单个条目可写成纯字符串（旧格式）或对象
const personItemSchema = z.union([z.string(), personEntrySchema]);

/**
 * 构造作者 / 编辑字段的校验器，兼容三种写法并统一规整为 { name, link? }[]：
 *  - 纯字符串：author: '羽莉'（不带链接，渲染为纯文本）
 *  - 单个对象：author: { name: '羽莉', link: 'https://...' }
 *  - 数组（对象与字符串可混用）：editor: [{ name: '翅膀', link: '...' }, 'Oakley Huang']
 *
 * link 不写就是没有链接：署名保持纯文本，不再默认指向主站——那会把「这个人有个人主页」
 * 和「这个人只是没填链接」混为一谈。
 */
function people(fallback: string | never[]) {
  return z
    .union([personItemSchema, z.array(personItemSchema)])
    .default(fallback)
    // 显式标注返回类型，确保 transform 后字段被推断为具体类型而非 any
    .transform((value): { name: string; link?: string }[] => {
      const list = Array.isArray(value) ? value : [value];
      return list.map((item) => (typeof item === 'string' ? { name: item } : item));
    });
}

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: people('TransCircle 项目组'),
    // 编辑：frontmatter 里没写就是没有编辑——不再自动挂上团队署名，
    // 空数组会让所有消费方（文章页、OG 卡片、结构化数据、导出）都不渲染「编辑」
    editor: people([]),
    category: z.string().default('general'),
    tags: z.array(z.string()).default([]),
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
