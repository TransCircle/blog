/**
 * 构建期生成 Cloudflare Pages 的边缘配置文件：dist/_redirects 与 dist/_headers。
 *
 * 这两个文件依赖文章与标签列表（每篇文章一条 canonical Link 头、每个旧标签一条 301），
 * 放在 public/ 里手写迟早会与内容脱节，所以在 astro:build:done 时从源数据生成，
 * 并当场校验规则：来源被现存文件遮蔽、目标不存在、链式跳转，任何一项都让构建失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import {
  mergeHistory,
  readGitHistory,
  readHistoryFile,
  writeHistoryFile,
  type UrlHistory,
} from '../lib/seo/history';
import { MAX_HEADER_RULES, buildHeaderRules, serializeHeaders } from '../lib/seo/headers';
import { readPostFiles } from '../lib/seo/post-files';
import { authorAliasIndex, getAuthor } from '../lib/authors';
import { contentAddedDates } from '../lib/seo/git-dates';
import { absoluteUrl, authorSlug, postPath } from '../lib/seo/url';
import {
  MAX_DYNAMIC_REDIRECTS,
  MAX_REDIRECT_LINE,
  MAX_STATIC_REDIRECTS,
  buildExists,
  buildRedirects,
  countRedirects,
  serializeRedirects,
  splitOverlong,
  unresolvedPosts,
  validateRedirects,
} from '../lib/seo/redirects';

/** 列出目录下全部文件的站内路径（区分大小写；Windows 文件系统本身不区分，不能用 existsSync）。 */
function listFiles(root: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.add(rel);
    }
  };
  walk(root, '');
  return out;
}

/**
 * 汇总 URL 历史：提交的清单 + git 历史 + 当前文章，并在内容有变化时回写清单。
 * dev 与 build 启动时都会执行，所以新文章 / 新标签一出现就被记入清单，随文章一起提交；
 * 以后即使删掉或改名，也能自动生成 301，不依赖构建机上有完整 git 历史。
 */
function syncHistory(rootDir: string, logger: AstroIntegrationLogger): UrlHistory {
  const manifestPath = path.join(rootDir, HISTORY_FILE);
  const posts = readPostFiles(path.join(rootDir, 'src', 'content', 'posts')).filter((p) => !p.draft);
  const current: UrlHistory = {
    posts: Object.fromEntries(posts.map((p) => [p.fileStem, p.title])),
    // 当前文章的真实 slug（含 frontmatter 自定义 slug）：没有 git 历史时，改 slug 后旧地址也能 301
    slugs: Object.fromEntries(posts.map((p) => [p.fileStem, [p.slug]])),
    renames: {},
    tags: [...new Set(posts.flatMap((p) => p.tags))],
    tagRenames: {},
    // 只记录登记表里存在的 id：拼错的 id 会让构建失败，但清单同步发生在内容校验之前，不能让它留进清单
    authors: [...new Set(posts.flatMap((p) => p.people))].filter((id) => getAuthor(id) !== undefined),
  };
  const history = mergeHistory(current, readHistoryFile(manifestPath), readGitHistory(rootDir));
  // 回写清单只是「帮作者记录」，不是构建必需的：只读检出目录等写不进去的环境里只告警，
  // 本次构建照常使用上面已经合并好的历史（包含提交的清单 + git + 当前文章）生成 301
  try {
    if (writeHistoryFile(manifestPath, history)) {
      logger.info(`已更新 ${HISTORY_FILE}（记录发布过的文章与标签，请随文章一起提交）`);
    }
  } catch (error) {
    logger.warn(`无法回写 ${HISTORY_FILE}（${error instanceof Error ? error.message : String(error)}），本次构建不受影响`);
  }
  return history;
}

const HISTORY_FILE = 'src/data/url-history.json';

