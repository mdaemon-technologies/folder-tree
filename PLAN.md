# MDFolderTree — Remediation & jstree Parity Plan

Working document. Phases 1 and 2 are complete; Phase 3 is the parity program.

## Goal

`@mdaemon/folder-tree` is a drop-in replacement for jstree 3.3.x without jQuery.
A consumer should be able to swap the script, rename `jstree-*` CSS classes to
`md-tree-*`, and have their application behave identically.

## Parity principle

**Match the API and the observable functionality. Internal semantics need not
match.**

Concretely: method names, signatures, return values, config options, event
names, event payloads and event timing must match jstree. How we achieve that
internally is our choice — we are not obliged to copy jstree's data structures,
its `_data.core.selected` / `_data.checkbox.selected` split, or its jQuery
plumbing.

Where a difference is *observable* to a consumer, it is a parity bug. Where it
is not, it is an implementation detail.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Critical defects (XSS, cycle hangs, id collisions, shallow copy, root ordering) | **Done** — 6 items |
| 2 | Model/DOM divergence (selection, ancestry, cascade, teardown, sort, search, lifecycle) | **Done** — 13 items |
| 3 | jstree feature parity | **Done** — 3.1–3.13, each with its phase reviews |
| 4 | Structure & performance | Planned |

Test suite: 1035 passing, typecheck and lint clean, build green.

## Accepted divergences from jstree

Deliberate, decided, and to be documented in the migration guide rather than
"fixed". Each was verified against jstree 3.3.16 source.

| Behavior | jstree | Ours | Rationale |
|---|---|---|---|
| `li_attr` / `a_attr` `on*` handlers | Rendered verbatim (zero sanitization in the entire codebase) | Stripped unless `core.sanitize_attrs: false` | Shipping a known XSS vector to preserve bug-for-bug fidelity is not acceptable. One-line opt-out restores jstree behavior. |
| Node with a parent not present in the payload | Reports via `core.error`, then drops the node | Reports via `core.error`, then attaches to root | Both report; rescuing is strictly more recoverable. |
| Duplicate node id | No detection; silently overwrites | Rejected, first occurrence kept, reported | jstree's behavior here is undefined/corrupting, not a contract. |
| `get_node` with a string that is not a node id | Falls through to a CSS selector search inside the tree, so once no node has id `'a'`, `get_node('a')` returns the first node (via its `<a>` anchor) | Ids and `'#'`-prefixed ids only | jstree documents the argument as "the node object, the DOM node, the jQuery object or the ID"; the selector search is a side effect of its DOM branch, and it turns existence checks into false positives for ids that are also tag names. |

| `hover_node` side effect on `aria-activedescendant` | Sets it to the hovered node (on a timeout) | Left alone | Here `aria-activedescendant` tracks keyboard focus; mirroring jstree would make a mouse hover move focus for assistive technology. |
| `copy_node` data and state | The copy is built from `get_json(obj, { no_id, no_data, no_state })`, so it has no `data` and default state | A deep copy of `data`, and the state bar selection | Decided: keeping what a node carries is strictly more useful, and jstree code does not rely on copies being bare. |
| Node text and context menu labels as HTML (`core.force_text`) | Rendered as HTML unless `force_text: true` | Always rendered as text; `force_text` has no effect | Decided: rendering consumer strings as HTML reopens the XSS exposure closed in Phase 1. |

**Open question:** `sanitize_attrs` is the only one that could plausibly break a
real migration. Revisit if strict parity is ever required.

---

# Phase 3 — jstree feature parity

**Progress:** 3.1 done — selection API and activation parity, including
`allow_reselect`, ctrl/shift selection, `checkbox.whole_node`, and jstree's
`changed` diff semantics. Keyboard parity done — `core.keyboard`, jstree's
exact default map, hidden-node skipping — covering the `core.keyboard` item of
3.2 and the keyboard half of 3.8.

3.3 is done except as below: node references and array arguments (3.3a),
lazy nodes as parents (3.3b), a public check() with jstree's structural rules
and error shape (3.3c-1), node.data and data.functions (3.3c-2), the eight
missing methods (3.3d-1), sort-plugin semantics (3.3d-2), icon semantics
(3.3e), refresh_node reloading (3.3f), load_node parity (3.3g), HTML parsing
and HTML-string responses (3.3h), node markup (3.3i), get_json with JSON
ingest (3.3j), create / move / copy argument forms (3.3k), and the keyboard
handler event (3.3l), and `core.data`'s ajax and string forms (3.3m). Open:
the copy_node data decision.

## Phase 3 — decisions

Decided: 1 and 2 keep ours (see Accepted divergences); 3, 4 and 5 are to be
implemented for parity (3.12). The questions as put:

1. **`copy_node` data and state** — jstree's copies drop both; ours keep a
   deep copy of `data` and the state bar selection (see 3.3).
2. **`force_text` / HTML text** — jstree renders node text, and context menu
   labels, as HTML unless `force_text`; ours always renders text, which the
   Phase 1 XSS fix relies on (see 3.2).
3. **`animation`** — jstree slides nodes open and closed and fires
   `after_open` / `after_close` when the slide ends; ours has no animation and
   fires them at once (see 3.2).
4. **`core.worker`** — jstree can parse large JSON in a Web Worker (Tier C).
5. **`dnd.use_html5`** — jstree's alternative native-HTML5 drag backend, which
   also lets nodes be dragged to and from other applications (Tier C). The
   pointer backend already covers mouse, pen and touch.

## 3.1 Move `multiple` enforcement to the activation path

**Observable difference today:** under `core.multiple: false`, calling
`selectNode('a')` then `selectNode('b')` leaves only `b` selected. In jstree
both remain selected — `multiple` constrains *interaction*, not the
programmatic API.

jstree enforces it in `activate_node`:

```js
if(!this.settings.core.multiple || (!e.metaKey && !e.ctrlKey && !e.shiftKey) || …) {
  if (this.settings.core.allow_reselect || !this.is_selected(obj) || this._data.core.selected.length !== 1) {
    this.deselect_all(true);
    this.select_node(obj, false, false, e);
  }
}
```

**Work:**
- Remove the `if (!this.multiple) this.selected.clear()` from
  `TreeSelection.select()`. The class becomes a policy-free set; retire
  `setMultiple` and the constructor argument.
