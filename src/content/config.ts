import { defineCollection, z } from 'astro:content';

// 作者 / 编辑链接缺省时回退到项目主站
const DEFAULT_PERSON_LINK = 'https://transcircle.org';

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

// 单个作者 / 编辑：name 必填；link 可省略，省略时回退到主站
const personEntrySchema = z.object({
  name: z.string(),
  link: z
    .string()
    .refine(isSafeHttpUrl, { message: 'link 必须是 http(s) 协议的合法 URL' })
    .default(DEFAULT_PERSON_LINK),
});

// 单个条目可写成纯字符串（旧格式）或对象
const personItemSchema = z.union([z.string(), personEntrySchema]);

/**
 * 构造作者 / 编辑字段的校验器，兼容三种写法并统一规整为 { name, link }[]：
 *  - 纯字符串：author: '羽莉'（旧格式，link 回退到主站）
 *  - 单个对象：author: { name: '羽莉', link: 'https://...' }
 *  - 数组（对象与字符串可混用）：editor: [{ name: '翅膀', link: '...' }, 'Oakley Huang']
 *
 * 这样既能让历史文章的纯字符串 frontmatter 继续工作，又支持为每个署名单独配置链接。
 */
function people(defaultName: string) {
  return z
    .union([personItemSchema, z.array(personItemSchema)])
    .default(defaultName)
    // 显式标注返回类型，确保 transform 后字段被推断为具体类型而非 any
    .transform((value): { name: string; link: string }[] => {
      const list = Array.isArray(value) ? value : [value];
      return list.map((item) =>
        typeof item === 'string' ? { name: item, link: DEFAULT_PERSON_LINK } : item
      );
    });
}

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: people('TransCircle Team'),
    editor: people('TransCircle Team'),
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
    codeLicense: z.enum([
      'AGPL-3.0',
      'MIT',
      'Apache-2.0',
      'BSD-3-Clause',
      'Proprietary',
    ]).default('AGPL-3.0'),
  }),
});

export const collections = {
  posts: postsCollection,
};
