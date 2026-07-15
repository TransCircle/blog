#!/usr/bin/env node
/**
 * 构建期把每篇文章渲染成可直接下载的 PDF。
 *
 * 链路：`astro build` 先产出打印视图 `dist/print/<slug>/index.html`（见
 * src/pages/print/[...slug].astro）；本脚本再用无头 Chrome 打开它们，注入按**全文**
 * 子集化的中文字体，以 `page.pdf()` 输出 `dist/print/<slug>.pdf`。文章页文末的
 * 「下载 PDF」直接指向这些 .pdf 文件。
 *
 * 产物特性：文字型（可选中、可搜索）、链接可点、矢量高清、每页顶部 logo、白底。
 *
 * 中文字体：CF 构建环境没有中文系统字体，必须内嵌。这里**从已渲染的 HTML 收集字符**
 * （一并覆盖 callout 标签、脚注「注释」等由插件/组件生成、markdown 源里没有的文字，
 * 未来新组件生成的文字也自动纳入），据此把 Noto Sans SC 子集化后注入，既不缺字、
 * 体积又小；字体只存在于生成过程，不进仓库、不进产物。
 *
 * 稳健性：沿用 indexnow.mjs 的约定——在 Cloudflare 构建（CF_PAGES=1）中，任何失败
 * 都以 0 退出，绝不阻断部署（顶多这次没有 PDF）；本地运行则以非零码暴露问题。
 *
 * 用法：
 *   node scripts/generate-pdfs.mjs      # 需先 `astro build` 生成 dist/print/*
 *   （已并入 `pnpm run build`：astro build && node scripts/generate-pdfs.mjs）
 *
 * 字体来源：Noto Sans SC（SIL Open Font License 1.1），notofonts/noto-cjk。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { Resvg } from '@resvg/resvg-js';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const printDir = path.join(distDir, 'print');
const cacheDir = path.join(root, '.cache/og-fonts-src'); // 复用 og:fonts 的字体源缓存
const logoPath = path.join(root, 'src/assets/brand/transcircle-horizontal.svg');

const inCloudflare = process.env.CF_PAGES === '1';
// CF 中失败不阻断部署；本地失败照常暴露
const softExit = (code) => process.exit(inCloudflare ? 0 : code);

// 完整 Noto Sans SC 源（与 scripts/generate-og-fonts.mjs 同源，可共享 .cache 缓存）
const SRC_BASE = 'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/';
const WEIGHTS = [
  { file: 'NotoSansSC-Regular.otf', weight: 400 },
  { file: 'NotoSansSC-Bold.otf', weight: 700 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',
};

// 找出所有打印视图（dist/print/<slug>/index.html）
function findSlugs() {
  try {
    return fs
      .readdirSync(printDir, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && fs.existsSync(path.join(printDir, d.name, 'index.html')),
      )
      .map((d) => d.name);
  } catch {
    return [];
  }
}

// 从已渲染的打印视图 HTML 收集全部出现过的字符（含插件/组件生成的文字）
function collectChars(slugs) {
  // ASCII 基线：数字 / 字母 / 常见标点，避免子集漏掉这些
  let s =
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    ' ·•/／、，。：；！？（）()【】「」《》〈〉—–…“”‘’＂"\'@&%+-#｜|';
  for (const slug of slugs) {
    try {
      s += fs.readFileSync(path.join(printDir, slug, 'index.html'), 'utf-8');
    } catch {
      /* 跳过读不到的 */
    }
  }
  return Array.from(new Set(s.split(''))).join('');
}

