import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirror the tsconfig `@/*` path alias so tests can import app/lib modules
    // that use `@/...` specifiers (previously only relative imports were testable).
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // `.kilo/worktrees/*` holds editor-managed git worktrees with a full copy of
    // the project; without this their tests would be discovered a second time.
    exclude: [...configDefaults.exclude, '**/.kilo/**'],
  },
})