- Rebuild the click/keyboard activation path to match jstree's observable
  behavior: refuse disabled (done); no modifier or `!multiple` →
  `deselect_all(true)` then select; ctrl/meta → toggle; shift → range-select
  from a tracked `last_clicked`.
- Gate re-click deselection behind `allow_reselect` instead of hardcoding it.

**Value:** removes the last data-layer divergence, implements `allow_reselect`,
and adds ctrl/shift multi-select — which we do not currently support at all.

**Breaking:** programmatic `selectNode` under `multiple: false` stops clearing
the previous selection. This is the parity fix, not a regression.

**Do this first** — 3.2 Tier A depends on the activation path existing.

## 3.2 Config parity

Verified: **jstree has no dead config options.** All ~50 are implemented.
Nothing should be deleted; everything must be implemented.

### Never referenced in our source (19)

```
core      worker, strings, loaded_state, restore_focus, allow_reselect, keyboard
themes    stripes, responsive
search    fuzzy, show_only_matches_children
dnd       use_html5, blank_space_drop, large_drag_target,
          large_drop_target, touch, check_while_dragging
checkbox  whole_node, cascade, visible
```

### Declared but inert (~9)

| Option | Current state |
|---|---|
| `core.animation`, `core.force_text`, `core.expand_selected_onload` | Only the literal in `mergeDefaults` |
| `state.preserve_loaded` | Only a type signature |
| `themes.ellipsis`, `themes.variant` | Runtime API works; never applied from config at init |
| `unique.case_sensitive`, `trim_whitespace`, `duplicate` | Coded, but the plugin is never invoked (see 3.5) |
| `dnd.copy` | Permanently gated behind `isCopyModifier() { return false }` |

**≈28 gaps total.**

### Tier A — cheap, localized

Already done through 3.1 and 3.3: `allow_reselect`, `strings` +
`get_string`, `checkbox.whole_node` and `core.keyboard`.
Done in 3.2: `expand_selected_onload` (3.2a), and `themes.name` / `variant` /
`stripes` / `ellipsis` / `responsive` at init (3.2b), and `checkbox.visible`
with jstree's container classes (3.2d), and the search plugin as a whole —
`fuzzy`, `show_only_matches_children`, `ajax` (function form), `inside`,
`append`, revealing matches and its events (3.2c).
`restore_focus` (3.2f), with the virtual focus model standing in for jstree's
real anchor focus. The dnd options of Tier A and B go with 3.9.

Two Tier A items are decisions rather than fixes:

- **`force_text`** — jstree's default (`false`) renders node text as HTML;
  `true` escapes it. Ours always renders text as text, which the Phase 1 XSS
  fix relies on. Honoring `force_text: false` restores jstree's rendering but
  also the XSS exposure for any consumer that passes untrusted text.
- **`animation`** — jstree slides nodes open and closed over
  `core.animation` ms (default 200) and fires `after_open` / `after_close`
  when the slide ends. Ours has no animation, and those events fire at once.
  Matching needs a CSS height transition and deferred events.

`expand_selected_onload` (jstree implements it immediately before
`trigger("ready")`: collect `parents` of selected, dedupe, open each),
`allow_reselect` (falls out of 3.1), `restore_focus`, `strings` + `get_string`,
`force_text`, `animation`, `themes.stripes` / `ellipsis` / `variant` /
`responsive` applied at init, `search.fuzzy`, `show_only_matches_children`,
`checkbox.visible`, `checkbox.whole_node`, `core.keyboard`, `dnd.copy`
modifier (read `e.ctrlKey`; two-line fix), `blank_space_drop`,
`large_drop_target`, `check_while_dragging`.

### Tier B — moderate

- **`checkbox.cascade` — done (3.2e).** jstree's cascade model, ported: a string such as
  `"up+down+undetermined"` (18 uses). Our `three_state` boolean is a
  simplification we invented. Parity means adopting `cascade` and keeping
  `three_state` as a compatibility shim.
- **The state plugin as a whole — done (3.2g).** jstree saves `get_state()` —
  `{ core: { open, loaded, scroll, selected }, checkbox?, ... }` — wrapped as
  `{ state, ttl, sec }`, and restores through `set_state`, which loads lazy
  nodes, opens, selects and scrolls, then fires `set_state` / `restore_state`.
  Ours saves `{ opened, selected }` with `expires` and restores by opening
  and selecting directly, so state that jstree saved in a user's
  `localStorage` does not restore after migrating. Parity means jstree's
  storage format, `get_state` / `set_state` shapes, `loaded_state` /
  `preserve_loaded`, `ttl` / `sec`, and `filter` over the jstree shape.
- `dnd.large_drag_target`.

### Tier C — substantial, decide explicitly

- **`worker`** (14 uses) — jstree parses large JSON in a Web Worker.
- **`touch`** (26 uses) — full touch drag support.
- **`use_html5`** (5 uses) — alternative HTML5 drag-and-drop backend.

## 3.3 Method parity

### Accept every `obj` form jstree accepts — highest priority

jstree's `get_node(obj)`, and every method that takes a node, accepts a node
object, an id, a `'#'`-prefixed id, a jQuery object, any DOM element inside a
node, or the container itself (resolving to the root). Ours accept only an id
string, so `store.get(nodeObject)` misses and the call silently no-ops.

That breaks what is probably the most common jstree idiom — passing
`data.node` from an event straight back in, e.g. `tree.select_node(data.node)`.
Fix centrally: one `resolveNode(obj)` used by every public method.

### Treat unloaded lazy nodes as parents

jstree's `is_parent` is `state.loaded === false || children.length > 0`, and
`is_leaf` / `is_closed` build on it. Ours count only loaded children, so an
unloaded lazy node reports as a leaf and the Right arrow will not open it.

### Let keyboard handlers find the focused node the jstree way — done (3.3l)

Done: handlers get the keydown as jstree's delegated jQuery event presents
it — `target` / `currentTarget` are the focused anchor, the native event is
`originalEvent` — through a proxy over the native event, keeping the virtual
focus model. The problem as found:

jstree binds keydown on the focused anchor, so custom shortcuts conventionally
call `this.get_node(e.currentTarget)`. Ours binds on the container with
virtual focus (`aria-activedescendant`), so `e.currentTarget` is the container.
Options: real DOM focus with a roving tabindex, or exposing the focused node.
Until then a handler can read `aria-activedescendant` from the container.

