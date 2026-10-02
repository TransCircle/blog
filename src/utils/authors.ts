import type { Person } from './posts';

/** 作者页数据：一个作者（个人或团队）写过 / 编辑过的文章。 */
export interface AuthorProfile<P> {
  readonly author: Person;
  readonly authored: P[];
  readonly edited: P[];
  readonly reviewed: P[];
}

interface PostLike {
  readonly data: {
    readonly author: Person[];
    readonly editor: Person[];
    readonly reviewedBy?: Person[] | undefined;
  };
}

/**
 * 从文章集合汇总全部署名（作者 + 编辑 + 审阅者），按作者 id 归并。
 * 只列出至少署名过一篇文章的作者；文章顺序保持传入顺序（调用方先按时间排序）。
 */
export function collectAuthors<P extends PostLike>(posts: readonly P[]): AuthorProfile<P>[] {
  const map = new Map<string, { author: Person; authored: P[]; edited: P[]; reviewed: P[] }>();
  const touch = (person: Person): { author: Person; authored: P[]; edited: P[]; reviewed: P[] } => {
    let entry = map.get(person.id);
    if (!entry) {
      entry = { author: person, authored: [], edited: [], reviewed: [] };
      map.set(person.id, entry);
    }
    return entry;
  };

  for (const post of posts) {
    for (const person of post.data.author) touch(person).authored.push(post);
    for (const person of post.data.editor) {
      const entry = touch(person);
      // 同一篇里既是作者又是编辑：只算作者
      if (!entry.authored.includes(post)) entry.edited.push(post);
    }
    for (const person of post.data.reviewedBy ?? []) touch(person).reviewed.push(post);
  }

  return [...map.values()].sort(
    (a, b) =>
      b.authored.length + b.edited.length + b.reviewed.length -
        (a.authored.length + a.edited.length + a.reviewed.length) ||
      a.author.name.localeCompare(b.author.name)
  );
}
