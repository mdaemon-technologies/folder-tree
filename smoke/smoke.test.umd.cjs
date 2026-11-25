'use strict';
// The UMD bundle, as a <script> tag loads it (window.MDFolderTree) and as a
// CommonJS loader does through package.json's "exports" -> "./umd".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CORE_EXPORTS, exerciseCore, namedExports } = require('./exercise.cjs');

const UMD = path.resolve(__dirname, '..', 'dist', 'MDFolderTree.umd.js');

test('dist/MDFolderTree.umd.js defines window.MDFolderTree', () => {
  // Run it as a classic script, the way a browser does.
  const window = {};
  vm.runInNewContext(fs.readFileSync(UMD, 'utf8'), window, { filename: UMD });
  assert.deepEqual(Object.keys(window), ['MDFolderTree'], 'one global');
  assert.deepEqual(namedExports(window.MDFolderTree), CORE_EXPORTS);
  exerciseCore(window.MDFolderTree);
});

test('require("@mdaemon/folder-tree/umd") fills module.exports', () => {
  assert.equal(require.resolve('@mdaemon/folder-tree/umd'), UMD);
  const umd = require('@mdaemon/folder-tree/umd');
  assert.deepEqual(namedExports(umd), CORE_EXPORTS);
  exerciseCore(umd);
});

test('every UMD export is also a named export of the full entries', () => {
  const full = namedExports(require('@mdaemon/folder-tree'));
  for (const name of CORE_EXPORTS) assert.ok(full.includes(name), name);
});
