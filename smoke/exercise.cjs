'use strict';
/**
 * Smoke checks for the built bundles, shared by the smoke.test.* files.
 *
 * The full suite runs under Vitest 5 and jsdom 31, which need Node 22.22 or
 * later, but the package's `engines` is Node 20. These checks run on Node 20
 * with nothing but node:test and node:assert, so they need no install and no
 * TypeScript: CI builds dist/ on Node 24 and runs them against it.
 *
 * Node has no DOM, so a tree cannot be built here; the Vitest suite covers
 * behavior. These check that each bundle parses and loads, resolves through
 * package.json's "exports", and that the parts that need no DOM work.
 *
 * Plain JavaScript on purpose: keep it to syntax and APIs Node 20.0 has. Each
 * file is run with plain `node`, not `node --test`; node:test still runs the
 * tests and sets a failing exit code.
 */
const assert = require('node:assert/strict');

/** What the UMD bundle exports (src/umd.ts); the full entries export more. */
const CORE_EXPORTS = ['MDFolderTree', 'mdTree'];

/**
 * Checks the exports every bundle has.
 *
 * @param {object} mod - The module as a consumer receives it.
 */
function exerciseCore(mod) {
  for (const name of CORE_EXPORTS) {
    assert.equal(typeof mod[name], 'function', `${name} is exported`);
  }
  const { MDFolderTree } = mod;
  assert.equal(typeof MDFolderTree.registerPlugin, 'function', 'MDFolderTree.registerPlugin');
  assert.equal(MDFolderTree.getInstance({}), null, 'getInstance finds no tree on a bare object');
  assert.equal(typeof MDFolderTree.prototype.select_node, 'function', 'snake_case API');
  assert.equal(typeof MDFolderTree.prototype.selectNode, 'function', 'camelCase API');
}

/**
 * Checks a full entry (dist/index.js or dist/index.mjs).
 *
 * @param {object} mod - The module as a consumer receives it.
 */
function exerciseFull(mod) {
  exerciseCore(mod);

  // Nested data: ids are generated, children normalized.
  const nested = new mod.JsonParser().parse([{ text: 'A', children: [{ text: 'B' }] }]);
  assert.equal(nested.length, 1);
  assert.equal(nested[0].id, 'mdft_1');
  assert.equal(nested[0].text, 'A');
  assert.equal(nested[0].children[0].id, 'mdft_2');
  assert.equal(nested[0].children[0].children, false);

  // Flat data keeps its parent references.
  const flat = new mod.JsonParser().parse([
    { id: 'a', parent: '#', text: 'A' },
    { id: 'b', parent: 'a', text: 'B' }
  ]);
  assert.deepEqual(flat.map(node => [node.id, node.parent]), [['a', '#'], ['b', 'a']]);

  // The event bus dispatches namespaced CustomEvents (global since Node 19).
  const bus = new mod.TreeEventBus(new EventTarget());
  const seen = [];
  bus.on('ready.MDFolderTree', event => seen.push(event.detail));
  bus.emit('ready.MDFolderTree', { ok: true });
  assert.deepEqual(seen, [{ ok: true }]);

  const store = new mod.TreeNodeStore();
  store.set('a', { id: 'a' });
  assert.equal(store.size(), 1);
  assert.equal(store.get('missing'), null);
}

/**
 * The module's named exports, without `default` and the CommonJS interop flag.
 *
 * @param {object} mod - A loaded module.
 * @returns {string[]} The sorted export names.
 */
function namedExports(mod) {
  return Object.keys(mod).filter(key => key !== 'default' && key !== '__esModule').sort();
}

module.exports = { CORE_EXPORTS, exerciseCore, exerciseFull, namedExports };