### `check()` parity — done (3.3c-1)

Public `check(chk, obj, par, pos, more)`; jstree's structural rules (`core_08`
moving to the current position, `core_01` moving *or copying* into self or a
descendant); `check_callback` as a boolean, a function (only an exact `false`
refuses) or an operation map; jstree's per-operation callback arguments; `edit`
checked before an inline rename; `last_error()` in jstree's shape.

### `node.data` and `data.functions` (3.3c-2)

jstree nodes carry `node.data` (null when none) — consumers read
`data.node.data` constantly. `data.jstree` in node JSON overrides state and
icon, and `data.functions[op]` forbids (`core_02`) or permits an operation
regardless of `check_callback`: the parent's for move / copy / create, the
node's own otherwise.

### `get_json` output shape — done (3.3j)

Done: jstree's full shape (every field, the whole state, `data` as `{}`,
`children` as `[]`, `type` with the types plugin, `parent` when flat), node
references and all of jstree's options; and ingest layered as jstree's
`_parse_model_from_json` — state over `data.jstree` over the defaults,
`state.loaded` honored, `li_attr.id` / `a_attr.href` defaults — so output
loads back unchanged. The problem as found:

jstree always emits `id`, `text`, `icon`, `li_attr`, `a_attr`, the full
`state`, `data` (`false` under `no_data`) and `children`, and supports
`no_li_attr` / `no_a_attr`. Ours omits empty fields and falsy state flags and
ignores `no_data` (fixed for `data` in 3.3c-2). Consumers that round-trip
`get_json` output back into `core.data` see a different shape.

### Argument forms for `create_node` / `move_node` — done (3.3k)

Done for `create_node` (3.3k-1): the id return, string / omitted nodes, a
copied node with nested children, every position form (shared with move and
copy through `resolveInsertion`), lazy parents and the callback. Done for
`move_node` / `copy_node` (3.3k-2), through a shared `transfer`: the position
forms; jstree reading an
index against the children *before* the move (so moving a node down within
its parent lands one earlier than ours); arrays placed one after another;
lazy parents; the callbacks `(node, parent, position)`; and `move_node`
returning the node's id. The problem as found:

jstree's `create_node(par, node, pos)` accepts a string as `node` (becoming its
text) and — like `move_node` — string positions: `'first'`, `'last'`
(create's default), `'before'` / `'after'` (relative to `par`, inserting as
its sibling) and `'inside'`. It also creates a whole subtree when
`node.children` is an array; ours creates only the one node. (A null `par`
meaning the root is done, in 3.3a.)

### `core.data` as an ajax config or a string — done (3.3m)

Done: the ajax config (with `fetch`, jQuery's serialization, JSON / HTML by
content type, `core_04`), the HTML string (`core_06`), `{ d }` unwrapping and
single-node wrapping, and the same config for `search.ajax` and `massload`.
The item as found:

Besides an array and a function, jstree's `core.data` may be an ajax config —
`{ url, data, dataType, ... }`, where `url` and `data` may be functions of the
node — fetched for every load, the response parsed as JSON or HTML by its
content type (errors `core_04`); or a string of HTML for the root. This is how
many jstree trees lazy-load. Ours treats any non-function object as a JSON
array. The same config form is `search.ajax`'s. Implementing it means `fetch`
in place of `$.ajax`, with jQuery's `data` serialized into the query string
for GET.

### `copy_node` drops data and state in jstree — needs a decision

