# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] 2026-09-14

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

- `destroy()` leaves no theme classes behind. It removed the literal
  `md-tree-default`, so a tree themed anything else — `themes: { name: 'custom' }`,
  or any later `set_theme` — left `md-tree-custom` on the container, along with
  `md-tree-custom-responsive` and any variant class, for whatever took the
  element over next. A theme now takes off exactly the classes it put on.
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
- `open_node` on a lazy node whose load fails leaves it closed instead of
  retrying until the stack overflows.

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
- `select_all`'s `changed` event reports the real prior selection instead of a
  hardcoded empty array, which made `changed.deselected` permanently empty.
  (`select_all` continues to select every node irrespective of
  `core.multiple`, matching jstree, which applies that setting to interaction
  rather than to the programmatic API.)
- Clicking a checkbox now honors `tie_selection`, `three_state` and the
  `cascade_to_disabled` / `cascade_to_hidden` options. The click path ran a
  second cascade implementation inside the core that ignored all of them; it
  has been removed in favour of the plugin's.
- Toggling a checkbox emits `changed`, so `StatePlugin` persists checkbox
  interaction and consumers listening for `changed` see it. Unchecking now
  emits `deselect_node` rather than `select_node`.
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
- `TreeRenderer` and `JsonParser` take an additional constructor argument (an
  error reporter and an id generator respectively). `JsonParser`'s is
  optional, so constructing it directly is unaffected; `TreeRenderer`'s
  constructor has since gained a required argument, under *Changed —
  rendering*.

### Changed — jstree parity: selection, activation and keyboard

- **Breaking:** `core.multiple` constrains user interaction only, as in
  jstree. Programmatic `select_node` no longer deselects other nodes under
  `multiple: false`; clicks and Enter still enforce single selection.
- **Breaking:** `select_node` no longer refuses disabled nodes, is a no-op for
  a node that is already selected, and opens collapsed ancestors unless the
  new third argument `prevent_open` is set. `supress_event` now withholds only
  `changed`: `select_node` always fires. `deselect_node` likewise always fires
  and is a no-op for a node that is not selected.
- **Breaking:** `select_all` selects disabled nodes too and emits a new
  `select_all` event; `deselect_all` emits a `deselect_all` event carrying the
  previous selection as `node`.
- **Breaking:** A plain click on the only selected node no longer deselects it
  (set `core.allow_reselect` to re-fire the selection). Ctrl/meta-click
  toggles a node in or out of the selection; shift-click selects a sibling
  range. `activate_node` now fires after the selection has changed, and a
  click moves keyboard focus to the clicked node.
- `changed` diffs (`changed.selected` / `changed.deselected`) are computed
  against the last *emitted* selection, as jstree's changed plugin does, so a
  click that replaces the selection reports the node it replaced. A `changed`
  event with action `ready` reports nodes that arrive selected, just before
  `ready`.
- **Breaking (checkbox):** With `tie_selection` on (the default), checking
  *is* selecting, as in jstree: `check_node`, `uncheck_node`, `check_all` and
  `uncheck_all` emit `select_node`, `deselect_node`, `select_all` and
  `deselect_all`. The `check_*` / `uncheck_*` events fire only when
  `tie_selection` is off, and now carry the checked set as `selected`.
  `check_node` no longer opens ancestors; `check_all` checks disabled nodes;
  single-select checking is enforced on click rather than by `check_node`.
  `state.checked` in node data is honored only when `tie_selection` is off.
- `checkbox.whole_node: false` is implemented: only the checkbox icon toggles,
  and clicking the label selects normally.
- The checkbox undetermined state survives a redraw; `is_undetermined` and
  `get_undetermined` are derived from the model rather than DOM classes.
- **Breaking (keyboard):** Default shortcuts now match jstree exactly —
  `ctrl+space`, `enter`, the arrows, `*` (open all), `home`, `end`, `F2`. The
  non-jstree defaults are gone: `Delete` (which deleted the focused node
  without confirmation), `Ctrl+X` / `Ctrl+C` / `Ctrl+V`, and plain `Space`.
  Restore any of them through `core.keyboard`.
- `core.keyboard` is implemented: shortcuts are merged over the defaults, a
  `null` entry disables one, `false` disables all, combos match regardless of
  modifier order, handlers run with the tree as `this`, and returning `false`
  prevents the default action.
- Arrow keys, `End`, `get_next_dom` and `get_prev_dom` skip hidden nodes and
  the contents of collapsed nodes.
- Keystrokes typed into the inline-rename input no longer trigger shortcuts,
  so pressing Enter to commit a rename no longer also activates the node.

### Changed — jstree parity: node references, checks and data

- **Breaking:** `get_node` returns `false` rather than `null` for a node that
  does not exist, as jstree does. `get_node('#')` resolves to the root, and
  with `as_dom` to the container.
