import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 与 tsconfig.json 的 paths 保持一致，测试里才能直接导入使用别名的模块
const src = (p: string): string => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${src('')}$1` },
      { find: /^@utils\/(.*)$/, replacement: `${src('utils/')}$1` },
      { find: /^@components\/(.*)$/, replacement: `${src('components/')}$1` },
      { find: /^@layouts\/(.*)$/, replacement: `${src('layouts/')}$1` },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