jstree's `copy_node` builds the copy from `get_json(obj, { no_id, no_data,
no_state })`, so a copy has no `data` and default state (only an unloaded
node stays unloaded). Ours deliberately deep-copies `data` and keeps state
bar selection (Phase 1, pinned by CopyNodeDeep and NodeData tests). Matching
jstree means dropping the data; keeping ours is a superset that jstree code
would not notice unless it relies on copies being bare. Left as is until
decided.

### `refresh_node` reloads, it does not redraw — done (3.3f)

Done: `refresh_node` reloads through an equivalent of jstree's `_load_nodes`,
reopens, reselects and emits `refresh_node { node, nodes }`. `load_node` drops
a loaded node's descendants when the reload starts (emitting `changed` with
action `load_node` if any were selected) and records `state.failed`; a lazy
node whose load fails no longer makes `open_node` retry until the stack
overflows. The problem as found:

jstree's `refresh_node(obj)` reloads the node and every open descendant from
the data source, then reopens them, reselects the prior selection and emits
`refresh_node { node, nodes }`. Ours only re-renders, so a branch changed on
the server never refreshes.

### `load_node` parity — done (3.3g)

Done: `load_node` returns true for any existing node and reports `status` in
the `load_node` event and callback; a data function is called with the tree
as `this` and may answer `false`; static data loads only the root (`core_05`
for any other node); with no data the root re-reads the container's original
markup, parsed in an inert document; an array loads what is not yet loaded
and calls back once with the loaded ids; and `open_node` loads any unloaded
node, whatever the data source. The problem as found:

With static data, jstree's `load_node` on a non-root node still drops the
node's children and marks it `failed`; when `core.data` is an array it also
reports `core_05` ("Could not load node"). On the root it re-parses the data.
Ours returns false and leaves the node alone, so `refresh_node` on a
static-data tree reloads nothing.

### HTML parsing and HTML-string data responses — done (3.3h)

Done (3.3h-1): the HTML parser follows jstree's `_parse_model_from_html` under
the codemod's names — `data-*` attributes into `data` (jQuery's conversion,
the `data-md-tree` payload under `data.jstree`), `md-tree-clicked` /
`md-tree-disabled` on the anchor, `md-tree-closed` without a child list as
lazy, the icon from a rendered `.md-tree-themeicon`, and state classes kept
out of `li_attr` / `a_attr`. Text is still read as plain text; jstree reads it
as HTML unless `force_text`, which belongs with `force_text` in 3.2.

Done (3.3h-2): a data function may answer with an HTML string, parsed as
jstree's `_append_html_data` does — the items of a top-level `<ul>`, otherwise
every top-level element — in an inert document, so nothing in a server
response loads or runs.

### `li_attr` / `a_attr` classes — done (3.3i)

Done: `li_attr.class` and `a_attr.class` render; a disabled node is marked on
its anchor, as jstree marks it; and the anchor id defaults to
`<node id>_anchor`, recorded in `a_attr.id` (a copy gets its own). jstree's
per-anchor ARIA attributes remain with 4.5. The problem as found:

jstree's `redraw_node` appends a node's `li_attr.class` to the `<li>` and its
`a_attr.class` to the anchor. Our renderer skips the `class` key of both, so
user classes from JSON or from parsed markup never render. The HTML parser
already strips the state classes jstree strips (3.3h-1), so applying the rest
is safe. This pairs with the types plugin's per-type `li_attr` / `a_attr`.

### Icon semantics — done (3.3e)

Done: `icon` defaults to `true`; class-list and URL icons render; `set_icon`,
`hide_icon` and `show_icon` work on `node.icon`; the `model` event lets the
types plugin write type icons into `node.icon` with jstree's `default`-type
resolution and merge, and `set_type` follows jstree's icon rule. The problem
as found:

jstree's default `icon` is `true` — the visible theme icon — and `false` means
hidden. Ours defaults to `false`, which the renderer treats as hidden, so
without the types plugin **no node shows an icon**. `hide_icon` / `show_icon`
in jstree update `node.icon` (and are array-capable); ours only toggle inline
style, so `get_icon` drifts and a redraw undoes them. jstree's types plugin
also writes the type's icon into `node.icon`, so `get_icon` reports it.

### Sort plugin semantics

jstree's comparator receives two **ids**, bound to the tree, and the default is
a case-sensitive `get_text(a) > get_text(b) ? 1 : -1`. Ours passes node
objects, unbound, compared case-insensitively — a jstree comparator using
`this.get_text(a)` crashes. The plugin also exposes `sort(obj, deep)`.

### Remaining missing methods

Missing public methods (excluding jQuery plumbing — `bind`/`unbind`/`trigger`,
for which `on`/`off`/`emit` are our equivalents — and internal lifecycle):

**Done.** `check` in 3.3c-1; `hover_node`, `dehover_node`, `get_container_ul`,
`get_string`, `get_type`, `set_type`, `get_theme_variant`, `redraw_node` and
the sort plugin's `sort` in 3.3d.

`check(operation, node, parent, position, more)` is the validation entry point
plugins hook; see 3.5.

## 3.4 Event parity — done

Done: `open_all` / `close_all` (below a node, through open / close_node, with
`{ node }`), open_node / close_node as no-ops on a node already in that state
(with open_node's return and callback), `hide_all` / `show_all` `{ nodes }`,
`init`, `destroy` and `restore_state`. `select_all` / `deselect_all` already
matched. `focus` / `blur` are DOM events in jstree, not tree events. The
section as first written:


Done elsewhere: `search` and `clear_search` (3.2c), `refresh_node` (3.3f),
`load_node` status (3.3g), `model` (3.3e).

Missing events consumers can observe:

```
select_all, deselect_all, open_all, close_all, search, clear_search,
refresh_node, restore_state, destroy, init, focus, blur
```

Payloads must match jstree's (e.g. `select_all` carries `{ selected }`).

## 3.5 Wire up `UniquePlugin` via the check chain — done

Done: an `onCheck` plugin hook after the core rules (consulted even when
data.functions permits), jstree's four unique checks and errors, and unique
naming for nodes created without text. `ConditionalSelectPlugin` could move
onto the same hook in Phase 4. The section as first written:


jstree's unique plugin hooks the **`check` function**, not the CRUD methods
(errors `unique_01` / `unique_04`). Extend `checkOperation` into a chain
plugins can join, rather than calling the plugin from `renameNode` /
`createNode` / `moveNode`. This also gives `ConditionalSelectPlugin` a natural
home and avoids more hardcoded plugin fields in the core.

## 3.6 Make `MassloadPlugin` reachable — done

Done as jstree's plugin rather than the earlier queue: `massload(ids,
callback)` batches the multi-node loads (`load_node` arrays, `refresh_node`,
`load_all`), each node loading from the answer or else `core.data`; and
`load_all` loads through that path until nothing is left. The ajax-config
form of `massload` goes with `core.data`'s (3.3). The section as first
written:


`queueLoad` / `queueLoadMultiple` are called from nowhere. Have `openNode`'s
lazy path delegate to it when registered; expose `getPlugin(name)`.

## 3.7 Make `disable_checkbox` real — done

Done: `state.checkbox_disabled` in the model, drawn on every render, events
only on change, jstree's return values, the click guard, and a CSS rule. The
section as first written:


Currently adds `md-tree-checkbox-disabled`, which has no CSS rule and is never
consulted. Add the rule, move the flag to `node.state`, and have the click path
respect it.

## 3.8 Safe defaults — done

- **Keyboard — done.** Defaults now match jstree exactly. The non-jstree
  `Delete` (which deleted the focused node), `Ctrl+X/C/V` and plain `Space`
  bindings are gone; consumers restore them through `core.keyboard`.
- **check_callback — done.** It defaults to `false`, as in jstree, so
  structural operations (and `edit`) are refused as `core_03` until the tree
  opts in. Tests that exercise operations opt in explicitly.

## 3.9 Dnd correctness — done

Done: drag start (3.9a — drag_selection, is_draggable, touch, thresholds,
large_drag_target, the helper, the swallowed click, Escape, event payloads)
and drops (3.9b — jstree's anchor thirds and order of preference, check while
dragging with the dnd context, inside_pos, copy / always_copy with live
modifiers, blank_space_drop, large_drop_target, open_timeout, the marker and
status, refusals reported), and dragging between trees with jstree's
auto-scroll (3.9c — `origin` / `is_multi` in move_node / copy_node). The
same-parent off-by-one below is gone with jstree's index semantics (3.3k).
The pointer backend drags by touch as `dnd.touch` allows, which covers most
of Tier C's `touch`. The section as first written:


Same-parent reorder off-by-one (index computed pre-removal, applied
post-removal); `setPointerCapture`; `preventDefault` on drag start;
configurable threshold; consult `check_callback` when `check_while_dragging`.

## 3.10 ContextMenu — done

Done as jstree's contextmenu plugin with its `$.vakata.context` menu:
activate-on-right-click, show_at_node, `items(node, callback)` with the tree
as `this` (async included), jstree's markup and default items, actions with
the anchor as `reference`, disabled items, keyboard navigation and shortcuts,
touch long-press, and `context_show` / `context_hide`. Labels stay text
rather than jstree's HTML (see the `force_text` decision). The section as
first written:


Genuinely async `items` (the callback form is currently read synchronously, so
an async resolver always yields an empty menu); pass the node element as
`reference` and real coordinates as `position`; arrow-key/Escape navigation for
`role="menu"`.

## 3.12 Decided parity work

- **`core.animation`** — *done.* Slide nodes open and closed over `animation` ms
  (open_node / close_node's `animation` argument overriding it), firing
  `after_open` / `after_close` when the slide ends.
- **`core.worker`** — *done.* Parse incoming JSON in a Web Worker (a Blob URL built
  from the parser), queueing loads while one is in flight, and falling back to
  the main thread where workers are unavailable. The parser is `buildModel`
  ([src/model.ts](src/model.ts)), self-contained so its source text runs in
  the worker; HTML, `create_node` and `copy_node` stay synchronous.
- **`dnd.use_html5`** — *done.* jstree's native HTML5 drag backend (`draggable`,
  `dragstart` / `dragover` / `drop`), on the same drop rules as the pointer
  backend.

## Phase 3 reviews — done

Correctness, regression surface and design, over the whole phase diff. Fixed,
each through its own red-green cycle:

- A worker load arriving after the tree changed attached a deleted node's
  children to the root, and left the children of a node whose id was taken
  meanwhile under the other node; both subtrees are now dropped.
- The clipboard diverged from jstree: a multi-node paste reversed its nodes,
  nothing pasted across trees, and the buffer and events had their own
  shapes. Ported (one page-wide buffer, paste through move_node / copy_node
  with the origin).
- `loadData`'s root-loaded step was written three times; now once.
- Docs: the `NodeRef` comment claimed selector lookups; the README selected a
  node straight after construction, which worker loads make too early.

## 3.13 Parity gaps from the post-phase audit

Found by auditing jstree 3.3.16's documented surface against ours once Phase 3
closed — its 75 documented options, 133 methods and 63 events — then extended
by a second pass over default *values*, event payload *fields* and the class
names we emit.

What the verification found sound: all 12 plugins exist; every documented
option is declared *and read*; every default value agrees, checked one by one
(each option jstree defaults to `true` is read as `!== false`, and `animation`
200, `open_timeout` 500, `inside_pos` 0 and `state.key` `'jstree'` match); all
63 documented events are emitted; and the only public method missing is
`get_rules`, the others being jQuery-plugin lifecycle internals (`bind`,
`unbind`, `teardown`, `trigger`, `plugin`, `draw_children`, `_redraw`,
`_node_changed`). The suite was green at 968 with typecheck, lint and build.

What it found wanting is the nine gaps below. Even so, this proves surface and
shape, not depth: that an option is declared, read and defaulted correctly, not
that every branch of its behavior matches.

Order: 3.13a before 3.13b (the rules check reads `get_rules`); 3.13c and 3.13h
are the largest; the rest are small and independent. Each is its own red-green
cycle; the three phase reviews run again over 3.13's diff before the phase
closes.

### 3.13a `get_rules(obj)`

jstree's types method (8310–8318): `get_type(obj, true)` with `max_depth`,
`max_children` and `valid_children` defaulting to `-1`, and false for an
unknown node. Add it to [TypesPlugin](src/plugins/TypesPlugin.ts) and expose it
on the core the way `sort` and `search` already are. `TypeConfig` gains the
three fields as real types rather than leaning on its index signature.

Tests (`TypesRulesParity`): the merged rules with the `-1` defaults, `default`
inheritance reflected, false for a missing node.

### 3.13b Types rules enforced through `check` — `types_01` / `02` / `03`

`max_children`, `max_depth` and `valid_children` are accepted in config and
reported by `get_type(obj, true)`, but nothing refuses an operation:
[TypesPlugin](src/plugins/TypesPlugin.ts) has no `onCheck`. jstree's types
plugin joins `check` for `create_node`, `move_node` and `copy_node`
(8261–8302), running all three rules unless the operation is a `move_node`
whose node is already among that parent's children — a reorder (8271). A
`copy_node` into the same parent is still checked.

- `max_children` — refuse when the parent already holds that many (`types_01`).
- `valid_children` — refuse a node whose type is not in the list (`types_02`).
- `max_depth` — measure the moved subtree's depth (its deepest descendant's
  `parents.length` less its own, plus 1; at least 1), then walk up from the
  parent, refusing at the first ancestor whose `max_depth` is exceeded and
  deepening by one each step (`types_03`).

Implement as an `onCheck` in the shape [UniquePlugin](src/plugins/UniquePlugin.ts)
already uses (3.5), returning `{ id, reason }` so the core reports it under
`plugin: 'types'`. `more.origin` names the tree a dragged node's depth is
measured in.

Tests (`TypesRulesParity`): a third child refused under `max_children: 2`,
while a reorder inside that parent is allowed and a copy into it is not;
`valid_children` refusing a foreign type and allowing a listed one; `max_depth`
refusing a move that is too deep, counting the dragged subtree rather than the
node alone; `-1` and undefined meaning unlimited; the refusal reaching
`core.error` / `last_error()` with the right id and plugin; a drag honoring it
(`check_while_dragging`).

### 3.13c Wholerow that behaves like jstree's

Ours inserts the strip and styles it; the plugin's actual point — clicking
anywhere on a row — does not work, because the strip sits at `z-index: -1`
and the core's click handler only looks for `.md-tree-anchor`. jstree
(8624–8715) also:

- marks the strip `jstree-wholerow-clicked` when the node is selected and
  `jstree-wholerow-hovered` when it is hovered, written as the node draws and
  kept in step on `changed`, `deselect_all` and `open_node`;
- forwards a click, double-click or context menu on the strip to the node's
  anchor, carrying the modifier keys — so a click on the blank part of a row
  selects, ctrl-click extends, and a right-click opens the node's menu;
- hovers the node on `mouseover` of the strip or an icon (never a disabled
  one) and dehovers on `mouseleave` of the node;
- forwards a click on a leaf's open/close icon to the anchor;
- hides the dots while it is on, and removes the strips on teardown.

The classes become the source of truth for the styling; the existing sibling
selectors in [styles.css](src/styles.css) stay as a fallback.

Constraints found while reviewing this plan:

- jstree's mousedown / touchstart forwarding is commented out (8663–8671), so a
  drag cannot begin on the strip there either. Leave it that way; `dnd`'s
  `large_drag_target` still starts drags from the node itself.
- jstree forwards the context menu only when the contextmenu plugin is active
  (`if (this._data.contextmenu)`). Ours listens for `contextmenu` on the
  container and requires a `.md-tree-anchor` target, so the strip has to
  re-dispatch a `contextmenu` MouseEvent on the anchor with the coordinates and
  modifiers.
- A forwarded click can be a synthetic `MouseEvent` on the anchor: the core's
  handler then focuses and activates the node, which is what jstree's
  `.trigger(tmp).trigger('focus')` amounts to. `stopImmediatePropagation` on
  the original keeps the core from handling it twice, and that works because
  `initPlugins()` runs before `bindEvents()`, so plugin listeners are
  registered first. The same ordering lets the strip pre-empt the core's
  open/close branch for a click on a leaf's ocl.
- The plugin needs `hover_node`, `dehover_node`, `activate_node`, `is_disabled`
  and `hide_dots`, none of which `TreePluginHost` exposes; reach them through
  the `as unknown as MDFolderTree` cast the dnd and contextmenu plugins use.

Tests (`WholerowParity`): clicking the strip selects and ctrl-clicking extends;
the two classes track selection and hover; a right-click on the strip opens the
menu for that node; dots hidden; strips gone after `destroy`; the existing
`WholerowPlugin` tests still green.

### 3.13d `conditionalselect` called with the tree as `this`

jstree calls the setting as `conditionalselect.call(this, this.get_node(obj), e)`;
[ConditionalSelectPlugin](src/plugins/ConditionalSelectPlugin.ts) calls it
bare, so a callback using `this.get_node(...)` throws — our modules are strict,
so `this` is undefined rather than the global. Bind it and declare
`this: MDFolderTree` on `ConditionalSelectCallback`. Test: a callback that
reads the tree through `this` decides the activation.

### 3.13e Theme CSS autoload — `core.themes.url` / `core.themes.dir`

`set_theme(name, _url)` ignores its second argument and `themes.dir` is not
declared (`themes.url` is). In jstree (4668–4692) a string URL is injected as a
`<link>` as given, `true` builds `<dir>/<name>/style.css` — `dir` falling back
to jstree's own script path plus `/themes` — and each URL is injected only
once, tracked in a module-level `themes_loaded`.

Port that with a module-level `Set`. For the `true` case: `themes.dir` when
set, else the directory our own script was loaded from (`document.currentScript`
for UMD, `import.meta.url` for ESM, read once at module load), and quietly skip
when neither is known, since inventing a path would only 404. Tests
(`ThemeUrlParity`): a string URL appends one link; the same URL twice appends
one; `true` with `dir` builds the path; `true` with nothing known appends
nothing; `set_theme` still swaps classes and emits.

### 3.13f `compute_elements_positions`, node levels, and where aria lives

jstree puts every aria attribute on the **anchor**, which carries
`role="treeitem"`, while the `<li>` is `role="none"`: `aria-selected` (2532),
`aria-disabled` (2539), `aria-expanded` (2575) and `aria-level` (2533, the
node's `parents.length`), plus `aria-setsize` and `aria-posinset` only when
`core.compute_elements_positions` is on (2534–2537). Ours puts `role="treeitem"`,
`aria-expanded`, `aria-selected` and `aria-disabled` on the `<li>`, and emits
no level or position at all.

Decision: follow jstree and move the whole set to the anchor, rather than add
two attributes to a structure that already diverges — assistive technology sees
one treeitem either way, and no test asserts the current placement (checked:
zero references across `__tests__`). Declare `compute_elements_positions` in
`CoreConfig`.

`renderNode` needs a node's index among its siblings and their count for
`aria-setsize` / `aria-posinset`. The root's parent is not in the node map
(`'#'` is deliberately outside the store), but both call sites — the roots loop
and the children loop — already compute `isLast` from exactly those two
numbers, so pass them through instead.

Tests (`AriaPositionParity`): `role="treeitem"` on the anchor and `role="none"`
on the `<li>`; `aria-level` deepening with nesting; `aria-selected` /
`aria-expanded` / `aria-disabled` on the anchor; `aria-setsize` /
`aria-posinset` only with the option, and following a move. This also settles
the first item of 4.5, which should then drop it.

### 3.13g Event payload fields

Five events carry less than jstree's, so a consumer reading the documented
fields gets `undefined`:

- `move_node` (4295) — jstree also sends `old_position`, `is_multi`,
  `is_foreign`, `old_instance` and `new_instance` beside our `node`, `parent`,
  `position` and `old_parent`.
- `copy_node` (4424) — those five plus `old_parent`. Our cross-tree path
  (`transferIn`) already sends `is_multi`, `old_instance` and `new_instance`,
  while the core path sends none of them; both should send the full set.
- `redraw` (2405) — jstree sends `nodes`, the ids it redrew; ours sends `{}`.
- `set_text` (3794) — jstree puts the node under `obj`, not `node`. Send `obj`
  and keep `node` alongside it, so neither set of consumers breaks.
- `delete_node` (4053–4055) — when any deleted node was selected, jstree fires
  `changed` afterwards with `{ action: 'delete_node', node, selected, parent }`.
  Ours drops them from the selection silently, so a `changed` listener never
  learns the selection shrank.

`old_position` is the node's index in its old parent before the move; for
`copy_node` it is the original's index in its own tree, `-1` when that cannot
be known, as jstree computes it. Tests (`EventPayloadParity`): each event's
full field set, including a cross-tree move and copy; `changed` after deleting
a selected node, and silence after deleting an unselected one.

### 3.13h Loading affordances

jstree both marks and shows loading; we do neither:

- a node being loaded carries `jstree-loading` and `aria-busy="true"` on its
  `<li>` while the load runs (added 1325–1328, removed 1355–1357), and the
  class is re-applied on any redraw while `state.loading` (2568). We keep
  `state.loading` in the model but render nothing from it, so a consumer's
  spinner CSS has nothing to attach to after the codemod.
- while the root loads, jstree renders a placeholder — `<li class="jstree-initial-node
  jstree-loading jstree-leaf jstree-last">` holding `get_string('Loading ...')`
  (616) — and removes it once the root load finishes (1604). We render an empty
  container.

