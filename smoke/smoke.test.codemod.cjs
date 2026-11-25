'use strict';
// The jstree codemod ships in the package and consumers run it with their own
// Node, so it runs here end to end: scan, answer "yes", rewrite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'migrate-from-jstree.mjs');

const BEFORE = [
  "$('#tree').jstree({ core: {} });",
  "$('#tree').on('select_node.jstree', handler);",
  '<div class="jstree jstree-default" data-jstree=\'{}\'></div>',
  ''
].join('\n');

const AFTER = [
  "mdTree('#tree', { core: {} });",
  "$('#tree').addEventListener('select_node.MDFolderTree', handler);",
  '<div class="md-tree md-tree-default" data-md-tree=\'{}\'></div>',
  ''
].join('\n');

test('migrate-from-jstree.mjs rewrites a project it is pointed at', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-tree-codemod-'));
  try {
    fs.mkdirSync(path.join(root, 'app'));
    const file = path.join(root, 'app', 'tree.js');
    fs.writeFileSync(file, BEFORE);

    // A relative directory, run from its parent: the script resolves it against the cwd.
    const run = spawnSync(process.execPath, [SCRIPT, 'app'], { cwd: root, input: 'yes\n', encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Found 6 change\(s\) across 1 file\(s\)/);
    assert.equal(fs.readFileSync(file, 'utf8'), AFTER);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migrate-from-jstree.mjs takes an absolute path from any directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-tree-codemod-'));
  try {
    const app = path.join(root, 'app');
    fs.mkdirSync(app);
    const file = path.join(app, 'tree.js');
    fs.writeFileSync(file, BEFORE);

    // Run from somewhere else, so only the absolute path can lead to the files.
    const run = spawnSync(process.execPath, [SCRIPT, app], { cwd: os.tmpdir(), input: 'yes\n', encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes(`Scanning: ${app}`), run.stdout);
    assert.equal(fs.readFileSync(file, 'utf8'), AFTER);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migrate-from-jstree.mjs changes nothing when the answer is no', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-tree-codemod-'));
  try {
    fs.mkdirSync(path.join(root, 'app'));
    const file = path.join(root, 'app', 'tree.js');
    fs.writeFileSync(file, BEFORE);

    const run = spawnSync(process.execPath, [SCRIPT, 'app'], { cwd: root, input: 'no\n', encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No changes made/);
    assert.equal(fs.readFileSync(file, 'utf8'), BEFORE);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