- Every node-taking jstree method now accepts a node in any form `get_node`
  does: a node object, an object carrying an `id`, an id, a `'#'`-prefixed id,
  a jQuery-style wrapper, a DOM element inside a node, or the container (the
  root). Only an id string worked before, so passing `data.node` from an event
  back into the API silently did nothing. The twenty-five methods jstree
  treats as array-capable — among them `select_node`, `deselect_node`,
  `open_node`, `close_node`, `toggle_node`, `delete_node`, `move_node`,
  `copy_node`, `rename_node`, `set_text`, `set_icon`, `hide_node`, `show_node`,
  `enable_node`, `disable_node`, `check_node` and `uncheck_node` — also accept
  an array and return `true` after processing it. `create_node` accepts `null`
  as the parent, meaning the root.
- `is_parent`, `is_leaf` and `is_closed` match jstree: an unloaded lazy node is
  a closed parent, so the Right arrow now loads and opens it. `is_leaf` is
  defined as `!is_parent`, so an unknown node reports as a leaf.
- **Breaking:** `check()` is public and applies jstree's structural rules.
  Moving *or copying* a node into itself or its own descendant is refused —
  copying into a descendant was previously allowed — and moving a node to the
  position it already holds is refused instead of succeeding as a no-op.
- `check_callback` may be a map of operations (`{ delete_node: false }`). A
  function refuses only by returning exactly `false`; a falsy return such as
  `undefined` no longer refuses. It receives jstree's per-operation arguments:
  the new node's data for `create_node` (previously `null`), the new text as
  the position for `rename_node`, the node's index for `delete_node`, and
  `{ core, is_multi, is_foreign }` for `move_node` / `copy_node`. Starting an
  inline rename (`edit`) is checked as well.
- **Breaking:** A refused check sets `last_error()` in jstree's shape —
  `{ error: 'check', plugin: 'core', id, reason, data }`, where `id` is the
  error code (`core_01`, `core_02`, `core_03` or `core_08`) and `data` is a
  JSON string of `{ chk, pos, obj, par }`. It was previously
  `{ error: 'check_callback' | 'cycle', operation, id: <node id>, … }`.
- Nodes carry `node.data` — the data from their JSON, or `null` — as jstree
  nodes do; it was previously missing. `data.jstree` in node JSON overrides
  state and icon, and `data.functions` permits or forbids individual
  operations for a node (`core_02`), ahead of `check_callback`. `get_json`
  includes `data`, or `false` under `no_data`, which was previously ignored.

### Changed — jstree parity: hover and sort

- Pointer hover goes through `hover_node` / `dehover_node`, as in jstree:
  hovering a node dehovers the previous one, re-hovering emits nothing, and
  leaving a node that was never hovered emits nothing. Moving from an anchor
  onto its own label no longer drops the hover.
- **Breaking (sort):** A custom `sort` comparator receives two node **ids**
  with the tree as `this`, as jstree calls it — so `this.get_text(a)` works —
  rather than two node objects. The default comparison is jstree's plain,
  case-sensitive `get_text(a) > get_text(b)`, where it was case-insensitive.

### Changed — jstree parity: icons

- **Breaking (icons):** A node's `icon` defaults to `true`, jstree's visible
  theme icon, where it defaulted to `false` and rendered no icon at all.
  `undefined`, `null` and `''` also mean the theme icon, and `false` hides it.
  `get_icon` and `get_json` report `true` for such nodes.
- A string `icon` is a class list, so multi-class icons such as
  `'fa fa-folder'` render (they threw); a string containing `/` or `.` is an
  image URL, rendered as a background image.
- `set_icon(obj, true | null | '')` restores the theme icon.
- `hide_icon` / `show_icon` change `node.icon` itself, as in jstree, so
  `get_icon` agrees with the screen and a redraw keeps the icon hidden.
  As in jstree, `show_icon` restores the icon the rendered node recorded in
  its `rel` attribute — or the theme icon once a redraw has dropped it — and
  both return `true`.
- The types plugin writes a type's icon into `node.icon`, so `get_icon`
  reports it; an explicit node icon still wins. As in jstree, an unconfigured
  or missing type becomes `'default'`, each type inherits unset properties
  from `default`, and `set_type` adopts the new type's icon when the node
  showed the theme icon or its old type's icon.
- The default theme icon and jstree's folder / file classes
  (`md-tree-folder` / `md-tree-file`) now draw an image.

### Changed — jstree parity: loading and refresh

- `refresh_node` reloads the node and every open node inside it through
  `core.data`, then reopens them, reselects the selected nodes that still
  exist, and emits `refresh_node` with `{ node, nodes }` once every load has
  settled. It returned nothing and only redrew the node; it now returns
  `true`, or `false` for the root or a missing node.
- `load_node` on an already loaded node drops its descendants when the reload
  starts, as jstree does, rather than when the new data arrives; if any of
  them were selected, `changed` fires with action `load_node`.
