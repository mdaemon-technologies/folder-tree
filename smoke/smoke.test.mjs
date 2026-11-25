// The ES module entry, resolved through package.json's "exports" -> "import".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as tree from '@mdaemon/folder-tree';
import smoke from './exercise.cjs';

const require = createRequire(import.meta.url);

test('import loads dist/index.mjs', () => {
  // import.meta.resolve needs a flag before Node 20.6; the import above has
  // already resolved either way, so this only pins down which file it chose.
  if (typeof import.meta.resolve === 'function') {
    assert.equal(
      fileURLToPath(import.meta.resolve('@mdaemon/folder-tree')),
      fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
    );
  }
  smoke.exerciseFull(tree);
});

test('the ES module and CommonJS entries export the same names', () => {
  assert.deepEqual(smoke.namedExports(tree), smoke.namedExports(require('@mdaemon/folder-tree')));
});
