/**
 * 以任意内容（文件名、标签、slug）为键的字典读取。
 * `constructor`、`toString`、`__proto__` 都是合法的文件名 / 标签，普通对象的 `obj[key]` 与 `key in obj`
 * 会读到原型链上的属性，所以一律只认自有属性。
 */
export function own<V>(dict: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.hasOwn(dict, key) ? dict[key] : undefined;
}

export function hasOwn(dict: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.hasOwn(dict, key);
}

/** 无原型的空字典：写入 `__proto__` 等键时也只是普通数据。 */
export function dict<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}
