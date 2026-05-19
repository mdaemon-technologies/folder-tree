import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync } from 'fs';
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
        rollupTypes: true,
        afterBuild: () => {
          copyFileSync(
            resolve(__dirname, 'src/styles.d.ts'),
            resolve(__dirname, 'dist/styles.d.ts'),
          );
        },
      }),
    ],
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'src/index.ts'),
          'jquery-bridge': resolve(__dirname, 'src/jquery-bridge.ts'),
        },
        formats: ['es', 'cjs'],
        fileName: (format, entryName) =>
          `${entryName}.${format === 'es' ? 'mjs' : 'js'}`,
        cssFileName: 'styles',
      },
      rollupOptions: {
        external: [],
        output: {
          globals: {},
        },
      },
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'esbuild' : false,
    },
  };
});