- A node whose load fails records `state.failed`, as in jstree.
- **Breaking (load_node):** `load_node` returns `true` for any node that
  exists, as jstree does, and reports the outcome as `status`: the
  `load_node` event is now `{ node, status }` and fires on failure too.
  With static data only the root loads — `load_node('#')` re-parses
  `core.data`, or the container's original markup for an HTML tree — and any
  other node fails, reporting `core_05` when `core.data` is an array.
- `load_node` given an array loads only the nodes not yet loaded and calls
  back once with the ids that loaded, as jstree's does; it called back once
  per node and reloaded loaded ones.
- A `core.data` function is called with the tree as `this`, and may answer
  `false` to fail the load, or an HTML string of `<li>` elements (or a `<ul>`
  of them), as jstree allows. The string is parsed in an inert document, so
  nothing in a server response loads or runs.
- `open_node` on an unloaded node loads it whatever the data source, and
  stays closed if that fails.

### Changed — jstree parity: HTML markup

Existing `<ul>/<li>` markup is read as jstree reads it, under the names the
migration codemod produces (`jstree-*` → `md-tree-*`, `data-jstree` →
`data-md-tree`):

- `data-*` attributes become the node's `data`, with values converted as
  jQuery's `.data()` converts them; the `data-md-tree` payload sits under
  `data.jstree`, and — as in jstree — overrides the state and icon read from
  the markup. A node without data attributes gets `data: {}`, not `null`.
- `md-tree-clicked` / `md-tree-disabled` on a node's anchor select / disable
  it, and `md-tree-closed` on an `<li>` without a child list makes it lazy.
- A rendered `.md-tree-themeicon` gives the node's icon (its `rel`, or `false`
  when hidden).
- The state classes are no longer copied into `li_attr` / `a_attr`.

### Changed — jstree parity: node markup

- `li_attr.class` is added to the node's `<li>` and `a_attr.class` to its
  anchor, as jstree's `redraw_node` does; both were ignored.
- **Breaking (markup):** A disabled node's `md-tree-disabled` class is on its
  anchor, where jstree puts `jstree-disabled`, rather than on the `<li>`. The
  stylesheet's selector moved with it; custom CSS written against
  `.md-tree-disabled > .md-tree-anchor` needs the same change.
- A node's anchor has the id `<node id>_anchor` unless `a_attr.id` sets one,
  recorded in `a_attr.id` as jstree records it; a copied node's anchor gets
  its own.

### Changed — jstree parity: get_json and JSON ingest

- **Breaking (get_json):** `get_json` returns jstree's shape: every node has
  `id`, `text`, `icon`, `li_attr`, `a_attr`, the whole `state`, `data` (`{}`
  when there is none) and `children` (`[]` when there are none), where empty
  fields and false state flags were omitted. `type` is reported for every
  node when the types plugin is active, and not otherwise (it was reported
  whenever it was not `'default'`). `flat` entries carry `parent`.
- `get_json` accepts any node reference, and the `no_li_attr` / `no_a_attr`
  options. `no_id` removes the ids — including `li_attr.id` and `a_attr.id`,
  throughout — instead of setting `id` to `''`.
- **Breaking (ingest):** A node's `state` is layered over `data.jstree`,
  which is layered over the defaults, as in jstree; `data.jstree` used to
  win. `state.loaded` is honored, so `get_json` output — unloaded lazy nodes
  included — loads back as the same tree.
- As in jstree, a node's `li_attr.id` defaults to its id (and supplies a
  missing id), `a_attr.href` defaults to `'#'`, and `set_id` and copies keep
  `li_attr.id` in step.

### Changed — jstree parity: create, move and copy arguments

