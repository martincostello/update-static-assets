import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      enabled: true,
      include: ['src/**/*.ts'],
      reporter: ['html', 'text'],
    },
    reporters: ['default', 'github-actions'],
  },
});