This matters more since 3.12b: with `core.worker` on, a browser's initial load
finishes asynchronously, so the tree is visibly empty until the worker replies.
Add `md-tree-loading` / `aria-busy` in the renderer, and the placeholder in the
initial-load path, removed when the root's nodes arrive. Tests
(`LoadingStateParity`): the class and `aria-busy` present while a lazy load is
in flight and gone afterwards; the placeholder present before a worker-backed
root load resolves and gone after; its text taken from `get_string`.

### 3.13i Container flags and the drag helper's responsive class

- At init jstree sets `jstree-rtl` on the container when its computed
  `direction` is `rtl`, and `aria-multiselectable="true"` when `core.multiple`
  (591–595). We set neither.
- The drag helper takes `jstree-dnd-responsive` when `core.themes.responsive`;
  our `createHelper` adds the theme and variant classes but not that one.

Tests (`ContainerFlagsParity`): the rtl class following the computed direction;
`aria-multiselectable` present with `multiple` and absent without; the helper's
responsive class under `themes.responsive`.

### 3.13 as built

All nine are implemented, each through its own red-green cycle:

- **3.13a/b** — `get_rules` and the three rules in `check`. Implementing them
  turned up two more gaps, fixed in the same cycle: a type's `li_attr` /
  `a_attr` never reached its nodes, and the root was typed `'default'` rather
  than `'#'`, so `types: { '#': ... }` governed nothing.
