#!/usr/bin/env node
/**
 * 部署后的线上冒烟检查：对正式域名发真实请求，确认 Cloudflare 实际应用了 _redirects / _headers，
 * 而不只是构建产物「看起来正确」（check-seo.mjs 只能检查 dist/，证明不了线上行为）。
 *
 *   pnpm smoke:live                                   # 检查 https://blog.transcircle.org
 *   pnpm smoke:live -- https://<预览>.pages.dev       # 检查某个部署（同时验证预览域 noindex）
 *
 * 每次上线后跑一次；也可以放进定时任务定期复查。任一项不符合即以退出码 1 结束。
 */
const PRODUCTION = 'https://blog.transcircle.org';
const base = (process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) ?? PRODUCTION).replace(/\/$/, '');
const isPreview = /\.pages\.dev$/i.test(new URL(base).hostname);

/**
 * @typedef {{
 *   path: string,
 *   status: number | number[],
 *   location?: string,
 *   headers?: Record<string, RegExp>,
 *   body?: RegExp,
 *   notHeaders?: Record<string, RegExp>,
 *   notBody?: RegExp,
 *   indexable?: boolean,
 *   note: string,
 * }} Check
 */

/** @type {Check[]} */
const checks = [
  { path: '/', status: 200, body: /<link rel="canonical" href="https:\/\/blog\.transcircle\.org\/">/, note: '首页 200，canonical 指向正式域名' },
  // 反向断言：正式页面必须允许收录。边缘配置（Cloudflare 规则、托管 robots.txt 等）若意外加上 noindex / Disallow，
  // 构建门禁看不到，只有这里能发现——这正是 GSC「未编入索引」问题最主要的复发路径
  {
    path: '/',
    status: 200,
    indexable: true,
    notHeaders: { 'x-robots-tag': /noindex|none/i },
    notBody: /<meta name="robots" content="[^"]*noindex/i,
    note: '首页可收录（无 noindex 响应头 / meta）',
  },
  {
    path: '/posts/hrt-hormone-blood-test-guide/',
    status: 200,
    indexable: true,
    notHeaders: { 'x-robots-tag': /noindex|none/i },
    notBody: /<meta name="robots" content="[^"]*noindex/i,
    note: '代表性文章可收录（无 noindex 响应头 / meta）',
  },
  { path: '/tags', status: [301, 308], location: '/tags/', note: '无尾斜杠页面跳到带斜杠版本' },
  { path: '/tags/HRT/', status: 301, location: '/tags/GAHT/', note: '旧标签 301 到现行标签' },
  { path: '/tag/astro/', status: 301, location: '/tags/Astro/', note: '单数写法旧标签一跳直达' },
  { path: `/tags/${encodeURIComponent('历史记载')}/`, status: 301, location: `/tags/${encodeURIComponent('争议')}/`, note: '中文旧标签（编码路径）301' },
  { path: '/posts/project-kickoff.md', status: 301, location: '/posts/project-kickoff/index.html.md', note: '旧版 Markdown 原文地址 301' },
  {
    path: '/posts/project-kickoff/index.html.md',
    status: 200,
    headers: {
      'x-robots-tag': /noindex/,
      // 占位符必须被替换成真实 slug（若出现字面量 :slug，说明 _headers 占位符没生效）
      link: /<https:\/\/blog\.transcircle\.org\/posts\/project-kickoff\/>; rel="canonical"/,
      'content-type': /text\/markdown/,
    },
    note: 'Markdown 原文 noindex + canonical（占位符已替换）',
  },
  { path: '/print/project-kickoff.pdf', status: 200, headers: { 'x-robots-tag': /noindex/, 'content-type': /pdf/ }, note: 'PDF 存在且 noindex' },
  { path: '/search/', status: 200, headers: { 'x-robots-tag': /noindex/ }, note: '搜索页可抓取但 noindex' },
  { path: '/__smoke-check-missing-page__/', status: 404, note: '不存在的页面返回真实 404（非软 404）' },
  { path: '/tag/__smoke-no-such-tag__/', status: 404, note: '不存在的单数标签地址返回 404（不经 301 → 404）' },
  { path: '/page/2/', status: 404, note: '不存在的分页地址返回 404（不跳首页冒充）' },
  { path: '/robots.txt', status: 200, body: /Sitemap: https:\/\/blog\.transcircle\.org\/sitemap-index\.xml/, note: 'robots.txt 声明 sitemap' },
  {
    path: '/robots.txt',
    status: 200,
    indexable: true,
    body: /^User-agent: Googlebot\r?\n[\s\S]*?^Allow: \/\r?$/m,
    notBody: /^Disallow:\s*\/\s*$/m,
    note: 'robots.txt 未整站屏蔽（无 Disallow: /，Googlebot 组 Allow: /）',
  },
  { path: '/sitemap-index.xml', status: 200, note: 'sitemap 索引可访问' },
  { path: '/llms.txt', status: 200, headers: { 'content-type': /text\/plain/ }, note: 'llms.txt 可访问' },
  { path: '/rss.xml', status: 200, headers: { 'content-type': /rss\+xml/ }, note: 'RSS 可访问' },
];

// 预览域：整站必须 noindex，避免与正式域名构成重复内容
if (isPreview) checks.push({ path: '/', status: 200, headers: { 'x-robots-tag': /noindex/ }, note: '预览域整站 noindex' });

let failed = 0;
// 预览域本来就应整站 noindex：「必须可收录」的断言只对正式域名生效
const active = checks.filter((check) => !(isPreview && check.indexable));
for (const check of active) {
  const url = `${base}${check.path}`;
  const problems = [];
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const expected = Array.isArray(check.status) ? check.status : [check.status];
    if (!expected.includes(res.status)) problems.push(`状态 ${res.status}，应为 ${expected.join(' / ')}`);
    if (check.location) {
      const location = res.headers.get('location') ?? '';
      const resolved = location ? new URL(location, url).pathname : '';
      if (resolved !== check.location) problems.push(`跳转到 ${location || '（无）'}，应为 ${check.location}`);
    }
    for (const [name, pattern] of Object.entries(check.headers ?? {})) {
      const value = res.headers.get(name) ?? '';
      if (!pattern.test(value)) problems.push(`响应头 ${name}: ${value || '（无）'} 不符合 ${pattern}`);
    }
    for (const [name, pattern] of Object.entries(check.notHeaders ?? {})) {
      const value = res.headers.get(name) ?? '';
      if (pattern.test(value)) problems.push(`响应头 ${name}: ${value} 不应匹配 ${pattern}`);
    }
    if (check.body || check.notBody) {
      const text = await res.text();
      if (check.body && !check.body.test(text)) problems.push(`正文不含 ${check.body}`);
      if (check.notBody && check.notBody.test(text)) problems.push(`正文不应含 ${check.notBody}`);
    }
  } catch (error) {
    problems.push(`请求失败：${error && error.message ? error.message : error}`);
  }
  if (problems.length > 0) {
    failed++;
    console.error(`✗ ${check.note}\n  ${url}\n  ${problems.join('\n  ')}`);
  } else {
    console.log(`✓ ${check.note}`);
  }
}

console.log(`\n${base}：${active.length - failed}/${active.length} 项通过。`);
process.exit(failed > 0 ? 1 : 0);
