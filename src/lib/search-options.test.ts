import fs from 'node:fs';
import path from 'node:path';
import Fuse from 'fuse.js';
import { describe, expect, it } from 'vitest';
import { SEARCH_OPTIONS, type SearchItem } from './search-options';

const item = (slug: string, content: string): SearchItem => ({
  id: slug,
  title: `标题 ${slug}`,
  description: '描述',
  content,
  tags: [],
  category: '分类',
  pubDate: '2026-01-01',
  author: '作者',
  slug,
});

describe('站内搜索配置', () => {
  it('只出现在长文后半部分的词也能搜到（不按出现位置扣分）', () => {
    const filler = '这是一段与关键词无关的正文内容。'.repeat(400);
    const fuse = new Fuse([item('long', `${filler}这里提到泌乳素与 CYP3A4。`), item('other', filler)], SEARCH_OPTIONS);
    expect(fuse.search('泌乳素').map((r) => r.item.slug)).toEqual(['long']);
    expect(fuse.search('CYP3A4').map((r) => r.item.slug)).toEqual(['long']);
    expect(fuse.search('完全不存在的词组合xyz')).toEqual([]);
  });

  const indexFile = path.join(process.cwd(), 'dist', 'search-index.json');
  it.runIf(fs.existsSync(indexFile))('真实搜索索引：常用词的结果与「正文里确实出现」完全一致', () => {
    const data = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as SearchItem[];
    const fuse = new Fuse(data, SEARCH_OPTIONS);
    const contains = (d: SearchItem, word: string): boolean =>
      [d.title, d.description, d.content, ...d.tags].join(' ').toLowerCase().includes(word.toLowerCase());
    // 既不漏（正文里有的都要搜到），也不多（不相关的文章不能混进来）
    for (const word of ['泌乳素', '血栓', 'CYP3A4', 'GAHT', '螺内酯', '雌二醇', 'Astro', 'pass', '标点']) {
      const expected = data.filter((d) => contains(d, word)).map((d) => d.slug).sort();
      expect(expected.length).toBeGreaterThan(0);
      expect(fuse.search(word).map((r) => r.item.slug).sort()).toEqual(expected);
    }
  });
});
