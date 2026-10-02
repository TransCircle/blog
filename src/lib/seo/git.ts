/**
 * 读取文章 git 历史的公共工具：修改日期（git-dates.ts）与 URL 历史（history.ts）共用。
 *
 * 一律「按提交读取文件修改前 / 修改后的完整内容」再比较，而不是解析 diff 片段：
 * diff 只带三行上下文，长 frontmatter 列表、frontmatter 长度变化都会让片段解析出错。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { dict } from './dict';

export const POSTS_DIR = 'src/content/posts';

export function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 文件路径 → 文件名（不含 .md）；不是 .md 返回 null。 */
export const stemOf = (file: string): string | null => {
  const base = path.posix.basename(file);
  return /\.md$/i.test(base) ? base.replace(/\.md$/i, '') : null;
};

/** 当前进程里 git 历史的实际状态（补全尝试之后的结果）：无仓库 / 浅克隆（历史不完整）/ 完整。 */
let historyState: 'none' | 'shallow' | 'full' | null = null;

/**
 * 浅克隆时在 Cloudflare Pages 构建环境里补全 git 历史（每个进程只尝试一次）。
 * 本地开发不会自动 fetch，避免意外的网络请求。返回当前是否为仓库（历史可能仍不完整，见 hasCompleteHistory）。
 */
export function ensureFullHistory(root: string): boolean {
  if (historyState === null) historyState = probeHistory(root);
  return historyState !== 'none';
}

/**
 * 历史是否完整（不是浅克隆）。只有完整历史推导出的 URL 历史才是权威的，可以修正、删除清单里的记录；
 * 浅克隆（本地浅克隆、补全失败）只能补充，不能据此认定清单里的旧记录「不存在」。
 */
export function hasCompleteHistory(root: string): boolean {
  ensureFullHistory(root);
  return historyState === 'full';
}