- **3.13c** — the wholerow strip forwards click, double-click, context menu and
  hover to the anchor, carries both marks, and hides the dots. Its CSS no
  longer sits at `z-index: -1`; the anchor and open/close icon are raised
  instead, which is what lets the strip take the rest of the row's clicks.
- **3.13d** — `conditionalselect` bound to the tree.
- **3.13e** — theme stylesheet autoload, one injection per URL.
- **3.13f** — aria moved to the anchor with `role="treeitem"`, plus
  `aria-level` and the optional positions.
- **3.13g** — the event payloads, including the finding that a cross-tree move
  was emitted as a `copy_node`; it is a `move_node`, as jstree sends it.
- **3.13h** — the loading class, `aria-busy`, and the initial placeholder.
- **3.13i** — `md-tree-rtl`, `aria-multiselectable`, and the drag helper's
  responsive class.

### 3.13 reviews — done

Correctness, regression surface and design, over the 3.13 diff:

- Correctness and regression surface found nothing to fix. The depth walk ends
  at the root (typed `'#'` because the root node is built before the plugins
  start), `delete_node` reads the selection before removing anything,
  `transferIn` reads the origin position before the delete, and a create
  reaches the depth guard without a `children_d` to measure, so it counts 1.
  A pointerdown on the wholerow strip still cannot start a drag, as in jstree,
  while `large_drag_target` continues to drag from the node itself.
