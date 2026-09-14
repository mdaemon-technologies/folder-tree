import type { MDFolderTree } from './MDFolderTree';

// ============================================================
// Core tree interfaces & types
// ============================================================

/** Raw node data as provided by the consumer (JSON or parsed from HTML). */
export interface TreeNodeData {
  id: string;
  text: string;
  /** True (the theme icon, the default), false (none), or a class list or image URL. */
  icon?: string | boolean | null;
  type?: string;
  children?: TreeNodeData[] | boolean;
  /** Layered over `data.jstree` and the defaults, as in jstree; any key is kept. */
  state?: {
    opened?: boolean;
    selected?: boolean;
    disabled?: boolean;
    checked?: boolean;
    loaded?: boolean;
    [key: string]: unknown;
  };
  li_attr?: Record<string, string>;
  a_attr?: Record<string, string>;
  /** User data. `get_json` reports it as `false` under `no_data`, as jstree does. */
  data?: Record<string, unknown> | false | null;
  [key: string]: unknown;
}

/** Internal node representation stored in the tree's flat map. */
export interface TreeNode {
  id: string;
  text: string;
  /** True for the theme icon, false for none, or a class list or image URL — as in jstree. */
  icon: string | boolean;
  type: string;
  parent: string;
  parents: string[];
  children: string[];
  children_d: string[];
  state: {
    opened: boolean;
    selected: boolean;
    disabled: boolean;
    loaded: boolean;
    loading: boolean;
    checked: boolean;
    hidden?: boolean;
    /** Set when the node's last load failed, as in jstree. */
    failed?: boolean;
    /** Set by disable_checkbox, as in jstree. */
    checkbox_disabled?: boolean;
  };
  li_attr: Record<string, string>;
  a_attr: Record<string, string>;
  /** The user data from the node's JSON, or null when there was none — as in jstree. */
  data: Record<string, unknown> | null;
  original: TreeNodeData;
}

// ============================================================
// Configuration interfaces
// ============================================================

/**
 * `core.data` as a function, as in jstree: called with the tree as `this` and
 * the node to load; answer with its children — as JSON, or as an HTML string
 * of `<li>` elements — or with `false` to fail the load.
 */
export type DataCallback = (
  this: MDFolderTree,
  node: TreeNode,
  callback: (data: TreeNodeData[] | string | false) => void,
) => void;

/**
 * jstree's ajax config — for `core.data`, `search.ajax` and `massload` —
 * sent with `fetch` as `$.ajax` would send it. `url` and `data` may be
 * functions (of the node, or for massload the ids), called with the tree as
 * `this`.
 */
export interface AjaxConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  url: string | ((this: MDFolderTree, arg: any) => string);
  data?: unknown;
  type?: string;
  method?: string;
  dataType?: string;
  contentType?: string | false;
  headers?: Record<string, string>;
  cache?: boolean;
  xhrFields?: { withCredentials?: boolean };
}

export interface CoreConfig {
  /**
   * The nodes: an array, a function, an ajax config, or an HTML string (for
   * the root) — as jstree's `core.data`. Absent, the container's markup.
   */
  data?: TreeNodeData[] | DataCallback | AjaxConfig | string | false;
  multiple?: boolean;
  animation?: number;
  themes?: ThemeConfig;
  /**
   * Validates structural operations, as jstree's: a boolean, a function, or a
   * map of operation names to booleans (`{ delete_node: false }`).
   */
  check_callback?: boolean | CheckCallback | Partial<Record<string, boolean>>;
  expand_selected_onload?: boolean;
  force_text?: boolean;
  dblclick_toggle?: boolean;
  /**
   * Write `aria-setsize` and `aria-posinset` on every node, which some
   * browsers otherwise compute wrongly for screen readers (default false).
   */
  compute_elements_positions?: boolean;
  worker?: boolean;
  /** Translations for UI strings: a map, or a function of the key (`this` is the tree). */
  strings?: Record<string, string> | ((this: MDFolderTree, key: string) => string);
  error?: (error: unknown) => void;
  loaded_state?: boolean;
  restore_focus?: boolean;
  allow_reselect?: boolean;
  /**
   * Shortcuts merged over jstree's defaults (`ctrl-space`, `enter`, the
   * arrows, `*`, `home`, `end`, `f2`). Keys are combos such as
   * `'ctrl-space'`; modifier order is irrelevant. A null entry disables that
   * default and `false` disables every shortcut. Returning false from a
   * handler prevents the default action.
   */
  keyboard?: Record<string, KeyboardHandler | null> | boolean;
  sanitize_attrs?: boolean;
}

