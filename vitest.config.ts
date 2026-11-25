import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom must be >= 31: 27-30 return null for a scoped `#id` query when
    // another element in the document shares the id, and the library looks
    // nodes up with `container.querySelector('#id')` (DndHtml5Parity covers it).
    environment: 'jsdom',
    // `vi` and the test functions are globals. Use the global `vi`: an
    // `import { vi } from 'vitest'` resolves to a separate instance here.
    globals: true,
    // Files share one module graph and one document, which is several times
    // faster than a fresh jsdom per file. In exchange, __tests__/setup.ts fails
    // any test that leaves a tree, DOM, fake timers or a stubbed global behind
    // for the next file (__tests__/helpers/leaks.ts), and CI also runs the
    // suite isolated once (`npm run test:isolated`).
    isolate: false,
    // Stub globals with `vi.stubGlobal`; they are put back after every test.
    unstubGlobals: true,
    include: ['__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/umd.ts'],
    },
  },
});
