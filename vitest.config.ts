import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `.kilo/worktrees/*` holds editor-managed git worktrees with a full copy of
    // the project; without this their tests would be discovered a second time.
    exclude: [...configDefaults.exclude, '**/.kilo/**'],
  },
})