- Design, fixed here: hovering rewrote every row's mark when only two change,
  and `get_rules` re-added the `-1` defaults the types plugin had already
  folded in.

### Closing 3.13

CHANGELOG entries alongside the other Phase 3 parity sections — 3.13b, 3.13c,
3.13d, the aria move in 3.13f and `set_text`'s key in 3.13g are behavior
changes, while `get_rules`, `themes.dir`, `compute_elements_positions`, the
added event fields, the loading affordances and the container flags are
additions — then the three reviews over the 3.13 diff, then the status row back
to **Done**.

## 3.11 Tooling — done

Done: ESLint with typescript-eslint in a flat config (`eslint.config.mjs`),
`npm run lint` fixed and run in CI; the dead `.npmignore` and the `build:all`
alias deleted; and the codemod ships (`files` lists it), so the README's
`node_modules/` instruction works. The section as first written:


- `eslint` + `typescript-eslint` + flat config; fix the `lint` script; add a
  CI lint step.
- ~~Instance-scoped `StatePlugin` default key~~ — superseded: jstree's own
  default is the global `'jstree'` (3.2g); two trees on a page need their own
  `state.key` in jstree too.
- Delete the dead `.npmignore` and the `build:all` alias.
- Decide whether `scripts/` ships: README tells users to run the codemod from
  `node_modules/`, but `files: ["dist"]` excludes it.

---

# Phase 4 — Structure & performance

## 4.1 Plugin registry (OCP/DIP)
Replace the `initPlugins` if-chain with a registry plus `static
registerPlugin(name, factory)`. Move built-in registrations into a side-effect
module so a core-only consumer can tree-shake (all 12 plugins are statically
imported today). Drop the `checkboxPlugin` / `searchPlugin` fields for
`getPlugin<T>(name)`.

## 4.2 Split the god class (SRP)
`MDFolderTree` is ~2,200 lines. Extract in decreasing payoff: `TreeMutations`
(CRUD + reindex), `TreeKeyboard`, `TreeClipboard`, `TreeInlineEditor`,
`TreeThemeController`. Generate the snake_case alias layer from a single
`{snake: camel}` map instead of ~15 hand-written one-liners.

## 4.3 Rendering performance
Pass the store to the renderer and delete `getNodeMap()` (it rebuilds a full
`Map` on every call, including inside loops). Make `renderSingleNode` patch in
place rather than replacing the `<li>`, so focus, search state and the dnd
marker survive. Add `beginBatch()` / `endBatch()` so bulk CRUD renders once —
`MassloadPlugin` and cascade currently trigger O(n²) work.

## 4.4 Shared helpers (DRY)
`private el(id)` for the ~20 repeated `querySelector(#CSS.escape(id))` sites;
one `collectTopmost` / `collectBottommost` for the five duplicated
selection/checked walkers; one `setThemeFlag(cls, on)` behind the 12
show/hide/toggle methods. `loadData`'s three initial-load branches repeat
what `fetchChildren` / `appendChildren` do for `load_node`; jstree's init is
just `load_node('#')` plus lifecycle events, and ours could be too.

