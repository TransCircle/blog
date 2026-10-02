/**
 * 主动推送（IndexNow / 百度）要提交哪些 URL：scripts/indexnow.mjs 与 scripts/baidu-push.mjs 共用。
 *
 * 一个 URL 需要推送，满足其一即可：
 *  1. 本次构建的 sitemap 里 lastmod 在最近 N 天内（正文有更新）；
 *  2. 文章文件首次加入仓库在最近 N 天内（.cache/seo-post-added.json，由构建集成写入）；
 *  3. 本次构建的 sitemap 有、但线上 sitemap 还没有——推送发生在 Cloudflare 切换新版本之前，
 *     线上就是上一个版本，所以这一条能准确找出「新出现的 URL」：长期草稿转正式、文章改名、新标签页等，
 *     它们的 lastmod 与文件加入时间可能都很旧，前两条覆盖不到。
 * 外加固定的首页与标签总览。--all 时全量。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://blog.transcircle.org';
const ALWAYS = [`${ORIGIN}/`, `${ORIGIN}/tags/`];
const distDir = fileURLToPath(new URL('../../dist', import.meta.url));
const cacheFile = fileURLToPath(new URL('../../.cache/seo-post-added.json', import.meta.url));

/** 解析 sitemap XML 中的 <url>：loc + lastmod。 */
function parseSitemap(xml) {
  const entries = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) || []) {
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1]?.trim();
    const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1]?.trim();
    if (loc && loc.startsWith(ORIGIN)) entries.push({ loc, lastmod: lastmod ? new Date(lastmod) : null });
  }
  return entries;
}

/** 本次构建的 sitemap 条目（dist/sitemap-*.xml）。 */
export function readBuiltSitemap() {
  const entries = [];
  let files = [];
  try {
    files = fs.readdirSync(distDir).filter((f) => /^sitemap-\d+\.xml$/i.test(f));
  } catch {
    return entries;
  }
  for (const file of files) entries.push(...parseSitemap(fs.readFileSync(path.join(distDir, file), 'utf-8')));
  return entries;
}

/** 线上（上一个部署版本）的 sitemap URL 集合；取不到时返回 null（不据此推断新 URL）。 */
async function readLiveSitemap() {
  try {
    const index = await fetch(`${ORIGIN}/sitemap-index.xml`, { signal: AbortSignal.timeout(15000) });
    if (!index.ok) return null;
    const children = [...(await index.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
    const urls = new Set();
    for (const child of children) {
      const res = await fetch(child, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      for (const e of parseSitemap(await res.text())) urls.add(e.loc);
    }
    return urls;
  } catch {
    return null;
  }
}

function readRecentlyAdded(since) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      .filter((p) => p.added && new Date(p.added).getTime() >= since)
      .map((p) => p.url);
  } catch {
    return [];
  }
}

/**
 * @param {{ windowDays: number, submitAll: boolean, log: (msg: string) => void }} options
 * @returns {Promise<string[] | null>} 要推送的 URL；没有构建产物时返回 null
 */
export async function collectPushUrls({ windowDays, submitAll, log }) {
  const built = readBuiltSitemap();
  if (built.length === 0) return null;
  if (submitAll) return [...new Set([...ALWAYS, ...built.map((e) => e.loc)])];

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = built.filter((e) => e.lastmod && e.lastmod.getTime() >= cutoff).map((e) => e.loc);
  const added = readRecentlyAdded(cutoff);
  const live = await readLiveSitemap();
  const fresh = live ? built.map((e) => e.loc).filter((loc) => !live.has(loc)) : [];
  if (!live) log('线上 sitemap 读取失败：本次不按「新出现的 URL」补推，只按更新时间判断');
  else if (fresh.length > 0) log(`相对线上版本新出现 ${fresh.length} 个 URL`);

  return [...new Set([...ALWAYS, ...recent, ...added, ...fresh])];
}
