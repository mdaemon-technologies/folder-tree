'use strict';
// The CommonJS entry, resolved through package.json's "exports" -> "require".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exerciseFull } = require('./exercise.cjs');

const DIST = path.resolve(__dirname, '..', 'dist');

test('require() loads dist/index.js', () => {
  assert.equal(require.resolve('@mdaemon/folder-tree'), path.join(DIST, 'index.js'));
  exerciseFull(require('@mdaemon/folder-tree'));
});

test('dist/index.d.ts exports exactly what src/index.ts exports', () => {
  // Every exported type in the declarations is public API, so a type the
  // source keeps internal must not be exported by the bundled declarations.
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'index.ts'), 'utf8');
  const exported = [...source.matchAll(/^export (?:type )?\{([^}]*)\}/gm)]
    .flatMap(match => match[1].split(','))
    .map(name => name.trim())
    .filter(Boolean)
    .sort();

  const declarations = fs.readFileSync(path.join(DIST, 'index.d.ts'), 'utf8');
  const declared = [...declarations.matchAll(/^export (?:declare )?(?:abstract )?(?:interface|type|class|function|const|enum) (\w+)/gm)]
    .map(match => match[1])
    .sort();

  assert.deepEqual(declared, exported);
});

test('the stylesheet resolves through "exports" and holds the md-tree classes', () => {
  for (const specifier of ['@mdaemon/folder-tree/styles', '@mdaemon/folder-tree/styles.css']) {
    assert.equal(require.resolve(specifier), path.join(DIST, 'styles.css'), specifier);
  }
  assert.match(fs.readFileSync(path.join(DIST, 'styles.css'), 'utf8'), /\.md-tree-node\b/);
});
