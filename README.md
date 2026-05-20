# @mdaemon/folder-tree

A zero-dependency TypeScript tree view component — drop-in replacement for [jstree](https://www.jstree.com/).

[![npm version](https://img.shields.io/npm/v/@mdaemon/folder-tree.svg)](https://www.npmjs.com/package/@mdaemon/folder-tree)
[![CI](https://github.com/mdaemon-technologies/folder-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/mdaemon-technologies/folder-tree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Acknowledgments

This library is a TypeScript port of [jstree](https://www.jstree.com/), created by [Ivan Bozhanov (vakata)](https://github.com/vakata). MDaemon Technologies relied on jstree for over a decade and owes a great deal to Ivan's work — his library set the standard for tree view components on the web. As we moved away from jQuery, we chose to port jstree's proven architecture to modern TypeScript with native DOM events rather than reinvent the wheel. Thank you, Ivan, for building and maintaining such an excellent open-source project.

## Features

- **Zero runtime dependencies** — pure TypeScript compiled to ES2020, no jQuery required
- **jstree API compatible** — same method names, events, and CSS classes
- **`mdTree()` migration helper** — drop-in replacement for `$.jstree()` calls without jQuery
- **XSS safe** — all DOM rendering via `createElement` + `textContent`, never `innerHTML`
- **Twelve built-in plugins** — `types`, `checkbox`, `search`, `changed`, `conditional_select`, `contextmenu`, `dnd`, `massload`, `sort`, `state`, `unique`, `wholerow`
- **Multiple output formats** — ESM, CJS, and UMD bundles
- **Full TypeScript types** included

## Installation

```bash
npm install @mdaemon/folder-tree
```

## Usage

### ESM / TypeScript

```ts
import { MDFolderTree } from '@mdaemon/folder-tree';
import '@mdaemon/folder-tree/styles.css';

const tree = new MDFolderTree(document.getElementById('tree')!, {
  core: {
    data: [
      { id: 'node-1', text: 'Inbox', type: 'email', children: [
        { id: 'node-1-1', text: 'Important', type: 'email' },
      ]},
      { id: 'node-2', text: 'Sent', type: 'email' },
    ],
  },
  types: {
    email: { icon: 'md-tree-icon-email' },
  },
  plugins: ['types'],
});

// Select a node
tree.select_node('node-1');

// Listen for events
document.getElementById('tree')!.addEventListener('changed.MDFolderTree', (e) => {
  console.log('Selection changed:', (e as CustomEvent).detail.selected);
});
```

### UMD (Script Tag — jstree Drop-in)

```html
<script src="node_modules/@mdaemon/folder-tree/dist/MDFolderTree.umd.js"></script>
<script>
  // No jQuery required — mdTree() is available globally
  mdTree('#tree', {
    core: { data: [...] },
    plugins: ['types', 'checkbox'],
  });
</script>
```

### Migrating from jstree

`mdTree()` is a direct replacement for `$.jstree()` — no jQuery required:

```ts
import { mdTree } from '@mdaemon/folder-tree';

// Before: $('#tree').jstree({ ... })
mdTree('#tree', { core: { data: [...] } });

// Before: $('#tree').jstree(true)
const instance = mdTree('#tree', true);

// Before: $('#tree').jstree('select_node', 'node-1')
mdTree('#tree', 'select_node', 'node-1');
```

#### Step-by-step migration

**1. Swap the scripts (remove jQuery dependency):**

```html
<!-- Before -->
<link rel="stylesheet" href="jstree/themes/default/style.css">
<script src="jquery.min.js"></script>
<script src="jstree.min.js"></script>

<!-- After -->
<link rel="stylesheet" href="node_modules/@mdaemon/folder-tree/dist/styles.css">
<script src="node_modules/@mdaemon/folder-tree/dist/MDFolderTree.umd.js"></script>
```

**2. Replace CSS class names (`jstree-*` → `md-tree-*`):**

| jstree | MDFolderTree |
|--------|--------------|
| `.jstree` | `.md-tree` |
| `.jstree-node` | `.md-tree-node` |
| `.jstree-anchor` | `.md-tree-anchor` |
| `.jstree-open` | `.md-tree-open` |
| `.jstree-closed` | `.md-tree-closed` |
| `.jstree-leaf` | `.md-tree-leaf` |
| `.jstree-icon` | `.md-tree-icon` |
| `.jstree-clicked` | `.md-tree-clicked` |
| `.jstree-checkbox` | `.md-tree-checkbox` |
| `.jstree-search` | `.md-tree-search` |

**3. Rename the data attribute:**

```html
<!-- Before -->
<li id="n1" class="jstree-open" data-jstree='{"type":"folder","opened":true}'>

<!-- After -->
<li id="n1" class="md-tree-open" data-md-tree='{"type":"folder","opened":true}'>
```

**4. Update event listeners (native CustomEvent, no jQuery):**

```js
// Before (jQuery)
$('#tree').on('changed.jstree', function(e, data) {
  console.log(data.selected);
});

// After (native DOM)
document.getElementById('tree').addEventListener('changed.MDFolderTree', (e) => {
  console.log(e.detail.selected);
});
```

**5. Config structure is unchanged** — `core`, `types`, `checkbox`, `search`, and `plugins` all work identically.

#### Automated migration script

A Node.js script is included that scans your codebase, reports what needs to change, and optionally applies the transformations:

```bash
node node_modules/@mdaemon/folder-tree/scripts/migrate-from-jstree.mjs ./src
```

The script will:
1. Print a checklist of all required changes with file names and line numbers
2. Ask if you want it to apply the changes automatically
3. Apply each change incrementally, showing before/after for every line modified

## API

### Constructor

```ts
new MDFolderTree(element: HTMLElement, config?: TreeConfig)
```

### Methods

| Method | Description |
|--------|-------------|
| `get_node(id, asDom?)` | Get node data object (or DOM element if `asDom=true`) |
| `select_node(id, suppress?)` | Select a node |
| `deselect_node(id, suppress?)` | Deselect a node |
| `select_all(suppress?)` | Select all nodes |
| `deselect_all(suppress?)` | Deselect all nodes |
| `get_selected()` | Return array of selected node IDs |
| `open_node(id)` | Expand a node |
| `close_node(id)` | Collapse a node |
| `open_all()` | Expand all nodes |
| `close_all()` | Collapse all nodes |
| `enable_node(id)` | Enable a disabled node |
| `disable_node(id)` | Disable a node |
| `refresh_node(id)` | Re-render a node and its children |
| `search(query)` | Filter/highlight matching nodes (requires `search` plugin) |
| `clear_search()` | Clear search filter |
| `destroy()` | Tear down the instance |

### Events

Events are dispatched as `CustomEvent` on the container element:

| Event | Detail |
|-------|--------|
| `select_node.MDFolderTree` | `{ node, selected, event }` |
| `deselect_node.MDFolderTree` | `{ node, selected, event }` |
| `changed.MDFolderTree` | `{ action, node, selected, old_selection }` |
| `open_node.MDFolderTree` | `{ node }` |
| `close_node.MDFolderTree` | `{ node }` |
| `ready.MDFolderTree` | `{ instance }` |
| `dblclick.MDFolderTree` | `{ node, event }` |

### Plugins

Enable plugins via the `plugins` config array:

```ts
new MDFolderTree(el, {
  plugins: ['types', 'checkbox', 'search'],
  types: { ... },
  checkbox: { keep_selected_style: false },
  search: { show_only_matches: true },
});
```

## CSS Compatibility

The renderer outputs CSS class names following the same structure as jstree 3.3.x but with the `md-tree` prefix (`.md-tree`, `.md-tree-node`, `.md-tree-anchor`, etc.). If migrating from jstree, a find-and-replace of `jstree-` → `md-tree-` in your stylesheets is all that's needed.

## Data Sources

**JSON array:**
```ts
core: { data: [{ id: '1', text: 'Node', children: [...] }] }
```

**Callback (lazy loading):**
```ts
core: {
  data: (node, callback) => {
    fetch(`/api/children/${node.id}`).then(r => r.json()).then(callback);
  }
}
```

**Pre-rendered HTML:**
```html
<div id="tree">
  <ul>
    <li id="n1" data-md-tree='{"type":"folder"}'>
      <a>Folder Name</a>
      <ul><li id="n2"><a>Child</a></li></ul>
    </li>
  </ul>
</div>
```

## Development

```bash
npm install
npm run build        # Production ESM/CJS build
npm run build:umd    # UMD bundle
npm run build:all    # Both
npm run dev          # Watch mode
npm test             # Run tests
npm run typecheck    # TypeScript check
```

## License

[MIT](LICENSE) — Copyright (c) MDaemon Technologies, Ltd.