## 4.5 Accessibility
`aria-level`, `aria-setsize`, `aria-posinset`; focus the clicked node; CSS for
`md-tree-last`, `md-tree-checkbox-disabled`, and the dnd marker variants.

---

# Appendix — verified jstree reference

Facts below were confirmed against **jstree 3.3.16**
(`https://cdn.jsdelivr.net/npm/jstree@3.3.16/dist/jstree.js`). Line numbers are
from that file. Re-fetch it when working on parity rather than relying on
memory.

| Behavior | Location / evidence |
|---|---|
| `children_d` is the **deep** descendant list | Used at 4099 to reject "Moving parent inside child" |
| Cycle prevention on move | 4099 — `$.inArray(par.id, obj.children_d) !== -1` → `last_error`, `return false` |
| `check()` order | Structural checks precede the `check_callback` invocation |
| `ready` is asynchronous | `setTimeout(…, 0)` wrapping `trigger("ready")`, ~813–836 |
| `expand_selected_onload` | Implemented inside that same pre-`ready` block |
| `copy_node` is deep | 4375 — serializes the whole subtree via `get_json(obj, {no_id:true,…})`, then re-parses |
| Generated id format | `'j' + this._id + '_' + (++this._cnt)` (2128, 2272) — counter, never timestamp |
| No attribute sanitization | Zero matches for sanitize / escapeHTML / stripTags in the entire file |
| `select_node` | Enforces neither `multiple` nor `disabled` |
| `select_all` | Selects `root.children_d` wholesale; captures real `old_selection`; ignores `multiple` and `disabled` |
| `activate_node` | Where `multiple`, `disabled` and `allow_reselect` are enforced |
| Orphan node in flat JSON | 1862–1870 — sets `last_error` `core_07`, calls `core.error`, then `continue` (drops it) |
| `check_all` / `check_node` with `tie_selection` | Literally `return this.select_all()` / `return this.select_node(...)` — one list when tied |
| Checkbox cascade wiring | Listens to `select_node` / `deselect_node` when tied, `check_node` / `uncheck_node` when not |
| Sort plugin redraws | Binds `rename_node create_node` and `move_node copy_node` → `sort()` then `redraw_node()` |
| Unique plugin | Hooks the `check` function (errors `unique_01`, `unique_04`) |
| `activate_node` | Refuses disabled; enforces `multiple` / `allow_reselect`; ctrl/meta toggles; shift selects a range over `last_clicked`'s siblings; fires `activate_node` last |
| `select_node` / `deselect_node` | No-op if already in that state; `supress_event` withholds only `changed`; `select_node` opens ancestors via `_open_to` unless `prevent_open` |
| `deselect_all` | Emits `deselect_all` `{ node: previous, selected: [] }` even when suppressed |
| Changed plugin | Diffs against the last *emitted* selection; forgets it on `refresh` |
| Initial selection | `changed` with action `ready` fires just before `ready` when nodes arrive selected (~827) |
| Checkbox activation | Tied: a whole-node or checkbox click becomes a ctrl-click. Untied: toggles check independently of selection |
| `state.checked` in data | Read only when untied (the model handler sits inside `if(!tie_selection)`) |
| Default keyboard | `ctrl-space`, `enter`, `left`, `up`, `right`, `down`, `*`, `home`, `end`, `f2` — no `delete`, clipboard or plain `space` |
| `core.keyboard` | Deep-merged over defaults; combo parts sorted; handlers called with the instance as `this`; keydown from an `<input>` ignored |
| `get_next_dom` / `get_prev_dom` | Skip nodes with `offsetHeight === 0` (hidden, or inside a collapsed node) |
| `get_node(obj)` | Node object, id, `'#id'`, jQuery object, DOM element inside a node, or the container (→ root) |
| `is_parent` | `state.loaded === false \|\| children.length > 0` — unloaded lazy nodes are parents, hence closed |
| Types rules | 8261–8302 — the types plugin's `check`: `types_01` max_children, `types_02` valid_children, `types_03` max_depth; all three skipped only for a `move_node` whose node is already in `par.children` (8271) |
| `get_rules(obj)` | 8310–8318 — `get_type(obj, true)` with `max_depth` / `max_children` / `valid_children` defaulting to `-1` |
| Wholerow | 8624–8715 — forwards click / dblclick / contextmenu / mouseover from `.jstree-wholerow` to the anchor, but its mousedown / touchstart forwarding is commented out (8663–8671); `wholerow-clicked` / `-hovered` written in `redraw_node`; hides dots on `ready` |
| `conditionalselect` | Wraps `activate_node`, calling the setting with the instance as `this` and the node object |
| `set_theme(name, url)` | 4668–4692 — `url === true` → `<themes.dir>/<name>/style.css`; every URL injected once (`themes_loaded`) |
| aria placement | Every aria attribute sits on the anchor, which is `role="treeitem"`: `aria-selected` (2532), `aria-disabled` (2539), `aria-expanded` (2575), `aria-level` (2533). The `<li>` is `role="none"` (657, 666) |
| `compute_elements_positions` | 2534–2537 — `aria-setsize` / `aria-posinset` on the anchor, only with the option on |
| `move_node` / `copy_node` payloads | 4295 / 4424 — `node`, `parent`, `position`, `old_parent`, `old_position`, `is_multi`, `is_foreign`, `old_instance`, `new_instance`; copy adds `original` |
| `redraw` / `set_text` payloads | 2405 — `{ nodes }`; 3794 — `{ obj, text }`, the node under `obj` rather than `node` |
| `changed` after a delete | 4053–4055 — fired only when one of the deleted nodes was selected |
| Loading marks | 1325–1328 / 1355–1357 — `jstree-loading` + `aria-busy` on the node while it loads, re-applied on redraw (2568); the initial placeholder node at 616, removed at 1604 |
| Container flags | 591–595 — `jstree-rtl` from the computed direction; `aria-multiselectable` when `core.multiple` |

## How to verify a parity claim

```bash
curl -sL -o /tmp/jstree.js https://cdn.jsdelivr.net/npm/jstree@3.3.16/dist/jstree.js
grep -n "<option_or_method>" /tmp/jstree.js
```

An option is **live** if it appears outside jsdoc comments and its own default
declaration. Every option checked so far is live — assume a gap is ours, not
jstree's, until the source says otherwise.
