#!/usr/bin/env node
/**
 * IndexNow 提交脚本 —— 让 Bing / Yandex / Seznam / Naver / Yep 等支持 IndexNow 的搜索引擎
 * 在内容更新后尽快抓取，而不必等待自然抓取周期。（Google 与百度不支持 IndexNow：
 * Google 走 Search Console 的 sitemap，百度见 scripts/baidu-push.mjs。）
 *
 * 只提交「最近有变化或新出现」的 URL（规则见 scripts/lib/push-urls.mjs：最近 N 天有更新、
 * 新加入仓库、或相对线上版本新出现；N 默认 30，环境变量 INDEXNOW_WINDOW_DAYS 可改）。
 * 每次部署全量提交未变化的页面属于滥用，可能被引擎降低信任。需要全量提交时加 --all。
 *
 * 用法：
 *   pnpm run build && pnpm run indexnow        # 本地手动提交最近变化
 *   pnpm run indexnow -- --all                  # 全量提交
 *   node scripts/indexnow.mjs --ci              # 构建命令中使用：仅在 Cloudflare Pages 生产分支执行
 *
 * key 必须与 src/lib/seo/site.ts 的 INDEXNOW_KEY、public/<key>.txt 一致（有测试校验）。
 */
import { ORIGIN, collectPushUrls } from './lib/push-urls.mjs';

const HOST = 'blog.transcircle.org';
const KEY = 'b1ba2832c93fda19d24eb2a7b7e91ca3';
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = new Set(process.argv.slice(2));
const submitAll = args.has('--all');
const ciMode = args.has('--ci');

// Cloudflare Pages 构建环境：CF_PAGES=1，CF_PAGES_BRANCH=当前分支
const inCloudflare = process.env.CF_PAGES === '1';
const productionBranch = process.env.INDEXNOW_PRODUCTION_BRANCH || 'main';
const currentBranch = process.env.CF_PAGES_BRANCH || '';
const windowDays = Number(process.env.INDEXNOW_WINDOW_DAYS || 30);

// 在 CI（Cloudflare）中，任何失败都以 0 退出，避免 IndexNow 抖动阻断整次部署；
// 本地运行时则照常以非零退出码暴露问题。
function exit(code) {
  process.exit(inCloudflare ? 0 : code);
}

if (ciMode && !inCloudflare) {
  console.log('[IndexNow] 跳过：--ci 模式只在 Cloudflare Pages 构建环境中提交（本地构建不打扰搜索引擎）。');
  process.exit(0);
}

if (inCloudflare && currentBranch && currentBranch !== productionBranch) {
  console.log(`[IndexNow] 跳过：当前为预览分支 "${currentBranch}"，仅在生产分支 "${productionBranch}" 提交。`);
  process.exit(0);
}

const urlList = await collectPushUrls({ windowDays, submitAll, log: (msg) => console.log(`[IndexNow] ${msg}`) });
if (!urlList) {
  console.error('[IndexNow] 未找到 URL。请先运行 `pnpm run build` 生成 dist/sitemap-*.xml。');
  exit(1);
}

console.log(
  `[IndexNow] 向 ${ENDPOINT} 提交 ${urlList.length} 个 URL（${submitAll ? '全量' : `最近 ${windowDays} 天有变化或新出现`}）：`
);
for (const u of urlList) console.log(`  - ${u}`);

try {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
    // 覆盖到响应体读取为止：接口迟迟不响应时不能拖住部署，超时按失败处理（Cloudflare 上照常软退出）
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 200 || res.status === 202) {
    console.log(`[IndexNow] 提交成功（HTTP ${res.status}）。`);
  } else {
    const text = await res.text().catch(() => '');
    console.error(`[IndexNow] 提交失败：HTTP ${res.status} ${text}`.trim());
    exit(1);
  }
} catch (err) {
  console.error(`[IndexNow] 提交出错：${err && err.message ? err.message : err}`);
  exit(1);
}
