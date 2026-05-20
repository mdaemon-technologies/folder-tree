import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, rmSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  // UMD build for drop-in md-tree replacement (no jQuery required)
  if (mode === 'umd') {
    return {
      build: {
        lib: {
          entry: resolve(__dirname, 'src/umd.ts'),
          name: 'MDFolderTree',
          formats: ['umd'],
          fileName: () => 'MDFolderTree.umd.js',
        },
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: false,
        minify: true,
        rollupOptions: {
          external: [],
          output: {
            name: 'MDFolderTree',
          },
        },
      },
    };
  }

  // Standard ESM/CJS library build
  return {
    plugins: [
      dts({
        insertTypesEntry: true,
        afterBuild: () => {
          // Bundle all declarations into a single index.d.ts
          execSync(
            'npx dts-bundle-generator -o dist/index.d.ts src/index.ts --no-banner',
            { cwd: __dirname, stdio: 'pipe' },
          );
          // Copy styles type declaration
          copyFileSync(
            resolve(__dirname, 'src/styles.d.ts'),
            resolve(__dirname, 'dist/styles.d.ts'),
          );
          // Clean up individual .d.ts files and subdirectories
          const distDir = resolve(__dirname, 'dist');
          for (const entry of readdirSync(distDir)) {
            const full = resolve(distDir, entry);
            if (entry === 'index.d.ts' || entry === 'styles.d.ts') continue;
            if (entry.endsWith('.d.ts') || entry.endsWith('.d.ts.map')) {
              rmSync(full);
              continue;
            }
            if (statSync(full).isDirectory()) {
              rmSync(full, { recursive: true });
            }
          }
        },
      }),
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        formats: ['es', 'cjs'],
        fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
        cssFileName: 'styles',
      },
      rollupOptions: {
        external: [],
        output: {
          globals: {},
        },
      },
      sourcemap: mode !== 'production',
      minify: mode === 'production',
    },
  };
});