- **Breaking (create_node):** `create_node` returns the new node's id, as
  jstree's does, rather than the node (`createNode` still returns the node).
  It takes jstree's full signature, `create_node(par, node, pos, callback,
  is_loaded)`: `node` may be a string (its text) or omitted, and a missing
  text becomes `get_string('New node')`; `pos` defaults to `'last'` and may be
  `'first'`, `'inside'`, `'last'`, `'before'` / `'after'` (beside `par`) or an
  index; an unloaded parent is loaded first; and the callback receives the
  new node.
- `create_node` builds nested `children` as a whole subtree, from a copy of
  the object it is given, which it no longer keeps a reference to.
- **Breaking (move_node):** `move_node` returns the moved node's id, as
  jstree's does, rather than `true`; `copy_node` returns the copy's id. Both
  take jstree's full signature, `(obj, par, pos, callback, is_loaded)`: `pos`
  defaults to 0 and takes create_node's forms, an unloaded parent is loaded
  first, an array's nodes are placed one after another, and the callback
  receives the node, its new parent and its position.
- **Breaking (move_node):** As in jstree, a position is read against the
  children as they are before the move, so a node moved down within its own
  parent lands one place earlier than it did (`[a, b, c]`, moving `a` to 2,
  gives `[b, a, c]`). The `move_node` event reports the final position.

### Changed — jstree parity: keyboard handler events

- A `core.keyboard` handler receives the keydown as jstree presents it: its
  `target` and `currentTarget` are the focused node's anchor, so the jstree
  idiom `this.get_node(e.currentTarget)` finds the focused node (it resolved
  to the root), and the native event is its `originalEvent`. Its properties
  and methods read from and act on the native event; it is no longer the
  native event object itself.

### Changed — jstree parity: configuration

- `core.expand_selected_onload` (default `true`) is honored: just before
  `ready`, every ancestor of a preselected node is opened, as in jstree, so
  the selection starts out visible.
- `core.restore_focus` is honored: returning to the tree resumes at the last
  focused node by default, and with `restore_focus: false` leaving the tree
  forgets it, as in jstree.
- `core.themes` is applied at init as jstree applies it: `name` (with
  `responsive`, which marks the theme `md-tree-<name>-responsive`) and
  `variant` on init, then `dots`, `icons`, `stripes` and `ellipsis` while
  loading, through `show_*` / `hide_*` so their events fire. `name`,
  `variant`, `stripes`, `ellipsis` and `responsive` were ignored at init.
- `checkbox.visible` is honored, applied while loading as jstree applies it.
  `show_checkboxes` / `hide_checkboxes` toggle an `md-tree-no-checkboxes`
  class on the container instead of styling each checkbox, so a redraw no
  longer brings hidden checkboxes back.
- The container is marked `md-tree-checkbox-selection` while checking is tied
  to selection, and `md-tree-checkbox-no-clicked` for
  `keep_selected_style: false`, both at init as in jstree (the latter was
  added only once a node rendered).

### Changed — jstree parity: search

- `search` takes jstree's full signature, `search(str, skip_async,
  show_only_matches, inside, append, show_only_matches_children)`, and still
  returns the ids it matched.
- **Breaking (search):** As in jstree, every match's ancestors are opened —
  not only under `show_only_matches` — and `clear_search` closes the ones the
  search opened, since `close_opened_onclear` now defaults to `true`.
- Candidates are the descendants of `inside` (or of the root) that have text
  and are not hidden; `search_leaves_only` counts only loaded childless
  nodes, so an unloaded lazy node is not a leaf. `search_callback` is called
  with the tree as `this`.
- `search.fuzzy` matches approximately, with jstree's bitap matcher.
- `show_only_matches_children` keeps the matches' descendants shown, and
  `show_only_matches` hides and re-shows through `hide_all` / `show_node`.
- `search.ajax`'s function form names nodes to load before searching.
- `search` and `clear_search` events are emitted with jstree's payloads.

### Changed — jstree parity: events

- **Breaking (events):** `open_node` on a node that is already open, and
  `close_node` on one already closed, return `false` and emit nothing, as in
  jstree; `before_open` / `open_node` / `after_open` used to fire again.
  `open_node` returns `true` once it opens a node, takes jstree's
  `callback(node, status)`, and waits out a load already in progress.
- **Breaking (events):** `open_all(obj)` / `close_all(obj)` work below a node
  (the root by default) through `open_node` / `close_node`, so each node's
  own events fire, and `open_all` loads lazy nodes and opens what they load;
  both then emit `open_all` / `close_all` with the node. They set state
  silently and emitted nothing.
- `hide_all` / `show_all` return the ids they changed and emit them as
  `nodes`.
- `init` fires during construction, before `loading`; `destroy` fires first
  on destroy, while the tree is intact; the state plugin fires
  `restore_state` with the state it applied.

### Changed — jstree parity: unique plugin

- **Breaking (unique):** The `unique` plugin works, as jstree's does, by
  joining `check`: it refuses a name a sibling already has — `unique_01` for
  rename, `unique_02` copy, `unique_03` move (a reorder within the parent is
  allowed), `unique_04` create — reported through `last_error()` and
  `core.error` under the `unique` plugin. It was listed but never consulted.
- A node created without text is named `New node`, then
  `unique.duplicate(name, counter)` from 2, called with the tree as `this`.
- Plugins can join `check` through an `onCheck` hook, consulted after the
  core rules pass — even when a node's `data.functions` permits the
  operation, as in jstree.

### Changed — jstree parity: massload, load_all and disabled checkboxes

- **Breaking (massload):** `massload` is jstree's function,
  `massload(ids, callback)`, called with the tree as `this` and answering a
  map of id to children (JSON, or an HTML string). It batches the loads the
  tree makes together — `load_node` with an array, `refresh_node`,
  `load_all` — and a node the answer leaves out loads through `core.data`;
  a single `load_node` goes straight to `core.data`, as in jstree. The
  earlier `{ url, data, callback }` form, and the plugin's `queueLoad`
  methods, never ran and are gone; `MassloadConfig` is now a deprecated alias
  of `MassloadCallback`.
- `load_all(obj, callback)` loads every unloaded node below `obj` together,
  then again for whatever those loads reveal, as in jstree; it loaded one
  level only. The callback receives the node and runs just before
  `load_all` is emitted with `{ node }`, as in jstree (the event came first). A node that fails to load is not retried (in jstree it would be,
  forever).
- `disable_checkbox` / `enable_checkbox` keep the flag in the model as
  `state.checkbox_disabled`, so a redraw keeps a checkbox disabled (and node
  data can disable one); they emit only on a change, return `false` for a
  missing node, and a click on a disabled checkbox is ignored, as in jstree.
  A stylesheet rule now dims disabled checkboxes.

### Changed — jstree parity: safe defaults

- **Breaking (check_callback):** `core.check_callback` defaults to `false`,
  as in jstree, so `create_node`, `rename_node`, `delete_node`, `move_node`,
  `copy_node` and `edit` are refused (`core_03`) until the tree opts in with
  `check_callback: true`, a function, or a per-operation map. An unset
  `check_callback` used to allow them all. Loading, selecting, opening and
  the other non-structural calls are unaffected.

### Changed — jstree parity: checkbox cascade

- `checkbox.cascade` is honored: with `three_state` (the default) the
  cascade is `'up+down+undetermined'`, as in jstree; with `three_state:
  false` the `cascade` string names the directions, where it was ignored and
  nothing cascaded.
- **Breaking (checkbox):** Cascading follows jstree's rules. Down re-derives
  the subtree, so a parent that cannot be fully checked — a child excluded by
  `cascade_to_disabled` / `cascade_to_hidden` — ends unchecked (it stayed
  checked). Up checks a parent once all its children are, and unchecking
  clears the ancestors. Both also apply as nodes load — so initial data with a
  checked parent checks its children, and all-checked children check their
  parent — and up re-applies on delete and move.
- Partial parents are undetermined only with `'undetermined'`, and an
  unloaded node the server marks `state.undetermined` counts, as in jstree.

### Added — jstree parity: ajax and string data

- `core.data` may be jstree's ajax config — `{ url, data, type, dataType,
  headers, ... }`, with `url` and `data` functions of the node called with the
  tree as `this` — fetched for each load with `fetch` in place of `$.ajax`:
  `data` is sent as jQuery serializes it (a query string for GET, a form body
  otherwise), and the response is read as JSON or HTML by its content type.
  A failed request reports `core_04`.
- `core.data` may be an HTML string, which loads the root; any other node
  reports `core_06`, as in jstree.
- JSON answers are read as jstree reads them: a `{ d: [...] }` wrapper is
  unwrapped and a single node is wrapped in an array.
- `search.ajax` and `massload` accept the same ajax config: search sends the
  string (and `inside`) with the config's data, abandoning a previous request
  (`search_01` on failure); massload's `url` / `data` are functions of the ids.

### Changed — jstree parity: state

- **Breaking (state):** `get_state()` returns jstree's shape,
  `{ core: { open, loaded, scroll, selected } }` — `loaded` only with the new
  `core.loaded_state` — plus `checkbox` (the checked nodes) while checking is
  not tied to selection. It returned `{ opened, selected }`.
- **Breaking (state):** `set_state(state, callback)` applies jstree's state
  step by step: loaded and open nodes are loaded first (so lazy nodes can be
  restored), open nodes opened without closing any others, the scroll
  restored, and the selection replaced unless it changed meanwhile; then it
  calls back and emits `set_state`. It closed every node first. The
  `{ opened, selected }` shape of earlier releases is still accepted.
- **Breaking (state plugin):** The state plugin saves jstree's format,
  `{ state, ttl, sec }`, under jstree's default key `'jstree'` (it used
  `'md-tree-state'`; set `state.key` to keep reading an earlier save), 100ms
  after a change and only once the restore at `ready` is done. `core.loaded`
  is saved only with `preserve_loaded`, a state older than its `ttl` is
  ignored, and `filter` — called with the tree as `this` — now adjusts the
  state being restored rather than the one being saved. States saved by
  earlier releases still restore. A state saved by jstree itself restores
  after migrating.

### Changed — jstree parity: drag and drop

- Dragging a selected node drags the top selected nodes, as jstree's
  `drag_selection` (the default) does, the helper naming how many
  (`get_string('nodes')`); only the grabbed node was dragged.
- `dnd.is_draggable` may be a boolean, or is called with the node objects
  and the event, the tree as `this`.
- `dnd.touch` is honored — `false` never drags on touch, `'selected'` drags
  only a selected node — and a touch drag starts after jstree's 10px move.
  `large_drag_target` starts a drag anywhere on the node.
- The click that ends a drag is swallowed, and Escape cancels a drag, as in
  jstree.
- The dnd events carry jstree's payload, `{ data: { jstree, origin, obj,
  nodes }, element, helper, event }` (with `node` as before), and `dnd_stop`
  fires whenever a drag ends. The helper has jstree's markup under the
  codemod's names: `#vakata-dnd` around `#md-tree-dnd`, with its status icon
  and copy sign.
