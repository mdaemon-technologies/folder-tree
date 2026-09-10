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

### Fixed — model and DOM divergence

- Selection no longer diverges from what is rendered. `TreeSelection` and each
  node's `state.selected` flag were maintained independently and only the
  former enforced `core.multiple`, so with `multiple: false` two nodes could
  render as selected while the API reported one. The flag is now derived from
  the selection set.
- `select_all` honors `multiple: false` and skips disabled nodes, and its
  `changed` event reports the real prior selection instead of a hardcoded
  empty array (which made `changed.deselected` permanently empty).
- Clicking a checkbox now honors `tie_selection`, `three_state` and the
  `cascade_to_disabled` / `cascade_to_hidden` options. The click path ran a
  second cascade implementation inside the core that ignored all of them; it
  has been removed in favour of the plugin's.
- Toggling a checkbox emits `changed`, so `StatePlugin` persists checkbox
  interaction and consumers listening for `changed` see it. Unchecking now
  emits `deselect_node` rather than `select_node`.
- `check_all` skips disabled nodes, which could otherwise end up checked but
  not selected.
- Descendants keep correct ancestry after a move. `parents` and `children_d`
  were patched by hand at each mutation site; `children_d` never held anything
  deeper than direct children. Both are now rebuilt centrally after every
  structural change, which also repairs `get_top_selected`,
  `get_bottom_selected`, `get_top_checked` and drag-and-drop descendant checks.
- Sorting no longer leaves the DOM and `node.children` in different orders.
  Ordering is applied at render time and written back to the model.
- `destroy()` removes the click, dblclick, hover and keydown listeners bound to
  the container. A destroyed instance previously kept intercepting events aimed
  at its replacement. The dnd plugin likewise releases its document-level
  pointer listeners, and now abandons a drag on `pointercancel`.
- Search state survives a redraw. Matching runs against the model rather than
  the DOM, and results are re-applied when nodes render.
- `refresh()` restores opened and selected nodes when `core.data` is an
  asynchronous callback; previously it restored before the data arrived and
  silently lost the state. It no longer re-emits `ready`.
- Lazy-loaded, mass-loaded and HTML-parsed nodes are normalized like the
  initial load, so a node without an `id` no longer reaches the store as
  `undefined`. Generated ids cannot collide with ids supplied in the payload.
- A node naming a parent that is not supplied is attached to the root and
  reported, rather than being stored but never rendered.
- `conditionalselect` returning `false` no longer lets the anchor's `href="#"`
  navigate, which jumped the page to the top.
- `End` focuses a collapsed parent when it is the last node, instead of
  skipping every closed node.
- An explicit per-node `icon` is no longer overwritten by its type's icon.
- `get_json({ flat: true })` no longer nests `children` as well, which
  duplicated the whole tree inside its first entry.
- `StatePlugin` tolerates corrupt or outdated `localStorage` payloads instead
  of throwing inside an event handler where the error was invisible.
- `set_theme` survives a redraw; the renderer no longer re-applies
  `md-tree-default` unconditionally.
- Plugin hooks and the `core.data` callback are wrapped: failures are reported
  through `core.error` / `last_error()` rather than being swallowed by DOM
  event dispatch, and a throwing data callback no longer leaves a node stuck
  in the loading state.

### Changed

- **Breaking:** `loaded` and `ready` are emitted one microtask after load
  instead of synchronously during the constructor, where nothing could
  subscribe in time to observe them. Code awaiting these events now works as
  documented; tests asserting on them need to await a microtask.
- **Breaking:** `moveNode` returns `false` for a destination parent that does
  not exist rather than orphaning the node, and `check_callback` is no longer
  consulted for a move that is already structurally invalid.
- `close_opened_onclear` is now implemented; it was previously accepted and
  ignored.
- `TreePluginHost` gains `selectAll`, `deselectAll` and `setChildOrder`.
- `TreeRenderer` and `JsonParser` take an optional additional constructor
  argument (an error reporter and an id generator respectively). Both are
  optional, so existing direct construction is unaffected.

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