async function ensureSource(file) {
  const cached = path.join(cacheDir, file);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  console.log(`[pdf] 本地无缓存，下载字体源 ${file} …`);
  const res = await fetch(SRC_BASE + file);
  if (!res.ok) throw new Error(`下载 ${file} 失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

// 子集化中文字体 → base64 → 可注入的 CSS（@font-face + 应用规则）
async function buildFontCss(chars) {
  let faces = '';
  for (const w of WEIGHTS) {
    const src = await ensureSource(w.file);
    const subset = await subsetFont(src, chars, { targetFormat: 'woff' });
    const b64 = subset.toString('base64');
    faces +=
      `@font-face{font-family:'TCPDF';font-style:normal;font-weight:${w.weight};` +
      `src:url(data:font/woff;base64,${b64}) format('woff')}\n`;
    console.log(`[pdf] 子集字体 ${w.file} → ${(subset.length / 1024).toFixed(0)} KB`);
  }
  // 正文统一用内嵌字体（Noto Sans SC 同时含拉丁字形）；代码块优先等宽、中文回退到内嵌字体
  const apply =
    `.print-sheet, .print-sheet *{font-family:'TCPDF',-apple-system,BlinkMacSystemFont,` +
    `'Segoe UI',Roboto,Helvetica,Arial,sans-serif}\n` +
    `.print-sheet :is(pre,code,kbd,samp){font-family:ui-monospace,SFMono-Regular,Menlo,` +
    `Consolas,'Liberation Mono','TCPDF',monospace}`;
  return faces + apply;
}

// 极简静态服务器：伺服 dist（打印视图引用 /_astro/*.css 等绝对路径，需经 HTTP 加载）
function startServer() {
  const server = http.createServer((req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let fp = path.normalize(path.join(distDir, pathname));
      if (!fp.startsWith(distDir)) {
        res.writeHead(403);
        return res.end('403');
      }
      if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
      else if (!fs.existsSync(fp) && fs.existsSync(fp + '.html')) fp += '.html';
      if (!fs.existsSync(fp)) {
        res.writeHead(404);
        return res.end('404');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const slugs = findSlugs();
  if (slugs.length === 0) {
    console.warn('[pdf] 未找到 dist/print/<slug>/index.html，请先运行 astro build。跳过。');
    process.exit(0);
  }

  // 无头浏览器缺失（如未下载 Chromium）时跳过而非报错，避免阻断构建
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.warn('[pdf] 未安装 puppeteer，跳过 PDF 生成。');
    process.exit(0);
  }

  const chars = collectChars(slugs);
  console.log(`[pdf] 待嵌入字形数：${chars.length}`);
  const fontCss = await buildFontCss(chars);

  // 页眉：左 logo + 右 blog.transcircle.org + 一条底线（与正文区分），逐页渲染。
  // 先把横幅 logo 栅格成 PNG，再嵌进一张「页眉条」SVG 一并用 resvg 栅格——域名文字
  // 也在这步用 Noto Sans SC 画出，栅格化后不再依赖运行环境有无字体（CF 同样稳）。
  const logoB64 = new Resvg(fs.readFileSync(logoPath, 'utf-8'), {
    fitTo: { mode: 'width', value: 760 },
  })
    .render()
    .asPng()
    .toString('base64');
  const notoRegularPath = path.join(cacheDir, WEIGHTS[0].file); // buildFontCss 已确保其存在
  // 紧凑页眉条（显示高约 9mm）：viewBox 越扁，页眉越薄，顶部越不臃肿、离正文越远
  const headerSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="1840" height="92" viewBox="0 0 1840 92">` +
    `<image x="0" y="4" width="256" height="77" href="data:image/png;base64,${logoB64}" ` +
    `xlink:href="data:image/png;base64,${logoB64}"/>` +
    `<text x="1840" y="52" text-anchor="end" font-family="Noto Sans SC" font-weight="400" ` +
    `font-size="31" fill="#9a858f">blog.transcircle.org</text>` +
    `<line x1="0" y1="86" x2="1840" y2="86" stroke="#e6ccd6" stroke-width="2"/>` +
    `</svg>`;
  const headerB64 = new Resvg(headerSvg, {
    fitTo: { mode: 'width', value: 1840 },
    font: {
      fontFiles: [notoRegularPath],
      defaultFontFamily: 'Noto Sans SC',
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng()
    .toString('base64');
  // 页眉图撑满内容宽（两侧 14mm 与正文对齐）；页脚留空以禁用默认页眉页脚
  // padding-top 让页眉离纸张顶部更远，避开打印机不可打印区，并与正文拉开距离
  const headerTemplate =
    `<div style="width:100%;padding:7mm 14mm 0;box-sizing:border-box;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;">` +
    `<img src="data:image/png;base64,${headerB64}" style="width:100%;display:block"></div>`;
  // 页脚居中页码「- x / N -」；数字用内嵌子集字体，避免无字体环境（CF）渲染不出
  const numFontB64 = (
    await subsetFont(fs.readFileSync(notoRegularPath), '0123456789 /-', { targetFormat: 'woff' })
  ).toString('base64');
  const footerTemplate =
    `<style>@font-face{font-family:'TCPDFNum';src:url(data:font/woff;base64,${numFontB64}) ` +
    `format('woff')}</style>` +
    `<div style="width:100%;text-align:center;font-family:'TCPDFNum',sans-serif;font-size:8.5pt;` +
    `color:#9a9a9a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">` +
    `- <span class="pageNumber"></span> / <span class="totalPages"></span> -</div>`;

  const server = await startServer();
  const port = server.address().port;

  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  } catch (e) {
    server.close();
    console.error(`[pdf] 无法启动无头浏览器：${e && e.message ? e.message : e}`);
    return softExit(1);
  }

  let ok = 0;
  for (const slug of slugs) {
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${port}/print/${slug}/`, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
      await page.addStyleTag({ content: fontCss });
      // 等内嵌字体就绪，避免首帧用回退字形
      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      });
      await page.pdf({
        path: path.join(printDir, `${slug}.pdf`),
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '26mm', right: '14mm', bottom: '16mm', left: '14mm' },
        timeout: 60000,
      });
      const kb = (fs.statSync(path.join(printDir, `${slug}.pdf`)).size / 1024).toFixed(0);
      console.log(`✓ /print/${slug}.pdf  ${kb} KB`);
      ok++;
      // 打印视图 HTML 只是 PDF 的「渲染源」，成品是 .pdf；删掉该 HTML 目录，
      // dist/print 下只保留干净的 .pdf，不把中间产物部署上线
      fs.rmSync(path.join(printDir, slug), { recursive: true, force: true });
    } catch (e) {
      console.error(`✗ ${slug}：${e && e.message ? e.message : e}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log(`[pdf] 完成：${ok}/${slugs.length} 篇`);
  if (ok === 0) throw new Error('没有任何 PDF 生成成功');
}

main().catch((e) => {
  console.error(`[pdf] 生成失败：${e && e.message ? e.message : e}`);
  softExit(1);
});
