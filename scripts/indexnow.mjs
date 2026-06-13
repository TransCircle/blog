#!/usr/bin/env node
/**
 * IndexNow 提交脚本 —— 让 Bing / Yandex / Seznam / Naver 等支持 IndexNow 的搜索引擎
 * 在内容更新后「尽快收录」，而不必等待其自然抓取周期。
 *
 * 它提交的是绝对 URL（https://blog.transcircle.org/...），因此在哪台机器上运行都可以，
 * 不需要「跑在生产服务器上」。三种典型用法：
 *
 *   A. 本地手动（最简单）：
 *        pnpm run build && pnpm run indexnow
 *
 *   B. 嵌入 Cloudflare Pages 构建命令（自动）：
 *        把 Pages 的「构建命令」设为：  pnpm run build && pnpm run indexnow
 *        - 仅在生产分支提交（默认 main，可用 INDEXNOW_PRODUCTION_BRANCH 覆盖）；
 *        - 在 Cloudflare 构建环境中，任何提交失败都不会让部署失败。
 *
 *   C. 干脆不用本脚本：在 Cloudflare 控制台为该域名开启 Crawler Hints，
 *      由 Cloudflare 自动通过 IndexNow 推送（详见 README）。
 *
 * 注意：Google 不支持 IndexNow，请改用 Search Console 提交 sitemap。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'blog.transcircle.org';
const KEY = 'b1ba2832c93fda19d24eb2a7b7e91ca3';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// Cloudflare Pages 构建环境：CF_PAGES=1，CF_PAGES_BRANCH=当前分支
const inCloudflare = process.env.CF_PAGES === '1';
const productionBranch = process.env.INDEXNOW_PRODUCTION_BRANCH || 'main';
const currentBranch = process.env.CF_PAGES_BRANCH || '';

// 在 CI（Cloudflare）中，任何失败都以 0 退出，避免 IndexNow 抖动阻断整次部署；
// 本地运行时则照常以非零退出码暴露问题。
function exit(code) {
  process.exit(inCloudflare ? 0 : code);
}

if (inCloudflare && currentBranch && currentBranch !== productionBranch) {
  console.log(
    `[IndexNow] 跳过提交：当前为预览分支 "${currentBranch}"，仅在生产分支 "${productionBranch}" 提交。`
  );
  process.exit(0);
}

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

function collectUrls() {
  const urls = new Set();
  let files = [];
  try {
    files = fs.readdirSync(distDir).filter((f) => /^sitemap.*\.xml$/i.test(f));
  } catch {
    return [];
  }
  for (const file of files) {
    const xml = fs.readFileSync(path.join(distDir, file), 'utf-8');
    const matches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
    for (const m of matches) {
      const url = m.replace(/<\/?loc>/g, '').trim();
      if (url.endsWith('.xml')) continue; // 跳过 sitemap-index 指向的子 sitemap
      if (url.startsWith(`https://${HOST}`)) urls.add(url);
    }
  }
  return [...urls];
}

const urlList = collectUrls();
if (urlList.length === 0) {
  console.error('[IndexNow] 未找到 URL。请先运行 `pnpm run build` 生成 dist/sitemap-*.xml。');
  exit(1);
}

console.log(`[IndexNow] 准备向 ${ENDPOINT} 提交 ${urlList.length} 个 URL：`);
for (const u of urlList) console.log(`  - ${u}`);

try {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });

  if (res.status === 200 || res.status === 202) {
    console.log(`[IndexNow] 提交成功（HTTP ${res.status}）。支持 IndexNow 的引擎将尽快抓取。`);
  } else {
    const text = await res.text().catch(() => '');
    console.error(`[IndexNow] 提交失败：HTTP ${res.status} ${text}`.trim());
    exit(1);
  }
} catch (err) {
  console.error(`[IndexNow] 提交出错：${err && err.message ? err.message : err}`);
  exit(1);
}
