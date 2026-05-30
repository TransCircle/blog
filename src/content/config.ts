import { defineCollection, z } from 'astro:content';

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('TransCircle Team'),
    editor: z.string().default('TransCircle Team'),
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
