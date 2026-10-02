import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_HEADER_RULES, buildHeaderRules, serializeHeaders } from './headers';
import {
  INDEXNOW_KEY,
  SITE_ORIGIN,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  TILE_COLOR,
} from './site';

const root = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');

describe('robots.txt', () => {
  const robots = read('public/robots.txt');
  const groups = robots
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .filter((block) => /^User-agent:/m.test(block))
    .map((block) =>
      block
        .split('\n')
        .filter((line) => /^(Allow|Disallow|Content-Signal):/.test(line))
        .join('\n')
    );

  it('每个 UA 组的规则逐字一致', () => {
    expect(groups.length).toBeGreaterThanOrEqual(4);
    expect(new Set(groups).size).toBe(1);
  });

  it('不 Disallow 任何页面（noindex 由 X-Robots-Tag 承担）', () => {
    expect(robots).not.toMatch(/^Disallow:\s*\S/m);
  });

  it('声明 Content-Signal 与 Sitemap', () => {
    expect(robots).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m);
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap-index.xml`);
  });

  it('点名主要搜索引擎与 AI 爬虫', () => {
    for (const ua of ['Googlebot', 'Bingbot', 'Baiduspider', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      expect(robots).toContain(`User-agent: ${ua}\n`);
    }
  });
});

describe('其他静态文件', () => {
  it('IndexNow key 文件、脚本与 site.ts 一致', () => {
    expect(read(`public/${INDEXNOW_KEY}.txt`).trim()).toBe(INDEXNOW_KEY);
    expect(read('scripts/indexnow.mjs')).toContain(`const KEY = '${INDEXNOW_KEY}'`);
  });

  it('security.txt 有联系方式、未过期、canonical 指向本域', () => {
    const txt = read('public/.well-known/security.txt');
    expect(txt).toMatch(/^Contact: /m);
    const expires = txt.match(/^Expires: (.+)$/m)?.[1];
    expect(expires).toBeDefined();
    expect(new Date(expires ?? '').getTime()).toBeGreaterThan(Date.now());
    expect(txt).toContain(`Canonical: ${SITE_ORIGIN}/.well-known/security.txt`);
  });

  it('manifest 与 browserconfig 的颜色取自 site.ts', () => {
    const manifest = JSON.parse(read('public/site.webmanifest')) as {
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; purpose: string }>;
    };
    expect(manifest.theme_color).toBe(THEME_COLOR_LIGHT);
    expect(manifest.background_color).toBe(THEME_COLOR_LIGHT);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect(fs.existsSync(path.join(root, 'public', icon.src))).toBe(true);
    expect(read('public/browserconfig.xml')).toContain(`<TileColor>${TILE_COLOR}</TileColor>`);
  });

  it('theme-color 与 theme.css 的 --bg 一致', () => {
    const css = read('src/styles/theme.css');
    expect(css.toLowerCase()).toContain(THEME_COLOR_LIGHT);
    expect(css.toLowerCase()).toContain(THEME_COLOR_DARK);
  });

  it('Layout 引用的图标都存在', () => {
    const layout = read('src/layouts/Layout.astro');
    for (const m of layout.matchAll(/href="(\/[^"]+\.(?:png|ico|svg))"/g)) {
      expect(fs.existsSync(path.join(root, 'public', m[1] ?? '')), m[1]).toBe(true);
    }
  });

  it('humans.txt 与 ai.txt 存在并声明协议', () => {
    expect(read('public/humans.txt')).toContain('CC BY-SA 4.0');
    expect(read('public/ai.txt')).toContain('CC BY-SA 4.0');
  });
});

describe('_headers', () => {
  const rules = buildHeaderRules();
  const text = serializeHeaders(rules);

  it('全部是通配 / 占位符规则，数量固定且远低于 Cloudflare 上限', () => {
    expect(rules.length).toBeLessThanOrEqual(MAX_HEADER_RULES);
    // 不能出现逐篇文章的规则（否则规则数会随文章增长）
    expect(rules.some((r) => /^\/posts\/[^:*]/.test(r.path) || /^\/print\/[^*]/.test(r.path))).toBe(false);
  });

  it('Markdown 原文：一条占位符规则，noindex 且 canonical 指回文章页', () => {
    expect(text).toContain(
      '/posts/:slug/index.html.md\n  X-Robots-Tag: noindex, follow\n  Link: <https://blog.transcircle.org/posts/:slug/>; rel="canonical"'
    );
  });

  it('PDF 由 /print/* 统一 noindex', () => {
    expect(text).toMatch(/\/print\/\*\n {2}X-Robots-Tag: noindex, follow/);
  });

  it('搜索页 noindex、pages.dev 预览域 noindex', () => {
    expect(text).toMatch(/\/search\/\n {2}X-Robots-Tag: noindex/);
    expect(text).toMatch(/https:\/\/:project\.pages\.dev\/\*\n {2}X-Robots-Tag: noindex/);
  });

  it('全站安全头只出现一次', () => {
    expect(text.match(/^\/\*$/gm)).toHaveLength(1);
  });
});
