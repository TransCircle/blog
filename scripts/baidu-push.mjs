#!/usr/bin/env node
/**
 * 百度搜索资源平台「普通收录 · API 提交」。百度不支持 IndexNow，也很少主动抓取海外托管的站点，
 * 主动推送是新文章进入百度索引最快的途径。
 *
 * 需要环境变量 BAIDU_PUSH_TOKEN（百度搜索资源平台 → 普通收录 → API 提交 中的 token）。
 * 未配置 token 时直接跳过，不影响构建。每日配额有限，所以只推送最近有变化或新出现的页面
 * （与 IndexNow 同一套规则，见 scripts/lib/push-urls.mjs；窗口 BAIDU_PUSH_WINDOW_DAYS，默认 30 天）；--all 全量推送。
 *
 * 安全提示：百度的推送接口只支持 HTTP，token 会以明文传输。配置 token 即视为接受这一风险（影响限于推送额度），
 * 怀疑泄露时到百度搜索资源平台重置 token。
 *
 * 用法：
 *   BAIDU_PUSH_TOKEN=xxx pnpm run baidu-push
 *   node scripts/baidu-push.mjs --ci            # 构建命令中使用：仅在 Cloudflare Pages 生产分支执行
 */
import { ORIGIN, collectPushUrls } from './lib/push-urls.mjs';

const SITE = ORIGIN;
const token = process.env.BAIDU_PUSH_TOKEN || '';
const args = new Set(process.argv.slice(2));
const submitAll = args.has('--all');
const ciMode = args.has('--ci');
const inCloudflare = process.env.CF_PAGES === '1';
const productionBranch = process.env.INDEXNOW_PRODUCTION_BRANCH || 'main';
const currentBranch = process.env.CF_PAGES_BRANCH || '';
const windowDays = Number(process.env.BAIDU_PUSH_WINDOW_DAYS || 30);

const exit = (code) => process.exit(inCloudflare ? 0 : code);

if (!token) {
  console.log('[Baidu] 跳过：未配置 BAIDU_PUSH_TOKEN。');
  process.exit(0);
}
if (ciMode && !inCloudflare) {
  console.log('[Baidu] 跳过：--ci 模式只在 Cloudflare Pages 构建环境中推送。');
  process.exit(0);
}
if (inCloudflare && currentBranch && currentBranch !== productionBranch) {
  console.log(`[Baidu] 跳过：预览分支 "${currentBranch}"。`);
  process.exit(0);
}

const list = await collectPushUrls({ windowDays, submitAll, log: (msg) => console.log(`[Baidu] ${msg}`) });
if (!list) {
  console.error('[Baidu] 未找到 dist/sitemap-*.xml，请先构建。');
  exit(1);
}
const urls = new Set(list);

// 百度「普通收录 API」官方只提供 HTTP 接入点（HTTPS 入口证书主机名不匹配），token 会以明文出现在请求中。
// 这是服务方的限制：配置 BAIDU_PUSH_TOKEN 即视为接受该风险；token 只用于推送 URL，泄露的影响是被消耗推送额度，
// 一旦怀疑泄露，在百度搜索资源平台重置 token 即可。不要为了改用 HTTPS 而关闭证书校验。
console.warn('[Baidu] 注意：百度推送接口只支持 HTTP，token 以明文传输（见 docs/SEO.md）。');

const endpoint = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(SITE)}&token=${encodeURIComponent(token)}`;
console.log(`[Baidu] 推送 ${urls.size} 个 URL`);

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    // 覆盖到响应体读取为止：接口迟迟不响应时不能拖住部署，超时按失败处理（Cloudflare 上照常软退出）
    signal: AbortSignal.timeout(20000),
    body: [...urls].join('\n'),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`[Baidu] 推送成功：${text}`);
  } else {
    console.error(`[Baidu] 推送失败：HTTP ${res.status} ${text}`);
    exit(1);
  }
} catch (err) {
  console.error(`[Baidu] 推送出错：${err && err.message ? err.message : err}`);
  exit(1);
}
