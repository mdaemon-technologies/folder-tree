// ESLint flat config: the recommended JavaScript and TypeScript rules over the
// library source. Tests are checked by their own run (ts-jest) instead.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'demo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Unused arguments named with a leading underscore are deliberate:
      // they keep jstree's positional signatures.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