export interface ThemeConfig {
  name?: string | false;
  /**
   * The theme's stylesheet: a URL to inject, or `true` to build
   * `<dir>/<name>/style.css`. False (the default) when it is already included.
   */
  url?: string | boolean;
  /** Where the themes live, for `url: true`. */
  dir?: string | false;
  dots?: boolean;
  icons?: boolean;
  ellipsis?: boolean;
  stripes?: boolean;
  variant?: string | false;
  responsive?: boolean;
}

export interface TypeConfig {
  icon?: string | boolean;
  /** The most children a node of this type may hold; -1 (the default) for any number. */
  max_children?: number;
  /** How deep below a node of this type nodes may go; -1 (the default) for any depth. */
  max_depth?: number;
  /** The types this type accepts as children; -1 (the default) for any type. */
  valid_children?: number | string[];
  /** Attributes given to the `<li>` of every node of this type. */
  li_attr?: Record<string, string>;
  /** Attributes given to the anchor of every node of this type. */
  a_attr?: Record<string, string>;
  [key: string]: unknown;
}

export interface CheckboxConfig {
  keep_selected_style?: boolean;
  visible?: boolean;
  three_state?: boolean;
  cascade?: string;
  tie_selection?: boolean;
  whole_node?: boolean;
  cascade_to_disabled?: boolean;
  cascade_to_hidden?: boolean;
}

export interface SearchConfig {
  show_only_matches?: boolean;
  show_only_matches_children?: boolean;
  close_opened_onclear?: boolean;
  case_sensitive?: boolean;
  fuzzy?: boolean;
  search_leaves_only?: boolean;
  /** Decides a match instead of the text matcher; called with the tree as `this`. */
  search_callback?: (this: MDFolderTree, str: string, node: TreeNode) => boolean;
  /**
   * Names nodes to load before searching, as jstree's function form: called
   * with the tree as `this`, the string, a callback taking the ids (or
   * `{ d: ids }`) and the `inside` node's id.
   */
  ajax?:
    | false
    | AjaxConfig
    | ((this: MDFolderTree, str: string, callback: (ids: string[] | { d: string[] }) => void, inside: string | null) => void);
}

/** What a context menu item's action, `_disabled` and `label` receive, as in jstree. */
export interface ContextMenuData {
  item: ContextMenuItem | string;
  /** The node's anchor; `tree.get_node(reference)` finds the node. */
  reference: HTMLElement | null;
  /** The menu. */
  element: HTMLElement | null;
  position?: { x: number; y: number };
}

/** A jstree context menu item. */
export interface ContextMenuItem {
  /** The label, drawn as text; or a function of the item's key and the reference. */
  label?: string | ((data: ContextMenuData) => string);
  title?: string;
  /** A class list, or an image URL (containing '/' or '.'). */
  icon?: string | false;
  /** Runs the item; returning false keeps the menu open. */
  action?: false | ((data: ContextMenuData) => unknown);
  separator_before?: boolean;
  separator_after?: boolean;
  _disabled?: boolean | ((data: ContextMenuData) => boolean);
  _class?: string;
  /** A key code that runs the item while the menu is open. */
  shortcut?: number;
  shortcut_label?: string;
  submenu?: Record<string, ContextMenuItem>;
  [key: string]: unknown;
}

export interface ContextMenuConfig {
  /** Activate the node on right-click (default true). */
  select_node?: boolean;
  /** Open at the node rather than the pointer (default true). */
  show_at_node?: boolean;
  /**
   * The items: an object, or a function of the node — called with the tree
   * as `this` — returning them or handing them to the callback.
   */
  items?:
    | Record<string, ContextMenuItem>
    | ((
        this: MDFolderTree,
        node: TreeNode,
        callback: (items: Record<string, ContextMenuItem>) => void,
      ) => Record<string, ContextMenuItem> | void);
}