- **Breaking (dnd):** Dropping follows jstree's handlers. Over an anchor, the
  pointer's third orders before, inside and after (jstree's preferences), and
  the first position every dragged node may take wins — checked with the
  drag context, `{ dnd, ref, pos, origin, is_multi, is_foreign }`, unless
  `check_while_dragging` is off. Every dragged node is dropped, one after
  another. The drop zones were quarters of the whole node.
- **Breaking (dnd):** `dnd.copy` defaults to `true`, as in jstree, so a drag
  with ctrl (or meta) held copies — including when the key is pressed or
  released mid-drag; `always_copy` always copies. The copy key was never
  read.
- `inside_pos`, `blank_space_drop` (a drop over blank space goes last at the
  root, as it always does in an empty tree), `large_drop_target` and
  `open_timeout` (hovering inside a closed node opens it) follow jstree.
- Feedback follows jstree: the drop marker is `#md-tree-marker` on the page,
  classed `md-tree-below` / `md-tree-inside` / `md-tree-above`; the parent a
  drop goes into is marked `md-tree-dnd-parent`; the helper's icon is
  `md-tree-ok` or `md-tree-er` and its copy sign shows while copying. A
  refused drop is reported through `core.error`.
- Nodes can be dragged between trees, as in jstree: onto another tree with
  the dnd plugin, where that tree's own dnd settings apply. `move_node` /
  `copy_node` take jstree's full signature, ending in `origin`: a node from
  another tree is checked as `is_multi`, copied in from its JSON (without
  ids, data or state), and — for a move — deleted from its own tree.