export function seoFiles(): AstroIntegration {
  let rootDir = process.cwd();
  let history: UrlHistory | null = null;

  return {
    name: 'transcircle-seo-files',
    hooks: {
      'astro:config:done': ({ config, logger }) => {
        rootDir = fileURLToPath(config.root);
        try {
          history = syncHistory(rootDir, logger);
        } catch (error) {
          // 历史只用于补充 301，读取失败不能阻断 dev / build
          logger.warn(`读取 URL 历史失败：${error instanceof Error ? error.message : String(error)}`);
          // 至少保留提交的清单：旧 slug、作者别名等 301 不能因为 git 或当前文章读取出错就整体丢失
          history = readHistoryFile(path.join(rootDir, HISTORY_FILE));
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const posts = readPostFiles(path.join(rootDir, 'src', 'content', 'posts')).filter((p) => !p.draft);
        const tags = [...new Set(posts.flatMap((p) => p.tags))];
        const slugs = posts.map((p) => p.slug);

        const authors = [...new Set(posts.flatMap((p) => p.people))];
        const { kept: redirects, overlong } = splitOverlong(
          buildRedirects({
            posts,
            tags,
            authors,
            authorAliases: authorAliasIndex(authorSlug),
            history: history ?? undefined,
          })
        );
        if (overlong.length > 0) {
          // 超出 Cloudflare 单条 1000 字符上限的规则写进去也会被忽略：跳过并列出，需要保留的改用 Bulk Redirects
          logger.warn(
            `以下 ${overlong.length} 条重定向超过 Cloudflare 单条 ${MAX_REDIRECT_LINE} 字符上限，已跳过（见 docs/SEO.md）：` +
              overlong.map((r) => `${decodeURI(r.from)} → ${decodeURI(r.to)}`).join('；')
          );
        }
        const orphans = unresolvedPosts(posts, history ?? undefined);
        if (orphans.length > 0) {
          // 真删除时这是预期结果；但如果其实是「改了文件名又改了标题」、构建机又拿不到改名提交（浅克隆），
          // 旧地址会变成 404——列出来，让作者确认，而不是静默当作删除
          logger.warn(
            `以下历史文章找不到去向，旧地址将返回 404：${orphans.join('、')}。` +
              `如果其实是改名，请在 src/lib/seo/redirects.ts 的 RENAMED_POSTS 补一条，或在有完整 git 历史的本地构建一次（改名会写入 ${HISTORY_FILE}）`
          );
        }
        const exists = buildExists(listFiles(distDir), slugs);

        // /print/<slug>/ 在生成 PDF 后才被删除，此时被遮蔽是预期内的
        const problems = validateRedirects(redirects, exists, ['/print/']);
        if (problems.length > 0) {
          const detail = problems.map(({ rule, problem }) => `  ${rule.from} → ${rule.to}：${problem}`).join('\n');
          throw new Error(`[seo-files] _redirects 规则有误：\n${detail}`);
        }

        // Cloudflare 超出上限的规则会被忽略：宁可构建失败，也不要让一部分旧 URL 悄悄变回 404
        const counts = countRedirects(redirects);
        if (counts.dynamic > 0) {
          // 本站的规则全部由数据生成、逐条显式列出；出现占位符 / 通配符说明某个标签或文件名的特殊字符漏了编码，
          // 动态规则会把不存在的地址也跳到真实页面（软 404）
          const dynamic = redirects.filter((r) => r.from.includes(':') || r.from.includes('*')).map((r) => r.from);
          throw new Error(`[seo-files] _redirects 出现了动态规则（应全部为字面量）：${dynamic.join('、')}`);
        }
        if (counts.static > MAX_STATIC_REDIRECTS || counts.dynamic > MAX_DYNAMIC_REDIRECTS) {
          throw new Error(
            `[seo-files] _redirects 超出 Cloudflare Pages 上限：静态 ${counts.static}/${MAX_STATIC_REDIRECTS}，` +
              `动态 ${counts.dynamic}/${MAX_DYNAMIC_REDIRECTS}。请把最早的历史规则迁到 Cloudflare Bulk Redirects（见 docs/SEO.md）`
          );
        }

        const headerRules = buildHeaderRules();
        if (headerRules.length > MAX_HEADER_RULES) {
          // 超出后 Cloudflare 会忽略多余规则，Markdown 原文的 noindex 可能失效——宁可构建失败
          throw new Error(`[seo-files] _headers 有 ${headerRules.length} 条规则，超过 Cloudflare 上限 ${MAX_HEADER_RULES}`);
        }

        fs.writeFileSync(path.join(distDir, '_redirects'), serializeRedirects(redirects));

        // 给推送脚本（IndexNow / 百度）的「文章首次上线时间」：pubDate 回填成较早日期的新文章
        // 在 sitemap 里 lastmod 很旧，只看 lastmod 会漏推。写在 .cache/（不部署）
        const added = contentAddedDates(rootDir);
        const newPosts = posts.map((p) => ({
          url: absoluteUrl(postPath(p.slug)),
          added: added.get(p.fileStem)?.toISOString() ?? null,
        }));
        fs.mkdirSync(path.join(rootDir, '.cache'), { recursive: true });
        fs.writeFileSync(path.join(rootDir, '.cache', 'seo-post-added.json'), `${JSON.stringify(newPosts, null, 2)}
`);
        fs.writeFileSync(path.join(distDir, '_headers'), serializeHeaders(headerRules));
        logger.info(`_redirects：${redirects.length} 条（静态 ${counts.static}，动态 ${counts.dynamic}）；_headers：${headerRules.length} 条`);
      },
    },
  };
}