export interface DndConfig {
  copy?: boolean;
  open_timeout?: number;
  /** Whether nodes may be dragged: a boolean, or called with the nodes and the event, the tree as `this`. */
  is_draggable?: boolean | ((this: MDFolderTree, nodes: TreeNode[], e: Event) => boolean);
  check_while_dragging?: boolean;
  always_copy?: boolean;
  inside_pos?: number | 'first' | 'last';
  drag_selection?: boolean;
  touch?: boolean | 'selected';
  large_drop_target?: boolean;
  large_drag_target?: boolean | string;
  /**
   * Drag with the browser's native drag and drop, as jstree's HTML5 backend,
   * where elements can be draggable (default false).
   */
  use_html5?: boolean;
  blank_space_drop?: boolean;
}

/**
 * jstree's `massload`: called with the tree as `this` and the ids of several
 * nodes about to load, answering with a map of id to children — JSON, or an
 * HTML string. A node the answer leaves out loads through `core.data`.
 */
export type MassloadCallback = (
  this: MDFolderTree,
  ids: string[],
  callback: (data: Record<string, TreeNodeData[] | string> | null | false) => void,
) => void;

/**
 * @deprecated The earlier `{ url, data, callback }` form never ran;
 * `massload` is now jstree's function, typed as `MassloadCallback`.
 */
export type MassloadConfig = MassloadCallback;

/**
 * A sort plugin comparator. As in jstree it receives two node ids, with the
 * tree as `this`, so it can call back into the API (`this.get_text(a)`).
 */
export type SortComparator = (this: MDFolderTree, a: string, b: string) => number;

export interface StateConfig {
  /** The localStorage key; 'jstree' by default, as in jstree. */
  key?: string;
  /** Events after which the state is saved (debounced by 100ms). */
  events?: string;
  /** Milliseconds a saved state stays valid; false (the default) for ever. */
  ttl?: number | false;
  /** Adjusts the state being restored; called with the tree as `this`. */
  filter?: (this: MDFolderTree, state: TreeState) => TreeState;
  /** Keep `core.loaded` when saving and restoring. */
  preserve_loaded?: boolean;
}

/**
 * jstree's state, as get_state reports it and set_state applies it. Plugins
 * add their own keys — the checkbox plugin its `checkbox` list.
 */
export interface TreeState {
  core?: {
    open?: string[];
    loaded?: string[];
    scroll?: { left?: number; top?: number };
    selected?: string[];
    initial_selection?: string;
  };
  checkbox?: string[];
  [plugin: string]: unknown;
}

/** The `{ opened, selected }` state of earlier releases, which set_state still accepts. */
export interface LegacyTreeState {
  opened?: string[];
  selected?: string[];
}

export interface UniqueConfig {
  case_sensitive?: boolean;
  trim_whitespace?: boolean;
  /** Names a duplicate, called with the tree as `this` and a counter from 2. */
  duplicate?: (this: MDFolderTree, name: string, counter: number) => string;
}

/** As in jstree, the callback is called with the tree as `this`. */
export type ConditionalSelectCallback = (this: MDFolderTree, node: TreeNode, event?: Event) => boolean;

export interface TreeConfig {
  core?: CoreConfig;
  types?: Record<string, TypeConfig>;
  checkbox?: CheckboxConfig;
  search?: SearchConfig;
  contextmenu?: ContextMenuConfig;
  dnd?: DndConfig;
  massload?: MassloadCallback | AjaxConfig | null;
  sort?: SortComparator;
  state?: StateConfig;
  unique?: UniqueConfig;
  conditionalselect?: ConditionalSelectCallback;
  plugins?: string[];
}

// ============================================================
// Plugin interface
// ============================================================

export interface TreePlugin {
  name: string;
  init(tree: TreePluginHost): void;
  destroy(): void;
  onNodeRender?(node: TreeNode, element: HTMLElement): void;
  onBeforeRender?(nodes: TreeNode[]): TreeNode[];
  onBeforeActivate?(node: TreeNode, event?: Event): boolean;
  /**
   * Join jstree's `check`: consulted after the core rules pass, return true
   * to allow the operation, or a refusal — jstree's error `id` and `reason`
   * — which the core reports under the plugin's name.
   */
  onCheck?(
    chk: string,
    node: TreeNode | TreeNodeData | null,
    parent: TreeNode | null,
    pos: unknown,
    more: CheckMore,
  ): true | { id: string; reason: string };
}