- Dragging near the edge of a scrollable ancestor (or the page) scrolls it
  10px every 100ms, as jstree's drag does, emitting `dnd_scroll` and
  forgetting the drop target until the pointer moves; the container alone
  scrolled before.
- `dnd.use_html5` is honored, as jstree's HTML5 backend: where elements can
  be draggable, anchors (whole nodes, with `large_drag_target`) are
  `draggable` and the browser's native drag and drop drives the drag.
  `dragstart` starts it, with no helper, as the browser draws the dragged
  image; `dragover` finds the drop on the same rules, setting the `copy` or
  `move` drop effect; and `drop` drops, into this tree or another. A native
  drag abandoned without a drop ends quietly, as Escape ends a pointer drag.

### Changed — jstree parity: context menu

- **Breaking (contextmenu):** The menu is jstree's `$.vakata.context` menu:
  a `ul.vakata-context` (also classed `md-tree-contextmenu`) of items with
  jstree's markup — separators, `_class`, icons, `shortcut` /
  `shortcut_label`, submenus opened by hover or the arrows — where it was a
  `div.md-tree-contextmenu`. The tree is marked `md-tree-contextmenu`, and the
  node whose menu is open `md-tree-context`.
- **Breaking (contextmenu):** An item's `action` receives `{ item, reference,
  element, position }` with the node's **anchor** as `reference` — so
  `tree.get_node(data.reference)` finds the node, as jstree's actions rely on
  — and the menu as `element`; `reference` was the tree container and the
  position zero. A disabled item does nothing, and an action returning
  `false` keeps the menu open.
- **Breaking (contextmenu):** The default items are jstree's: Create (which
  then edits the new node), Rename (which edits), Delete (the selection, when
  the node is selected) and an Edit submenu with Cut, Copy and Paste (off
  until something is cut or copied). Rename only emitted `rename_intent`.
- Right-click activates the node (`activate_node`, as jstree) rather than
  selecting it, and the menu opens at the node by default (`show_at_node`).
  `items(node, callback)` is called with the tree as `this` and may answer
  through the callback. A loading node opens no menu; a click on a node, or
  outside the menu, closes it; a 750ms touch press opens it.
- The menu is keyboard-navigable as jstree's: Up / Down, Right / Left into
  and out of submenus, Enter / Space, Escape, and items' shortcut keys.
  `context_show` / `context_hide` fire on the document with `{ reference,
  element, position }`.

### Changed — rendering

- **Breaking:** `TreeRenderer` takes the node store as its second constructor
  argument, and `render` / `renderSingleNode` no longer take a node map. The
  renderer reads the store directly, so `MDFolderTree.getNodeMap()` — which
  rebuilt a `Map` of every node in the tree on each of its 26 call sites — is
  gone. This reaches only code that constructs a `TreeRenderer` itself; no
  behavior of a tree changes.
- Redrawing a node keeps the marks the renderer does not own — the focus
  ring, the cut marking and the hover — across the whole subtree it replaces.
  They went with the element being swapped out, so checking the focused node
  lost its focus ring, and a cut node lost its marking on any redraw at all.
  Search highlighting was never affected (the search plugin re-applies it as
  each node draws), and the drag marker sits on the body rather than inside a
  node.

### Changed — the core split up

- `MDFolderTree` was one 3,681-line class. The clipboard, inline editing,
  keyboard navigation and theming now live in `TreeClipboard`,
  `TreeInlineEditor`, `TreeKeyboard` and `TreeThemeController`, each exported
  from the package and each reaching its tree through the public API alone.
  Every method that moved stayed where it was as a one-line delegation, so
  nothing a consumer calls, listens for or receives has changed.

### Changed — plugins register themselves

- **Breaking:** a tree applies its plugins in the order its own `plugins`
  config lists them, as jstree does — `$.jstree.create` walks that array, each
  plugin decorating the last. Ours applied a fixed order of its own, so
  wherever two plugins answer the same hook the consumer's order was ignored:
  under `plugins: ['unique', 'types']` a create both would refuse was reported
  as the types refusal rather than the unique one. Every hook is affected —
  `check`, activation vetoes, rendering and teardown. A tree naming a single
  plugin, which is nearly every tree, is unaffected.
- `MDFolderTree.registerPlugin(name, factory)` registers a plugin under the
  name trees list it by, and `getPlugin(name)` returns the one a tree built
  under that name, or `null`. The twelve built-ins register themselves through
  that same call, so a plugin of your own is built on the terms theirs are,
  rather than needing a branch inside the core.
- The core now constructs no plugin itself and names no implementation. The
  built-ins register in [src/plugins/register.ts](src/plugins/register.ts),
  which both package entries import for its side effect — so the package as it
  ships is unchanged, while a consumer importing `MDFolderTree` on its own can
  leave every plugin out of their bundle and register only what they use.
- A `types` config still enables that plugin without naming it, and it leads.

### Changed — jstree parity: types rules

- **Breaking (types):** `max_children`, `valid_children` and `max_depth` are
  enforced. They join `check`, refusing a create, move or copy with jstree's
  `types_01`, `types_02` and `types_03` under `plugin: 'types'`; they were
  accepted in config and never consulted. As in jstree, a move of a node
  already among the parent's children — a reorder — skips all three, while a
  copy into that same parent does not, and `max_depth` counts the depth the
  moved subtree itself would add.
- **Breaking (types):** the root carries the `'#'` type, as in jstree, so
  `types: { '#': { max_children: 3 } }` governs the top level. `get_type('#')`
  reports `'#'` rather than `'default'` while the plugin is on.
- A type's `li_attr` and `a_attr` now reach its nodes: anything the node does
  not set is copied, a class list is prepended to the node's own, an anchor's
  placeholder `href` gives way to the type's, and the type's `id` is never
  taken. Only its `icon` was applied before.
- `get_rules(obj)` is added: the node's type merged with its rules and
  jstree's `-1` defaults for `max_depth`, `max_children` and `valid_children`.

### Changed — jstree parity: wholerow

- **Breaking (wholerow):** the strip behind each node is now what the pointer
  meets, as in jstree, so a click anywhere on a row selects that node,
  ctrl-click extends, a double-click toggles it, and a right-click opens its
  menu (with the contextmenu plugin). A click on a leaf's open/close icon,
  which has nothing to toggle, selects too. Hovering the strip or an icon
  hovers the node. The strip only rendered and styled before, and the blank
  part of a row did nothing.
- The strip carries `md-tree-wholerow-clicked` while its node is selected and
  `md-tree-wholerow-hovered` while it is hovered, both drawn from the model so
  a redraw keeps them, and the theme's dots are hidden while the plugin is on.
- **Breaking (wholerow):** the strip is no longer `z-index: -1`; the anchor and
  the open/close icon are raised above it instead, so the strip can take the
  rest of the row's clicks. Restyle if you overrode either rule.

### Changed — jstree parity: aria

- **Breaking:** every aria attribute now lives on the anchor, which carries
  `role="treeitem"`, while the `<li>` carries `role="none"` — jstree's markup.
  `aria-selected` and `aria-disabled` moved there, `aria-expanded` moved and is
  written only for a node that can hold children, and `aria-level` is new.
  Selectors or tests reading `li[role="treeitem"]` or the li's aria attributes
  need updating.
- `core.compute_elements_positions` (default false, as in jstree) adds
  `aria-setsize` and `aria-posinset` to every anchor.
- The container declares `aria-multiselectable` while `core.multiple` is on,
  and takes `md-tree-rtl` when it computes to a right-to-left direction.

### Added — jstree parity: loading affordances

- A node being loaded carries `md-tree-loading`, with `aria-busy` on its
  anchor — `true` while it loads, `false` once it has — and the class is
  re-applied on any redraw while the load is outstanding.
- While the root loads, the tree shows jstree's placeholder node
  (`md-tree-initial-node`, reading `get_string('Loading ...')`) and marks the
  container `md-tree-loading` with `aria-busy`, both going as the nodes
  arrive. This is what a worker-backed load shows in a browser, where the
  initial load completes asynchronously. A tree built from the container's own
  markup shows no placeholder, since that markup is the source.

### Changed — jstree parity: event payloads

- **Breaking:** a move between trees is a `move_node`, as in jstree; it was
  emitted as a `copy_node`.
- `move_node` and `copy_node` carry jstree's full payload: `old_parent`,
  `old_position`, `is_multi`, `is_foreign`, `old_instance` and `new_instance`
  (and `original` on a copy).
- `redraw` carries the `nodes` it drew; `set_text` adds jstree's `obj`
  alongside our `node`; and deleting a selected node is followed by `changed`
  with `{ action: 'delete_node', node, parent, selected }`, which was silent.

### Added — jstree parity: theme autoload and callbacks

- `core.themes.url` loads a theme's stylesheet — a URL as given, or `true` to
  build `<core.themes.dir>/<name>/style.css` — injecting each URL once per
  page. `themes.dir` is new; the argument to `set_theme(name, url)` was
  accepted and ignored. Without a `dir`, `url: true` falls back to the
  directory this script was loaded from, and loads nothing when that is
  unknown (an ES module rather than a `<script>` tag).
- `conditionalselect` is called with the tree as `this`, as in jstree, so a
  callback may consult it (`this.get_type(node)`); calling it bare threw.

### Changed — jstree parity: clipboard

- **Breaking:** The clipboard is jstree's: one buffer for every tree on the
  page, so nodes cut or copied in one tree paste into another. `get_buffer()`
  returns `{ mode, node, inst }` — `'move_node'` or `'copy_node'`, the nodes
  and their tree, all `false` when empty — where it returned
  `{ mode: 'cut' | 'copy', ids }` or `null`; `ids` is still included.
- **Breaking:** `paste(obj, pos)` goes through `move_node` / `copy_node` with
  the buffer's tree as the origin, so several nodes keep their order — they
  were pasted one by one at the same index, which reversed them — and `pos`
  takes `move_node`'s forms (`'first'`, `'last'`, an index). The `paste`
  event is jstree's `{ parent, node, mode }` (with `ids`), and paste empties
  the buffer without emitting `clear_buffer`.
- `cut()` and `copy()` take the selection when given nothing, return false
  when there is nothing to buffer, and emit jstree's `{ node }` — the nodes as
  given — alongside `ids`. Destroying a tree forgets its buffered nodes.

### Changed — jstree parity: animation and workers

- **Breaking:** `core.animation` (200ms by default, as in jstree) is
  honored: a node's children slide open and closed over it, and `open_node` /
  `close_node`'s `animation` argument overrides it (0 or `false` for none).
  `after_open` / `after_close` fire when the slide ends — later than before,
  when they fired at once; `before_open`, `open_node` and `close_node` still
  fire at once. As in jstree, `open_all` / `close_all` animate only when given
  an animation, and `refresh_node`, search and `expand_selected_onload` never
  do.
- **Breaking:** `core.worker` (default `true`, as in jstree) is honored:
  where the browser has Web Workers, JSON data — the initial load and each
  lazy, massload or ajax load — is built in a worker, off the page's thread,
  one load at a time. Such loads complete asynchronously: the nodes, the
  `load_node` callback, `model`, `loaded` and `ready` follow the worker's
  reply. HTML data, `create_node` and `copy_node` stay synchronous. A worker
  that fails, or data that cannot be sent to one (functions, for example), is
  built on the page's thread instead; `core.worker: false` never uses one.
  Destroying the tree revokes the worker's Blob URL. A load that arrives
  after its node was deleted is dropped, as is a node whose id was taken in
  the meantime (reported as `duplicate_id`), each with the nodes beneath it.

### Changed — tooling

- `npm run lint` works: ESLint with typescript-eslint in a flat config
  (`eslint.config.mjs`), run in CI after the type check.
- The jstree migration codemod, `scripts/migrate-from-jstree.mjs`, ships in
  the package, so the README's `node_modules/` instruction works.
- The `build:all` script (an alias of `build`) and the unused `.npmignore`
  are gone.

### Added
- The `model` event, `{ nodes, parent }`, fires when nodes enter the model
  (initial load, `load_node`, `create_node`, `copy_node`), before they render.
- `activate_node(obj, event)` — the entry point for user interaction.
- `hover_node`, `dehover_node`, `get_container_ul`, `get_string` (with
  `core.strings` as a map or a function), `get_type` (optionally with the
  type's rules), `set_type` (array-capable; refuses a type absent from
  `types`), `get_theme_variant`, and `redraw_node` (returning the element).
- The sort plugin's `sort(obj, deep)`.
- `ActivationEvent` and `KeyboardHandler` types; `TreePluginHost.applySelection`
  for silent selection changes from plugins.

### Deprecated

- The `TreeSelection` constructor argument and `setMultiple()` are no-ops;
  `core.multiple` is enforced on activation.

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
