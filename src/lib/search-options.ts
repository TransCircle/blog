import type { IFuseOptions } from 'fuse.js';

/** src/pages/search-index.json.ts 输出的一条搜索记录。 */
export interface SearchItem {
  id: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  category: string;
  pubDate: string;
  author: string;
  slug: string;
}

/**
 * 站内搜索（src/pages/search.astro）的 Fuse 配置。抽出来是为了能在单元测试里用同一份配置验证。
 *
 * ignoreLocation：Fuse 默认按「匹配位置离开头多远」扣分，正文后半部分的精确匹配会被 threshold 过滤掉——
 * 搜「泌乳素」「CYP3A4」这类只出现在长文中后段的词会显示「未找到」。全文搜索不该偏向开头。
 * threshold 0.1：不再按位置扣分后，长文里到处都能凑出近似匹配，0.4 会混进不相关的文章（搜 GAHT 出现前端规范）。
 * 用真实索引对比过：0.1 时常用词既不漏也不多；中文检索本来就以精确子串为主，模糊容错收益很小。
 */
export const SEARCH_OPTIONS: IFuseOptions<SearchItem> = {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'description', weight: 2 },
    { name: 'content', weight: 1 },
    { name: 'tags', weight: 2 },
  ],
  threshold: 0.1,
  ignoreLocation: true,
  includeScore: true,
};
