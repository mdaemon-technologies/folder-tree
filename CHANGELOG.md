# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Remediation of critical defects found during a full code review. Every change in
this release is covered by regression tests written against the previous behavior.

### Security

- **Breaking:** `core.sanitize_attrs` now defaults to `true`. Event-handler
  attributes (`on*`, case-insensitive) supplied through `li_attr` / `a_attr` are
  stripped before reaching the DOM. Previously they were rendered verbatim, so
  node data from an untrusted source could execute script — for example
  `a_attr: { onclick: '…' }`. Set `core.sanitize_attrs: false` to restore the
  previous jstree-identical passthrough. Attributes other than `on*` are
  unaffected, and remain inert on the tags the renderer emits (`li`, `a`, `i`,
  `span`, `ul`); `href` is still never taken from `a_attr`.

### Fixed

- Cyclic parent references no longer hang the page. Building a node's ancestor
  chain looped until the array exceeded its maximum length, freezing the tab and
  then throwing `RangeError: Invalid array length`. Reachable from input data
  alone — a flat array where two nodes name each other as parent — as well as
  from `moveNode`. The ancestor walk is now bounded by a visited set.
- `moveNode` refuses to move a node into itself or into its own descendant,
  which previously corrupted the tree into a cycle.
- Duplicate node ids no longer destroy existing nodes. `createNode` with an
  id already in the tree replaced that node and orphaned its entire subtree;
  duplicate ids in input data silently discarded all but the last occurrence.
  Duplicates are now rejected, the first occurrence is kept, and the collision
  is reported through `core.error` and `last_error()`.
- Generated ids no longer collide. `copyNode` and `createNode` derived ids from
  `Date.now()`, so two calls within the same millisecond produced the same id.
  Ids now come from a monotonic counter that also skips any id already in use.
- `copyNode` performs a deep copy. It previously produced a childless node that
  shared its `li_attr`, `a_attr`, `state` and `original` objects with the source,
  so mutating the copy mutated the original. Descendants are now copied with
  fresh ids and every mutable object is detached.
- Root-level nodes can be reordered. `'#'` resolved to no node, so inserts
  against the root parent were skipped while `moveNode` still returned `true`.
  `moveNode`, `copyNode`, `createNode`, `deleteNode` and `reorderChildren` now
  all maintain an ordered root container, which also makes root-level
  drag-and-drop reordering work.
- `moveNode` and `copyNode` no longer silently no-op against a parent that does
  not exist; they report the failure instead of orphaning the node.

### Changed

- **Breaking:** `moveNode` returns `false` when the move is refused (cycle,
  missing parent). It previously returned `true` while doing nothing.
- **Breaking:** `copyNode` returns `false` when the destination parent does not
  exist, and the returned subtree is now populated rather than childless.
- **Breaking:** Copied nodes are created neither selected nor checked. A copy
  previously retained `checked: true` while being forced to `selected: false`,
  a combination the rest of the tree treats as contradictory.
- Generated id formats changed from timestamp-based to counter-based:
  `new_<n>` and `<sourceId>_copy_<n>`. Ids were never documented as stable, but
  code matching on the old shape will need updating.
- `check_callback` is no longer invoked for a move that is already structurally
  invalid, so side-effecting callbacks do not run for operations that cannot
  succeed.
- `last_error()` and `core.error` now additionally report `cycle`,
  `missing_parent` and `duplicate_id` alongside the existing `check_callback`.

### Documentation

- README's "XSS safe" claim corrected to describe what is actually guaranteed —
  text is rendered via `textContent`, and `on*` attributes are stripped by
  default — rather than implying `innerHTML` is never used.

## [1.0.4] - 2026-05-20

### Fixed

- The constructor throws a clear error when given something that is not a DOM
  element, instead of failing later during rendering.
- `mdTree()` throws when its selector matches no element, rather than continuing
  with a null target.

## [1.0.3] - 2026-05-20

### Fixed

- Lazy loading: `openNode` now triggers the configured `core.data` callback for
  a node that has not been loaded yet, instead of expanding to nothing.
- Nodes declared with `children: true` are marked unloaded rather than loaded,
  so they render as expandable and trigger a load when opened.
- Checkbox `tie_selection` keeps `state.checked` in step with selection changes
  in `selectNode` / `deselectNode`.
- Anchor styling: removed the underline on tree anchors.

## [1.0.2] - 2026-05-20

### Added

- Support for jstree-style flat arrays, where each node names its parent via a
  `parent` property, in addition to nested `children` arrays. No data
  restructuring is required when migrating from jstree.

## [1.0.1] - 2026-05-20

### Changed

- TypeScript declarations are bundled into a single `dist/index.d.ts` via
  `dts-bundle-generator`, replacing the per-module declaration files.
- The package entry imports `./styles.css`, so the stylesheet is emitted as
  `dist/styles.css` and picked up automatically by bundlers.

### Removed

- `./jquery-bridge` subpath export — `mdTree` is exported from the package root.
- `./umd/min` subpath export — the UMD build is minified in place.

## [1.0.0] - 2026-05-19

### Added

- Initial release: zero-dependency TypeScript tree view, a drop-in replacement
  for jstree with no jQuery requirement.
- Twelve plugins: `types`, `checkbox`, `search`, `changed`, `conditionalselect`,
  `contextmenu`, `dnd`, `massload`, `sort`, `state`, `unique`, `wholerow`.
- `mdTree()` migration helper and a `migrate-from-jstree` codemod script.
- ESM, CJS and UMD builds, with the stylesheet available via the `./styles` and
  `./styles.css` subpath exports.
