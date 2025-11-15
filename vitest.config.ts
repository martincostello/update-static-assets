import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      enabled: true,
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
    reporters: ['default', 'github-actions'],
  },
});
