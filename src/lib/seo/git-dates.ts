/**
 * 从 git 历史推导每篇文章「正文」最后一次被修改的时间，让「更新于」、sitemap lastmod、
 * BlogPosting.dateModified、Feed 的 updated 不再依赖作者记得手改 frontmatter 的 updatedDate。
 *
 * 只统计正文的实质变化：只改 frontmatter 的提交（整理标签、改分类、改作者署名）不算，
 * 提交类型为 style / refactor 等维护性改动的也不算（isContentCommit）——否则一次全站格式整理
 * 就会让所有文章同时「更新」，那是虚假的新鲜度信号。
 *
 * 规则（resolveModified）：修改时间 = max(pubDate, frontmatter updatedDate, git 正文修改时间)，
 * 其中 git 时间只有晚于 pubDate 超过 24 小时才采用（发布当天的校对不算「更新」）。
 * 拿不到 git 历史（不是仓库、浅克隆且无法补全）时退回 frontmatter，结果与以前一致。
 */
import {
  afterSpec,
  beforeSpec,
  currentStems,
  ensureFullHistory,
  git,
  readBlobs,
  readPostChanges,
} from './git';

const DAY = 24 * 60 * 60 * 1000;

/**
 * 按团队提交规范（`:emoji: type(scope): subject`，见 AGENTS.md §3.2）判断一次提交是否算「内容更新」：
 * style（排版、空格）/ refactor（格式迁移）/ chore / build / ci / test / perf 只是维护，不改变读者读到的信息，
 * 不应刷新修改日期；feat / fix / docs 与不符合规范的提交（例如 GitHub 网页上传）一律算内容更新。
 */
const MAINTENANCE_TYPES = new Set(['style', 'refactor', 'chore', 'build', 'ci', 'test', 'perf']);

export function isContentCommit(subject: string): boolean {
  const m = subject.match(/^(?::[a-z0-9_+-]+:\s*)?([a-z]+)(?:\([^)]*\))?!?:/i);
  return !(m && MAINTENANCE_TYPES.has((m[1] ?? '').toLowerCase()));
}

/** frontmatter 占的行数（含首尾 `---`）；没有 frontmatter 时为 0。 */
export function frontmatterLines(source: string): number {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return 0;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  return end === -1 ? 0 : end + 1;
}

/**
 * 去掉 frontmatter 后的正文（统一换行、去掉行尾空白），用于判断两个版本的正文是否不同。
 * 每个历史版本按它**自己**的 frontmatter 边界切分，frontmatter 变长变短都不会误判。
 */
export function bodyOf(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  return lines
    .slice(frontmatterLines(source))
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

let cache: Map<string, Date> | null = null;

/**
 * 文件名（不含 .md，保留大小写）→ 正文最后修改时间。
 * 逐次提交比较「修改前 / 修改后」两个版本的正文，改名前的提交按时间追踪文件身份，归到现在的文件名（见 currentStems）。
 * 结果按进程缓存：一次构建只调用两次 git。
 */
export function contentModifiedDates(root: string = process.cwd()): Map<string, Date> {
  if (cache) return cache;
  cache = new Map();
  try {
    if (!ensureFullHistory(root)) return cache;
    const all = readPostChanges(root);
    const stems = currentStems(all);
    const changes = all.filter((c) => (c.status === 'M' || c.status === 'R') && isContentCommit(c.subject));
    const blobs = readBlobs(
      root,
      changes.flatMap((c) => [beforeSpec(c), afterSpec(c)].filter((s): s is string => s !== null))
    );

    for (const c of changes) {
      const before = blobs.get(beforeSpec(c) ?? '');
      const after = blobs.get(afterSpec(c) ?? '');
      if (!before || !after) continue;
      if (bodyOf(before) === bodyOf(after)) continue; // 只改了 frontmatter（或只改名）
      const target = stems.get(c);
      if (!target) continue;
      const prev = cache.get(target);
      if (!prev || c.date > prev) cache.set(target, c.date);
    }
  } catch {
    /* 没有 git 或无法读取：全部退回 frontmatter */
  }
  return cache;
}

/**
 * 文件名（不含 .md）→ 文章文件首次加入仓库的时间（按时间追踪改名，归到现在的文件名）。
 * 它**不**参与 dateModified——新增不是修改。主动推送判断「新上线的 URL」另有依据（对比线上 sitemap，
 * 见 scripts/indexnow.mjs），这里只作为补充信号。
 */
export function contentAddedDates(root: string = process.cwd()): Map<string, Date> {
  const result = new Map<string, Date>();
  try {
    if (!ensureFullHistory(root)) return result;
    const all = readPostChanges(root);
    const stems = currentStems(all);
    for (const c of all) {
      if (c.status !== 'A') continue;
      const current = stems.get(c);
      if (!current) continue;
      const prev = result.get(current);
      if (!prev || c.date < prev) result.set(current, c.date);
    }
  } catch {
    /* 没有 git：推送脚本只按 sitemap 判断 */
  }
  return result;
}

/**
 * 一组源文件最近一次提交的时间（用于非文章页面的 sitemap lastmod，例如关于页）。
 * 拿不到 git 时返回 null——宁可不给 lastmod，也不用构建时间冒充。
 */
export function filesLastCommitDate(paths: readonly string[], root: string = process.cwd()): Date | null {
  try {
    if (!ensureFullHistory(root)) return null;
    const out = git(root, ['log', '-1', '--format=%cI', '--', ...paths]).trim();
    const date = out ? new Date(out) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

/** 修改时间 = max(pubDate, updatedDate, 晚于发布 24 小时以上的 git 正文修改时间)。 */
export function resolveModified(pubDate: Date, updatedDate?: Date | null, gitDate?: Date | null): Date {
  let result = pubDate;
  if (updatedDate && updatedDate > result) result = updatedDate;
  if (gitDate && gitDate.getTime() - pubDate.getTime() > DAY && gitDate > result) result = gitDate;
  return result;
}

/**
 * 一篇文章的最后修改时间（全站唯一口径：页面「更新于」、sitemap、JSON-LD、Feed、llms 都用它）。
 * @param post 内容集合条目（id 为源文件名，含 .md）。
 */
export function postModified(post: {
  readonly id: string;
  readonly data: { readonly pubDate: Date; readonly updatedDate?: Date | undefined };
}): Date {
  const stem = post.id.replace(/\.md$/i, '');
  return resolveModified(post.data.pubDate, post.data.updatedDate, contentModifiedDates().get(stem));
}

/** 两个时间是否落在不同的日历日（UTC）：用于决定是否显示「更新于」。 */
export function isLaterDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) > b.toISOString().slice(0, 10);
}
