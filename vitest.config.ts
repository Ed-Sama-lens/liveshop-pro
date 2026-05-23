import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Tier 3.9-G2 (2026-05-23): jsdom environment setup under cold
    // cache + parallel workers can take >5s on Windows local runs,
    // causing the first "returns 401 when unauthenticated" test in
    // each sale route file to time out on full-suite runs. CI does
    // not hit this because its worker layout is different. Bumping
    // to 15s absorbs the cliff without masking real hangs (a real
    // bug still fails within ~15s instead of 5s).
    // Documented in docs/superpowers/2026-05-23-ci-docker-vitest-audit.md §2.
    testTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/components/ui/**', 'src/app/**/layout.tsx', 'src/app/**/page.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