function probeHistory(root: string): 'none' | 'shallow' | 'full' {
  try {
    git(root, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return 'none';
  }
  const isShallow = (): boolean => {
    try {
      return git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
    } catch {
      return true; // 判断不了就按不完整处理
    }
  };
  if (isShallow() && process.env.CF_PAGES === '1') {
    try {
      git(root, ['fetch', '--unshallow', '--quiet']);
    } catch {
      /* 补全失败不影响构建：下面重新检查，按「不完整」处理 */
    }
  }
  return isShallow() ? 'shallow' : 'full';
}

/** `git log --name-status` 中一次提交对一个文章文件的改动。 */
export interface FileChange {
  readonly hash: string;
  readonly date: Date;
  readonly subject: string;
  /** A 新建、M 修改、R 改名、D 删除。 */
  readonly status: 'A' | 'M' | 'R' | 'D';
  /** 修改前的路径（新建时为 null）。 */
  readonly oldPath: string | null;
  /** 修改后的路径（删除时为 null）。 */
  readonly newPath: string | null;
}

/**
 * 解析 `git log -B -M --name-status --format=commit %H %cI %s`（从新到旧）。只保留 .md 文件。导出以便测试。
 *
 * `-B` 让「同一次提交里把文章挪到新文件名、原文件名放进另一篇」也能被识别：git 输出 `C b.md a.md`
 * （a.md 的内容来自 b.md）+ `M<分数> b.md`（b.md 被整篇重写）。这种组合按「b → a 改名 + 新建 b」处理；
 * 只有 `M<分数>`、内容没有被挪到别处的，是原地大改，仍是同一篇文章。
 */
export function parseNameStatus(log: string): FileChange[] {
  const out: FileChange[] = [];
  let current: { hash: string; date: Date; subject: string } | null = null;
  let copies: Array<{ from: string; to: string }> = [];
  let rewritten = new Set<string>();
  let pending: FileChange[] = [];

  const flush = (): void => {
    if (current) {
      const moved = new Set(copies.filter((c) => rewritten.has(c.from)).map((c) => c.from));
      for (const change of pending) {
        // 内容被挪走、原文件名又被整篇重写：原文件名上的是新文章
        if (change.status === 'M' && change.newPath && moved.has(change.newPath)) {
          out.push({ ...change, status: 'A', oldPath: null });
        } else out.push(change);
      }
      for (const { from, to } of copies) {
        if (!stemOf(from) && !stemOf(to)) continue;
        out.push(
          moved.has(from)
            ? { ...current, status: 'R', oldPath: from, newPath: to }
            : { ...current, status: 'A', oldPath: null, newPath: to } // 真正的复制：新文件是另一篇
        );
      }
    }
    copies = [];
    rewritten = new Set();
    pending = [];
  };

  for (const line of log.split(/\r?\n/)) {
    const commit = line.match(/^commit (\S+) (\S+) ?(.*)$/);
    if (commit) {
      flush();
      const date = new Date(commit[2] ?? '');
      current = Number.isNaN(date.getTime()) ? null : { hash: commit[1] ?? '', date, subject: commit[3] ?? '' };
      continue;
    }
    if (!current) continue;
    const m = line.match(/^([AMD])(\d*)\t(.+)$/);
    const r = line.match(/^([RC])\d*\t(.+?)\t(.+)$/);
    if (m && m[3] && stemOf(m[3])) {
      const status = m[1] as 'A' | 'M' | 'D';
      if (status === 'M' && m[2]) rewritten.add(m[3]);
      pending.push({
        ...current,
        status,
        oldPath: status === 'A' ? null : m[3],
        newPath: status === 'D' ? null : m[3],
      });
    } else if (r && r[2] && r[3]) {
      if (r[1] === 'C') copies.push({ from: r[2], to: r[3] });
      else if (stemOf(r[2]) || stemOf(r[3])) pending.push({ ...current, status: 'R', oldPath: r[2], newPath: r[3] });
    }
  }
  flush();
  return out;
}

/**
 * 读取当前分支（HEAD）的文章目录改动记录。只看当前发布历史、不用 `--all`：文件身份按时间单线追踪，
 * 其他分支（未合并的实验、临时预览）的改名 / 删除混进来，会把正式文章的旧地址归到不存在的文件上。
 *
 * 沿第一父提交走发布主线，合并提交按「相对第一父提交」的完整差异读取：默认的 git log 不给合并提交列文件，
 * 在合并时（例如解决冲突）改的正文就漏算了修改日期。被合并分支上的提交不单独出现，它们的改动以合并提交
 * 的时间计入——也就是这些改动真正发布的时间。
 */
export function readPostChanges(root: string): FileChange[] {
  const args = [
    'log',
    '--first-parent',
    '--diff-merges=first-parent',
    '-B',
    '-M',
    '--name-status',
    '--format=commit %H %cI %s',
    '--',
    POSTS_DIR,
  ];
  return parseNameStatus(git(root, args));
}

/**
 * 文件名改名记录：旧文件名 → 新文件名（均不含 .md）。
 * changes 从新到旧：同一个旧文件名先后改过几次（a → b → a → c）时只保留**最新**一次去向，
 * 更早的映射由改名链接上（b → a → c）。
 */
export function renamesOf(changes: readonly FileChange[]): Record<string, string> {
  const renames = dict<string>();
  // 从新到旧：一个文件名**最近一次**出现在哪条改动里，决定它的旧地址该去哪。改名之后这个名字
  // 又被另一篇文章用过（新建、修改、删除）的话，它最近的生命周期不是那次改名，旧改名关系不再适用
  const seen = new Set<string>();
  for (const c of changes) {
    const from = c.oldPath ? stemOf(c.oldPath) : null;
    const to = c.newPath ? stemOf(c.newPath) : null;
    if (c.status === 'R' && from && to && from !== to && !seen.has(from)) renames[from] = to;
    if (from) seen.add(from);
    if (to) seen.add(to);
  }
  return renames;
}

/**
 * 每条改动里的文件**现在**叫什么（不含 .md）：按提交时间从新到旧追踪文件身份。
 * 不能把改名压成一张全局表再沿链跳——a → b → a 这样改回原名时会成环，
 * 在 b 期间的修改就被归到已经不存在的 b。changes 必须从新到旧（git log 默认顺序）。
 * 某个名字「出现」（A，或作为改名的新名字）之前，同名的是另一篇文件（例如删除后同名重新添加）：
 * 那段更早的历史不归给任何现存文章，Map 里不出现这些改动。
 */
export function currentStems(changes: readonly FileChange[]): Map<FileChange, string> {
  const result = new Map<FileChange, string>();
  // 当时的文件名 → 现在的文件名；null 表示「这个名字更早时指的是另一篇（现已不存在的）文件」；
  // 没有记录即「名字没变过」
  const identity = new Map<string, string | null>();
  const now = (stem: string): string | null => (identity.has(stem) ? (identity.get(stem) ?? null) : stem);
  // 同一次提交里的改动要一起处理：先按提交后的状态求出每条改动的身份，再统一更新映射。
  // 逐条更新的话，同一提交里的「b → a 改名」与「新建 b」会互相污染
  for (let i = 0; i < changes.length; ) {
    let j = i;
    while (j < changes.length && changes[j]?.hash === changes[i]?.hash) j++;
    const batch = changes.slice(i, j);
    const renamed: Array<[string, string | null]> = [];
    const born: string[] = [];
    for (const c of batch) {
      const before = c.oldPath ? stemOf(c.oldPath) : null;
      const after = c.newPath ? stemOf(c.newPath) : null;
      const subject = after ?? before;
      const current = subject ? now(subject) : null;
      if (current) result.set(c, current);
      if (c.status === 'R' && before && after && before !== after) {
        born.push(after); // 这次改名之前，after 这个名字指的不是这篇文章
        renamed.push([before, current]);
      } else if (c.status === 'A' && after) {
        born.push(after); // 添加之前同名的是另一篇（已删除的）文件
      }
    }
    for (const name of born) identity.set(name, null);
    for (const [before, current] of renamed) identity.set(before, current);
    i = j;
  }
  return result;
}

/** 一次提交修改前 / 后的对象规格（`<提交>^:<路径>` / `<提交>:<路径>`）。 */
export const beforeSpec = (c: FileChange): string | null => (c.oldPath ? `${c.hash}^:${c.oldPath}` : null);
export const afterSpec = (c: FileChange): string | null => (c.newPath ? `${c.hash}:${c.newPath}` : null);

/**
 * 用一个 `git cat-file --batch` 进程批量读取对象，返回 规格 → 内容（不存在为 null）。
 */
export function readBlobs(root: string, specs: readonly string[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const unique = [...new Set(specs)];
  if (unique.length === 0) return result;
  const out = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: `${unique.join('\n')}\n`,
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
  });
  let offset = 0;
  for (const spec of unique) {
    const nl = out.indexOf(0x0a, offset);
    if (nl === -1) break;
    const header = out.subarray(offset, nl).toString('utf-8');
    offset = nl + 1;
    const m = header.match(/^\S+ blob (\d+)$/);
    if (!m) {
      result.set(spec, null); // missing / 非 blob
      continue;
    }
    const size = Number(m[1]);
    result.set(spec, out.subarray(offset, offset + size).toString('utf-8'));
    offset += size + 1; // 内容后跟一个换行
  }
  return result;
}