/** Subset of MDFolderTree exposed to plugins. */
export interface TreePluginHost {
  config: TreeConfig;
  getNode(id: string): TreeNode | null;
  getAllNodes(): TreeNode[];
  getNodeChildren(id: string): TreeNode[];
  getSelectedIds(): string[];
  getOpenedIds(): string[];
  selectNode(id: string, suppress?: boolean, preventOpen?: boolean, event?: ActivationEvent): void;
  deselectNode(id: string, suppress?: boolean, event?: ActivationEvent): void;
  /**
   * Change selection membership without events or opening ancestors — the
   * equivalent of jstree's checkbox cascade writing `_data.core.selected`
   * directly. The caller is responsible for repainting.
   */
  applySelection(ids: string[], selected: boolean): void;
  selectAll(suppress?: boolean): void;
  deselectAll(suppress?: boolean): void;
  /** Open a node; `animation` ms of slide (the core.animation setting by default, 0 for none). */
  openNode(id: string, suppress?: boolean, animation?: number | false): void;
  closeNode(id: string, suppress?: boolean, animation?: number | false): void;
  getContainer(): HTMLElement;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, detail: unknown): void;
  redrawNode(id: string): void;
  redraw(): void;
  moveNode(id: string, parentId: string, position: number): boolean;
  copyNode(id: string, parentId: string, position: number): string | false;
  renameNode(id: string, text: string): boolean;
  deleteNode(id: string): boolean;
  createNode(parentId: string, data: TreeNodeData, position?: number): TreeNode | false;
  reorderChildren(parentId: string, childIds: string[]): void;
  /** Reorder a parent's children in the model only, without rendering. */
  setChildOrder(parentId: string, childIds: string[]): void;
  getRootNodeIds(): string[];
}

// ============================================================
// Event types
// ============================================================

export type EventHandler = (event: CustomEvent) => void;

/**
 * Modifier state consulted by `activate_node`. Any DOM `MouseEvent` or
 * `KeyboardEvent` satisfies it; programmatic callers may pass a plain object.
 */
/**
 * Anything jstree accepts where it expects a node, as resolved by `get_node`:
 * a node object, an object carrying an `id`, an id (optionally '#'-prefixed),
 * a jQuery-style wrapper, a DOM element inside a node, or the container
 * itself (the root). Unlike jstree, a string that is not an id is not tried
 * as a CSS selector.
 */
export type NodeRef =
  | string
  | number
  | TreeNode
  | { id: string | number }
  | Element
  | ArrayLike<Element>;

/** Extra context jstree passes to `check_callback` for move_node / copy_node. */
export interface CheckMore {
  core?: boolean;
  origin?: unknown;
  is_multi?: boolean;
  is_foreign?: boolean;
  dnd?: boolean;
  [key: string]: unknown;
}

/**
 * `core.check_callback` as a function. As in jstree, `node` is the new node's
 * data for create_node, and `position` is the new text for rename_node and
 * the node's index for delete_node. Only a return of exactly `false` refuses.
 */
export type CheckCallback = (
  operation: string,
  node: TreeNode,
  parent: TreeNode,
  position: number | string,
  more: CheckMore,
) => boolean | void;

/** A `core.keyboard` shortcut. As in jstree, `this` is the tree instance. */
export type KeyboardHandler = (this: MDFolderTree, e: KeyboardEvent) => boolean | void;

export interface ActivationEvent {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

export interface SelectNodeDetail {
  node: TreeNode;
  selected: string[];
  event?: Event;
}

export interface DeselectNodeDetail {
  node: TreeNode;
  selected: string[];
  event?: Event;
}

export interface ChangedDetail {
  action: string;
  node: TreeNode | null;
  selected: string[];
  old_selection: string[];
  changed?: {
    selected: string[];
    deselected: string[];
  };
  /** The event that triggered the change, when there was one. */
  event?: unknown;
  /** The parent a deleted node hung from, as jstree reports on `delete_node`. */
  parent?: string;
}

export interface OpenNodeDetail {
  node: TreeNode;
}

export interface CloseNodeDetail {
  node: TreeNode;
}

export interface ReadyDetail {
  instance: unknown;
}

export interface DblClickDetail {
  node: TreeNode;
  event: MouseEvent;
}
