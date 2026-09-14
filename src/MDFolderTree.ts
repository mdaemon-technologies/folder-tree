import type {
  TreeConfig,
  TreeNode,
  TreeNodeData,
  TreePlugin,
  TreePluginHost,
  EventHandler,
  DataCallback,
  ChangedDetail,
  ActivationEvent,
  NodeRef,
  CheckMore,
  TypeConfig,
  AjaxConfig,
  TreeState,
  LegacyTreeState,
} from './types';
import { TreeEventBus } from './events/TreeEventBus';
import { TreeRenderer } from './TreeRenderer';
import { TreeSelection } from './TreeSelection';
import { TreeNodeStore } from './TreeNode';
import { buildModel, type ModelOutput } from './model';
import { HtmlParser } from './parsers/HtmlParser';
import { TreeClipboard, type ClipboardBuffer } from './TreeClipboard';
import { TreeInlineEditor, type EditCallback } from './TreeInlineEditor';
import { TreeKeyboard } from './TreeKeyboard';
import { isNodeVisible } from './dom';
import { EVENT_NS } from './events/namespace';
import { TreeThemeController } from './TreeThemeController';
// Type-only: the core constructs no plugin itself. The built-ins register
// themselves under their names in `./plugins/register`, which the package
// entries import, so nothing here names a plugin implementation.
import type { TypesPlugin } from './plugins/TypesPlugin';
import type { CheckboxPlugin } from './plugins/CheckboxPlugin';
import type { SearchPlugin } from './plugins/SearchPlugin';
import type { SortPlugin } from './plugins/SortPlugin';
import type { UniquePlugin } from './plugins/UniquePlugin';
import type { MassloadPlugin } from './plugins/MassloadPlugin';
import { isAjaxConfig, sendAjax } from './ajax';

/** The `more` argument jstree passes to check() for a same-tree move or copy. */
const CORE_MORE: CheckMore = { core: true, is_multi: false, is_foreign: false };

export class MDFolderTree implements TreePluginHost {
  readonly config: TreeConfig;
  private element: HTMLElement;
  private eventBus: TreeEventBus;
  private renderer: TreeRenderer;
  private selection: TreeSelection;
  private store: TreeNodeStore;
  private plugins: TreePlugin[] = [];
  /**
   * The same plugins, under the names this tree built them by. A plugin's own
   * `name` is what it reports itself as -- in a refusal, say -- which is not
   * necessarily the name it was registered and listed under.
   */
  private pluginsByName = new Map<string, TreePlugin>();
  /** Cut / copy / paste, over a buffer the whole page shares. */
  private clipboard = new TreeClipboard(this);
  /** Renaming a node in place. */
  private inlineEditor = new TreeInlineEditor(this);
  /** Keyboard navigation, and the virtual focus it moves. */
  private keyboard = new TreeKeyboard(this);
  /**
   * The theme, its variant and the display flags. The renderer keeps its own
   * copy of the theme name, so it is handed a setter rather than exposed.
   */
  private theme = new TreeThemeController(this, (name) => this.renderer.setThemeName(name));
  private htmlParser: HtmlParser;
  private destroyed = false;
  private idCounter = 0;
  /**
   * Owns every listener bound directly to the container. `destroy()` aborts
   * it, which is the only way these come off — the event bus tracks just the
   * handlers registered through `on()`.
   */
  private listeners = new AbortController();
  /**
   * Ordered container for top-level nodes. Deliberately kept out of the store
   * so `getAllNodes()` and every consumer of it stay unaffected, while
   * `'#'` still resolves to a real node with an ordered `children` array.
   */
  private rootNode!: TreeNode;
  /**
   * Anchor for shift-range selection, mirroring jstree's
   * `_data.core.last_clicked`. Revalidated on every activation.
   */
  private lastClicked: string | null = null;
  /** Slides in progress, by node, each finishing itself when called. */
  private slides = new Map<string, () => void>();
  /** The worker's Blob URL, made once; loads wait their turn while one is in it. */
  private workerUrl: string | null = null;
  private working = false;
  private workQueue: Array<() => void> = [];
  /**
   * Selection as of the last `changed` event. Diffs are computed against it,
   * as jstree's changed plugin does, so a suppressed intermediate step (such
   * as the `deselect_all(true)` inside a click) still shows in the next diff.
   */
  private lastChangedSelection: string[] = [];
  /**
   * Whether any changed event has been emitted. The initial ready report
   * exists to seed the diff baseline, so it is skipped once something else
   * has seeded it: the tree loads synchronously, so a consumer can select a
   * node before the deferred ready report runs.
   */
  private changedEmitted = false;
  /** The container's markup as first given, which jstree re-reads to reload the root of an HTML tree. */
  private originalHtml: string | null = null;

  constructor(element: HTMLElement, config: TreeConfig = {}) {
    if (!element || !element.classList) {
      throw new Error('MDFolderTree: a valid DOM element is required as the first argument.');
    }
    this.element = element;
    this.config = this.mergeDefaults(config);
    this.eventBus = new TreeEventBus(element);
    this.store = new TreeNodeStore();
    this.rootNode = this.createRootNode();
    this.selection = new TreeSelection();
    this.htmlParser = new HtmlParser();

    // Initialize plugins
    this.initPlugins();
    this.renderer = new TreeRenderer(
      element,
      this.store,
      this.plugins,
      this.config.core?.sanitize_attrs ?? true,
      (error) => this.reportError(error),
      this.config.core?.compute_elements_positions === true,
    );

    // Apply theme classes
    this.theme.applyClasses();
    this.applyContainerFlags();

    // jstree's `init`: bound and themed, not yet loading.
    this.emit(`init.${EVENT_NS}`, {});

    if (!this.config.core?.data) this.originalHtml = element.innerHTML;

    // Load data and render
    this.loadData();

    // Bind DOM event delegation
    this.bindEvents();

    // Keyboard navigation
    this.keyboard.bind(this.listeners.signal, () => this.destroyed);
  }

  // ---- Public API (md-tree-compatible, no jQuery required) ----

  /**
   * jstree's `get_node`: resolve any node reference (see `NodeRef`) to the
   * node, or with `asDom` to its element — the container for the root.
   * Returns false when nothing matches, as jstree does.
   */
  get_node(obj: NodeRef, asDom?: boolean): TreeNode | HTMLElement | false {
    const node = this.resolveNode(obj);
    if (!node) return false;
    if (!asDom) return node;
    if (node.id === '#') return this.element;
    return (this.element.querySelector(`#${CSS.escape(node.id)}`) as HTMLElement | null) ?? false;
  }

  getNode(id: string): TreeNode | null {
    return this.store.get(id);
  }

  select_node(obj: NodeRef | NodeRef[], suppressEvent = false, preventOpen = false, event?: ActivationEvent): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.select_node(item, suppressEvent, preventOpen, event);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    this.selectNode(id, suppressEvent, preventOpen, event);
  }

  /**
   * Programmatic selection, matching jstree's `select_node`: it applies no
   * policy (`core.multiple` and `disabled` are enforced by `activate_node`,
   * not here), is a no-op for an already-selected node, and opens collapsed
   * ancestors unless `preventOpen`. `suppress` withholds only `changed`;
   * `select_node` is always emitted.
   */
  selectNode(id: string, suppress = false, preventOpen = false, event?: ActivationEvent): void {
    const node = this.store.get(id);
    if (!node || this.selection.isSelected(id)) return;

    this.selection.select(id);
    this.syncSelectionFlags();

    if (!preventOpen) this.openAncestors(node);
    this.renderer.renderSingleNode(node);

    this.emit(`select_node.${EVENT_NS}`, { node, selected: this.selection.getSelected(), event });
    if (!suppress) this.emitChanged('select_node', node, event);
  }

  deselect_node(obj: NodeRef | NodeRef[], suppressEvent = false, event?: ActivationEvent): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.deselect_node(item, suppressEvent, event);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    this.deselectNode(id, suppressEvent, event);
  }

  /**
   * Matches jstree's `deselect_node`: a no-op for a node that is not
   * selected; `suppress` withholds only `changed`.
   */
  deselectNode(id: string, suppress = false, event?: ActivationEvent): void {
    const node = this.store.get(id);
    if (!node || !this.selection.isSelected(id)) return;

    this.selection.deselect(id);
    this.syncSelectionFlags();
    this.renderer.renderSingleNode(node);

    this.emit(`deselect_node.${EVENT_NS}`, { node, selected: this.selection.getSelected(), event });
    if (!suppress) this.emitChanged('deselect_node', node, event);
  }

  select_all(suppress = false): void {
    const oldSelection = this.selection.getSelected();
    // Every node, disabled included, as jstree selects `root.children_d`.
    this.selection.selectAll(this.store.getAllIds());
    this.syncSelectionFlags();
    this.renderer.render(this.getRootNodes());

    this.emit(`select_all.${EVENT_NS}`, { selected: this.selection.getSelected() });
    if (!suppress) this.emitChanged('select_all', null, undefined, oldSelection);
  }

  deselect_all(suppress = false): void {
    const oldSelection = this.selection.getSelected();
    this.selection.deselectAll();
    this.syncSelectionFlags();
    this.renderer.render(this.getRootNodes());

    this.emit(`deselect_all.${EVENT_NS}`, { selected: [], node: oldSelection });
    if (!suppress) this.emitChanged('deselect_all', null, undefined, oldSelection);
  }

  /**
   * jstree's `activate_node`: the entry point for user interaction (click,
   * Enter). Unlike the programmatic selection API it enforces
   * `core.multiple`, `disabled` and `allow_reselect`, toggles on ctrl/meta
   * and selects sibling ranges on shift. Returns false when refused.
   */
  activate_node(obj: NodeRef, event: ActivationEvent = {}): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;

    // jstree's conditionalselect wraps activate_node, so it runs first.
    if (!this.invokeBeforeActivate(node, event instanceof Event ? event : undefined)) return false;

    let ctrl = !!event.ctrlKey;
    const meta = !!event.metaKey;
    const shift = !!event.shiftKey;

    // jstree's checkbox plugin overrides activate_node: while checking is tied
    // to selection a checkbox click behaves as a ctrl-click (toggle); when it
    // is not, the checkbox toggles independently of selection.
    const checkbox = this.checkboxPlugin;
    if (checkbox) {
      // jstree ignores a click on a disabled checkbox.
      if (this.isCheckboxTarget(event) && node.state.checkbox_disabled) return false;
      const tie = this.config.checkbox?.tie_selection !== false;
      const wholeNode = this.config.checkbox?.whole_node !== false;
      const onCheckbox = this.isCheckboxTarget(event);
      if (tie && (wholeNode || onCheckbox)) ctrl = true;
      if (!tie && (wholeNode || onCheckbox)) {
        if (node.state.disabled) return false;
        if (node.state.checked) checkbox.uncheck_node(id, event);
        else checkbox.check_node(id, event);
        this.emit(`activate_node.${EVENT_NS}`, { node });
        return true;
      }
    }

    if (node.state.disabled) return false;

    this.applyActivation(node, event, ctrl, meta, shift);
    this.emit(`activate_node.${EVENT_NS}`, { node, event });
    return true;
  }

  /** Change selection membership silently; see `TreePluginHost.applySelection`. */
  applySelection(ids: string[], selected: boolean): void {
    for (const id of ids) {
      if (!this.store.has(id)) continue;
      if (selected) this.selection.select(id);
      else this.selection.deselect(id);
    }
    this.syncSelectionFlags();
  }

  selectAll(suppress = false): void {
    this.select_all(suppress);
  }

  deselectAll(suppress = false): void {
    this.deselect_all(suppress);
  }

  get_selected(): string[] {
    return this.getSelectedIds();
  }

  getSelectedIds(): string[] {
    return this.selection.getSelected();
  }

  /**
   * jstree's `open_node(obj, callback, animation)`. Returns false for a
   * missing node, the root, or a node that is not closed — which emits
   * nothing — and true once it opens a node. An unloaded node is loaded first
   * and nothing is returned. The callback receives the node and whether it
   * was opened.
   */
  open_node(
    obj: NodeRef | NodeRef[],
    callback?: (node: TreeNode, status: boolean) => void,
    animation?: number | false,
  ): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.open_node(item, callback, animation);
      return true;
    }
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    if (!this.is_closed(node)) {
      callback?.(node, false);
      return false;
    }
    if (!node.state.loaded) {
      // As in jstree: wait out a load in progress, or load first.
      if (node.state.loading) {
        setTimeout(() => this.open_node(node, callback, animation), 500);
        return;
      }
      this.load_node(node, (loaded, ok) => {
        if (ok) this.open_node(loaded, callback, animation);
        else callback?.(loaded, false);
      });
      return;
    }
    this.openNode(node.id, false, animation);
    callback?.(node, true);
    return true;
  }

  /**
   * jstree's `close_node(obj, animation)`: false for a missing node, the
   * root, or a closed node, which emits nothing.
   */
  close_node(obj: NodeRef | NodeRef[], animation?: number | false): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.close_node(item, animation);
      return true;
    }
    const node = this.resolveNode(obj);
    if (!node || node.id === '#' || this.is_closed(node)) return false;
    this.closeNode(node.id, false, animation);
  }

  /**
   * jstree's `open_all(obj, animation)`: open every closed node below `obj`
   * (the root by default) through open_node — loading lazy nodes and opening
   * what they load — then emit `open_all` with the node.
   */
  open_all(obj?: NodeRef, animation?: number | false): boolean | void {
    const start = this.resolveNode(obj ?? '#');
    if (!start) return false;
    let pending = 0;
    let done = false;
    const finish = (): void => {
      if (done || pending > 0) return;
      done = true;
      this.emit(`open_all.${EVENT_NS}`, { node: start });
    };
    const openBelow = (node: TreeNode): void => {
      // Held while queueing, so a node that opens at once cannot finish
      // the whole run before its later siblings are queued.
      pending++;
      const closed = [node, ...this.descendantsOf(node)].filter((n) => n.id !== '#' && this.is_closed(n));
      for (const target of closed) {
        pending++;
        this.open_node(target, (opened, status) => {
          pending--;
          if (status && this.is_parent(opened)) openBelow(opened);
          finish();
        }, animation || 0);
      }
      pending--;
    };
    openBelow(start);
    finish();
  }

  /**
   * jstree's `close_all(obj, animation)`: close every open node below `obj`
   * (the root by default), deepest first, through close_node, then emit
   * `close_all` with the node.
   */
  close_all(obj?: NodeRef, animation?: number | false): boolean | void {
    const start = this.resolveNode(obj ?? '#');
    if (!start) return false;
    const below = [start, ...this.descendantsOf(start)];
    for (const node of below.reverse()) {
      if (node.id !== '#' && node.state.opened && this.is_parent(node)) this.close_node(node, animation || 0);
    }
    for (const node of this.descendantsOf(start)) node.state.opened = false;
    this.emit(`close_all.${EVENT_NS}`, { node: start });
  }

  /** A node's descendants, in tree order. */
  private descendantsOf(node: TreeNode): TreeNode[] {
    return node.children_d
      .map((id) => this.store.get(id))
      .filter((n): n is TreeNode => n !== null && n !== undefined);
  }

  enable_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.enable_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    const node = this.store.get(id);
    if (!node) return;
    node.state.disabled = false;
    this.renderer.renderSingleNode(node);
    this.emit(`enable_node.${EVENT_NS}`, { node });
  }

  disable_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.disable_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    const node = this.store.get(id);
    if (!node) return;
    node.state.disabled = true;
    this.renderer.renderSingleNode(node);
    this.emit(`disable_node.${EVENT_NS}`, { node });
  }

  /**
   * jstree's `refresh_node`: reload the node and every open node inside it
   * through `core.data`, then reopen them, reselect the selected nodes that
   * still exist, and emit `refresh_node` with `{ node, nodes }` — the ids
   * that reloaded.
   */
  refresh_node(obj: NodeRef): boolean {
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;

    const selected = this.selection.getSelected();
    const openInside = node.children_d.filter((id) => this.store.get(id)?.state.opened);
    const opened = node.state.opened ? [node.id, ...openInside] : openInside;
    this.loadNodes([node.id, ...openInside], (nodes) => {
      this.open_node(opened, undefined, 0);
      this.select_node(selected);
      this.emit(`refresh_node.${EVENT_NS}`, { node, nodes });
    }, true);
    return true;
  }

  redrawNode(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    this.renderer.renderSingleNode(node);
  }

  /**
   * The search plugin's `search(str, skip_async, show_only_matches, inside,
   * append, show_only_matches_children)`; returns the ids it matched.
   */
  search(
    str: string | false,
    skipAsync?: boolean,
    showOnlyMatches?: boolean,
    inside?: NodeRef | null,
    append?: boolean,
    showOnlyMatchesChildren?: boolean,
  ): string[] {
    if (!this.searchPlugin) return [];
    return this.searchPlugin.search(str, skipAsync, showOnlyMatches, inside, append, showOnlyMatchesChildren);
  }

  clear_search(): void {
    if (this.searchPlugin) {
      this.searchPlugin.clearSearch();
    }
  }

  // ---- Checkbox API (delegated to plugin) ----

  check_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.check_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    if (this.checkboxPlugin) this.checkboxPlugin.check_node(id);
  }

  uncheck_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.uncheck_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    if (this.checkboxPlugin) this.checkboxPlugin.uncheck_node(id);
  }

  check_all(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.check_all();
  }

  uncheck_all(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.uncheck_all();
  }

  is_checked(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    if (this.checkboxPlugin) return this.checkboxPlugin.is_checked(id);
    return false;
  }

  get_checked(): string[] {
    if (this.checkboxPlugin) return this.checkboxPlugin.get_checked();
    return [];
  }

  get_top_checked(): string[] {
    if (this.checkboxPlugin) return this.checkboxPlugin.get_top_checked();
    return [];
  }

  get_bottom_checked(): string[] {
    if (this.checkboxPlugin) return this.checkboxPlugin.get_bottom_checked();
    return [];
  }

  get_undetermined(): string[] {
    if (this.checkboxPlugin) return this.checkboxPlugin.get_undetermined();
    return [];
  }

  is_undetermined(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    if (this.checkboxPlugin) return this.checkboxPlugin.is_undetermined(id);
    return false;
  }

  show_checkboxes(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.show_checkboxes();
  }

  hide_checkboxes(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.hide_checkboxes();
  }

  toggle_checkboxes(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.toggle_checkboxes();
  }

  /** jstree's `disable_checkbox`: false for a missing node or the root. */
  disable_checkbox(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.disable_checkbox(item);
      return true;
    }
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    this.checkboxPlugin?.disable_checkbox(node.id);
  }

  /** jstree's `enable_checkbox`: false for a missing node or the root. */
  enable_checkbox(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.enable_checkbox(item);
      return true;
    }
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    this.checkboxPlugin?.enable_checkbox(node.id);
  }

  get_checked_descendants(obj: NodeRef): string[] {
    const id = this.resolveId(obj);
    if (id === null) return [];
    if (!this.checkboxPlugin) return [];
    const node = this.store.get(id);
    if (!node) return [];
    const result: string[] = [];
    const walk = (nid: string) => {
      const n = this.store.get(nid);
      if (!n) return;
      for (const cid of n.children) {
        const child = this.store.get(cid);
        if (child?.state.checked) result.push(cid);
        walk(cid);
      }
    };
    walk(id);
    return result;
  }

  // ---- Snake_case CRUD aliases (jstree API compatibility) ----

  /**
   * jstree's `move_node(obj, par, pos, callback, is_loaded)`, returning the
   * node's id. `pos` defaults to 0 and takes create_node's forms; an index is
   * read against the children as they are before the move. An array's nodes
   * are placed one after another. An unloaded parent is loaded first, and the
   * callback receives the node, its new parent and its position.
   */
  move_node(
    obj: NodeRef | NodeRef[],
    par: NodeRef,
    pos: number | string = 0,
    callback?: (node: TreeNode, parent: TreeNode, position: number) => void,
    isLoaded = false,
    _skipRedraw = false,
    origin?: MDFolderTree,
  ): string | boolean {
    return this.transfer('move', obj, par, pos, callback, isLoaded, origin);
  }

  /**
   * jstree's `copy_node(obj, par, pos, callback, is_loaded, skip_redraw,
   * origin)`, returning the copy's id; its arguments work as move_node's.
   */
  copy_node(
    obj: NodeRef | NodeRef[],
    par: NodeRef,
    pos: number | string = 0,
    callback?: (node: TreeNode, parent: TreeNode, position: number) => void,
    isLoaded = false,
    _skipRedraw = false,
    origin?: MDFolderTree,
  ): string | boolean {
    return this.transfer('copy', obj, par, pos, callback, isLoaded, origin);
  }

  /** The argument handling move_node and copy_node share, as in jstree. */
  private transfer(
    mode: 'move' | 'copy',
    obj: NodeRef | NodeRef[],
    par: NodeRef,
    pos: number | string,
    callback: ((node: TreeNode, parent: TreeNode, position: number) => void) | undefined,
    isLoaded: boolean,
    origin?: MDFolderTree,
  ): string | boolean {
    const target = this.resolveNode(par);
    if (!target) return false;
    if (pos !== 'before' && pos !== 'after' && !isLoaded && !target.state.loaded) {
      return this.load_node(target, () => {
        this.transfer(mode, obj, target, pos, callback, true, origin);
      });
    }

    if (Array.isArray(obj)) {
      if (obj.length !== 1) {
        // Each node goes after the one before it.
        let anchor: NodeRef = target;
        let where = pos;
        for (const item of obj) {
          const placed = this.transfer(mode, item, anchor, where, callback, true, origin);
          if (typeof placed === 'string') {
            anchor = placed;
            where = 'after';
          }
        }
        return true;
      }
      obj = obj[0];
    }

    const foreign = origin && origin !== this ? origin : null;
    const node = foreign ? ((foreign.get_node(obj as NodeRef) || null) as TreeNode | null) : this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    const { parent, index } = this.resolveInsertion(target, pos);
    if (foreign) return this.transferIn(mode, node, foreign, parent, index, callback);

    if (mode === 'copy') {
      const copyId = this.copyNode(node.id, parent.id, index);
      if (!copyId) return false;
      callback?.(this.store.get(copyId)!, parent, index);
      return copyId;
    }
    if (!this.moveNode(node.id, parent.id, index)) return false;
    callback?.(node, parent, parent.children.indexOf(node.id));
    return node.id;
  }

  /**
   * A node from another tree, as jstree's move / copy take one: copied in from
   * its JSON — without ids, data or state — once `check` allows it as
   * `is_multi`, then, for a move, deleted from its own tree.
   */
  private transferIn(
    mode: 'move' | 'copy',
    node: TreeNode,
    origin: MDFolderTree,
    parent: TreeNode,
    index: number,
    callback: ((node: TreeNode, parent: TreeNode, position: number) => void) | undefined,
  ): string | false {
    const more = { core: true, origin, is_multi: true, is_foreign: false };
    if (!this.check(mode === 'copy' ? 'copy_node' : 'move_node', node, parent, index, more)) return false;
    const json = origin.get_json(node, { no_id: true, no_data: true, no_state: true }) as TreeNodeData;
    // Where it sat in its own tree, read before the move takes it away.
    const originParent = origin.get_node(node.parent) as TreeNode | false;
    const oldPosition = originParent ? originParent.children.indexOf(node.id) : -1;
    const copy = this.buildAt(parent, json, index);
    if (mode === 'move') origin.delete_node(node.id);
    // As in jstree, a move between trees is still a move_node; only a copy is
    // a copy_node, and only that carries the original.
    this.emit(`${mode === 'move' ? 'move_node' : 'copy_node'}.${EVENT_NS}`, {
      node: copy,
      ...(mode === 'copy' ? { original: node } : {}),
      parent: parent.id,
      position: index,
      old_parent: node.parent,
      old_position: oldPosition,
      is_multi: true,
      is_foreign: false,
      old_instance: origin,
      new_instance: this,
    });
    callback?.(copy, parent, index);
    return copy.id;
  }

  /**
   * jstree's `create_node(par, node, pos, callback, is_loaded)`, returning the
   * new node's id. A null `par` means the root. `node` may be a string (its
   * text) or omitted, and its text defaults to `get_string('New node')`.
   * `pos` defaults to 'last' (see `resolveInsertion` for the other forms). An
   * unloaded parent is loaded first, unless `is_loaded` says it already is.
   */
  create_node(
    par: NodeRef | null,
    node?: TreeNodeData | string,
    pos: number | string = 'last',
    callback?: (node: TreeNode) => void,
    isLoaded = false,
  ): string | boolean {
    const target = this.resolveNode(par === null || par === undefined ? '#' : par);
    if (!target) return false;
    if (pos !== 'before' && pos !== 'after' && !isLoaded && !target.state.loaded) {
      return this.load_node(target, () => {
        this.create_node(target, node, pos, callback, true);
      });
    }

    const data = (typeof node === 'string' ? { text: node } : { ...node }) as TreeNodeData;
    if (data.text === undefined) data.text = this.newNodeName(target);
    const { parent, index } = this.resolveInsertion(target, pos);
    const created = this.createNode(parent.id, data, index);
    if (!created) return false;
    callback?.(created);
    return created.id;
  }

  /**
   * The text of a node created without one: `get_string('New node')`, which
   * the unique plugin makes unique among `par`'s children, as jstree's does.
   */
  private newNodeName(par: TreeNode): string {
    const base = this.get_string('New node');
    const unique = this.getPlugin<UniquePlugin>('unique');
    return unique ? unique.newNodeName(par, base) : base;
  }

  /**
   * jstree's position forms, relative to `par`: 'before' / 'after' place the
   * node beside it (first / last when `par` is the root), 'first' / 'inside'
   * at the start of its children, 'last' at the end, and an index — clamped
   * to the end — where it says.
   */
  private resolveInsertion(par: TreeNode, pos: number | string): { parent: TreeNode; index: number } {
    let where = pos;
    if (par.id === '#') {
      if (where === 'before') where = 'first';
      if (where === 'after') where = 'last';
    }
    let parent = par;
    let index: number;
    switch (where) {
      case 'before':
      case 'after':
        parent = this.resolveParent(par.parent) ?? this.rootNode;
        index = parent.children.indexOf(par.id) + (where === 'after' ? 1 : 0);
        break;
      case 'first':
      case 'inside':
        index = 0;
        break;
      case 'last':
        index = parent.children.length;
        break;
      default:
        index = Number(where) || 0;
    }
    return { parent, index: Math.min(index, parent.children.length) };
  }

  rename_node(obj: NodeRef | NodeRef[], text: string): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.rename_node(item, text);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return false;
    return this.renameNode(id, text);
  }

  delete_node(obj: NodeRef | NodeRef[]): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.delete_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return false;
    return this.deleteNode(id);
  }

  get_container(): HTMLElement {
    return this.getContainer();
  }

  // ---- Theme Runtime API ----

  /**
   * jstree's `set_theme(name, url)`: swap the theme's classes and, given a
   * URL — or `true`, meaning `<themes.dir>/<name>/style.css` — inject that
   * stylesheet, each one only once per page.
   */
  set_theme(name: string, url?: string | boolean): void {
    this.theme.setTheme(name, url);
  }

  get_theme(): string {
    return this.theme.getTheme();
  }

  set_theme_variant(variant: string | false): void {
    this.theme.setThemeVariant(variant);
  }

  get_theme_variant(): string | false {
    return this.theme.getThemeVariant();
  }

  // ---- jstree methods: hover, container, strings, types, redraw ----

  /**
   * jstree's `hover_node`: mark a node hovered, dehovering any other first.
   * Returns false when the node is unknown or already hovered. Unlike jstree
   * it does not set `aria-activedescendant`, which here tracks keyboard focus.
   */
  hover_node(obj: NodeRef): false | void {
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    const anchor = this.element.querySelector(`#${CSS.escape(node.id)} > .md-tree-anchor`);
    if (!anchor || anchor.classList.contains('md-tree-hovered')) return false;

    const previous = this.element.querySelector('.md-tree-hovered')?.closest('.md-tree-node');
    if (previous) this.dehover_node(previous.id);

    anchor.classList.add('md-tree-hovered');
    this.emit(`hover_node.${EVENT_NS}`, { node });
  }

  /** jstree's `dehover_node`; returns false when the node is not hovered. */
  dehover_node(obj: NodeRef): false | void {
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    const anchor = this.element.querySelector(`#${CSS.escape(node.id)} > .md-tree-anchor`);
    if (!anchor || !anchor.classList.contains('md-tree-hovered')) return false;

    anchor.classList.remove('md-tree-hovered');
    this.emit(`dehover_node.${EVENT_NS}`, { node });
  }

  /** jstree's `get_container_ul`: the root list element. */
  get_container_ul(): HTMLElement | null {
    return this.element.querySelector(':scope > .md-tree-container-ul');
  }

  /** jstree's `get_string`: translate a UI string through `core.strings`. */
  get_string(key: string): string {
    const strings = this.config.core?.strings;
    if (typeof strings === 'function') return strings.call(this, key);
    if (strings && strings[key]) return strings[key];
    return key;
  }

  /**
   * jstree's `get_type`: the node's type, or with `rules` the type merged
   * with its `types` configuration. False for an unknown node.
   */
  get_type(obj: NodeRef, rules = false): string | Record<string, unknown> | false {
    const node = this.resolveNode(obj);
    if (!node) return false;
    return rules ? { type: node.type, ...(this.typeRules(node.type) ?? {}) } : node.type;
  }

  /**
   * jstree's `set_type`. Refuses a type absent from `types`. A node showing
   * its old type's icon adopts the new one; an icon set on the node itself is
   * kept, as in jstree.
   */
  set_type(obj: NodeRef | NodeRef[], type: string): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.set_type(item, type);
      return true;
    }
    const node = this.resolveNode(obj);
    const rule = this.typeRules(type);
    if (!rule || !node || node.id === '#') return false;

    // jstree adopts the new type's icon when the node showed the theme icon,
    // had an unknown type, or showed its old type's icon.
    const oldRule = this.typeRules(node.type);
    const oldIcon = node.icon;
    node.type = type;
    if (oldIcon === true || !oldRule || (oldRule.icon !== undefined && oldIcon === oldRule.icon)) {
      node.icon = rule.icon !== undefined ? rule.icon : true;
    }
    this.redrawNode(node.id);
    return true;
  }

  /**
   * The types plugin's `get_rules`: the node's type merged with its rules and
   * jstree's `-1` defaults for `max_depth`, `max_children` and
   * `valid_children`. False for an unknown node.
   */
  get_rules(obj: NodeRef): Record<string, unknown> | false {
    const node = this.resolveNode(obj);
    if (!node) return false;
    const plugin = this.getPlugin<TypesPlugin>('types');
    // jstree's defaults, which the plugin already folds in for a live tree.
    const rules = plugin
      ? plugin.rulesWithDefaults(node.type)
      : { max_children: -1, max_depth: -1, valid_children: -1, ...(this.config.types?.[node.type] ?? {}) };
    return { type: node.type, ...rules };
  }

  /**
   * The sort plugin's `sort(obj, deep)`: order a node's children in the model
   * (every descendant's too when `deep`). A no-op without the sort plugin.
   */
  sort(obj: NodeRef, deep = false): void {
    const id = this.resolveId(obj);
    const plugin = this.getPlugin<SortPlugin>('sort');
    if (id !== null && plugin) plugin.sortNode(id, deep);
  }

  /**
   * A type's rules: from the types plugin when active (which, as jstree,
   * fills unset properties from 'default'), otherwise from `config.types`.
   */
  private typeRules(type: string): TypeConfig | undefined {
    const plugin = this.getPlugin<TypesPlugin>('types');
    return plugin ? plugin.rules(type) : this.config.types?.[type];
  }

  /** jstree's `redraw_node`: re-render a node, returning its element. */
  redraw_node(obj: NodeRef): HTMLElement | false {
    const node = this.resolveNode(obj);
    if (!node || node.id === '#') return false;
    this.renderer.renderSingleNode(node);
    return (this.element.querySelector(`#${CSS.escape(node.id)}`) as HTMLElement | null) ?? false;
  }

  // ---- State API ----

  /**
   * jstree's `get_state`: `{ core: { open, loaded, scroll, selected } }` —
   * `loaded` only with `core.loaded_state` — plus the checked nodes as
   * `checkbox` while checking is not tied to selection.
   */
  get_state(): TreeState {
    const core = {
      open: [] as string[],
      loaded: [] as string[],
      scroll: { left: this.element.scrollLeft, top: this.element.scrollTop },
      selected: [] as string[],
    };
    for (const node of this.store.getAll()) {
      if (node.state.loaded && this.config.core?.loaded_state) core.loaded.push(node.id);
      if (node.state.opened) core.open.push(node.id);
      if (node.state.selected) core.selected.push(node.id);
    }
    const state: TreeState = { core };
    const checkbox = this.checkboxPlugin;
    if (checkbox && this.config.checkbox?.tie_selection === false) {
      state.checkbox = checkbox.get_checked();
    }
    return state;
  }

  /**
   * jstree's `set_state`, applied step by step: `core.loaded` (with
   * `core.loaded_state`) and `core.open` are loaded — then the open ones
   * opened, without closing others — `core.scroll` is scrolled to, and
   * `core.selected` replaces the selection unless it changed since the call
   * began; the checkbox plugin's `checkbox` list is checked. Keys of plugins
   * not in use are dropped. Once done it calls back and emits `set_state`.
   * The `{ opened, selected }` state of earlier releases is accepted too.
   */
  set_state(state: TreeState | LegacyTreeState | null | undefined, callback?: () => void): boolean {
    if (!state || typeof state !== 'object') return false;
    return this.applyState(this.stateShape(state), callback);
  }

  /** A state in jstree's shape, translating the earlier `{ opened, selected }`. */
  private stateShape(state: TreeState | LegacyTreeState): TreeState {
    const legacy = state as LegacyTreeState;
    if (!('core' in state) && ('opened' in legacy || 'selected' in legacy)) {
      return { core: { open: legacy.opened, selected: legacy.selected } };
    }
    return state as TreeState;
  }

  private applyState(state: TreeState, callback?: () => void): boolean {
    const core = state.core;
    if (core) {
      if (core.selected && core.initial_selection === undefined) {
        core.initial_selection = [...this.selection.getSelected()].sort().join(',');
      }
      if (core.loaded) {
        if (!this.config.core?.loaded_state || !Array.isArray(core.loaded) || core.loaded.length === 0) {
          delete core.loaded;
          return this.applyState(state, callback);
        }
        this.loadNodes(core.loaded.map(String), () => {
          delete core.loaded;
          this.applyState(state, callback);
        });
        return false;
      }
      if (core.open) {
        if (!Array.isArray(core.open) || core.open.length === 0) {
          delete core.open;
          return this.applyState(state, callback);
        }
        this.loadNodes(core.open.map(String), (nodes) => {
          this.open_node(nodes, undefined, 0);
          delete core.open;
          this.applyState(state, callback);
        });
        return false;
      }
      if (core.scroll) {
        if (core.scroll.left !== undefined) this.element.scrollLeft = core.scroll.left;
        if (core.scroll.top !== undefined) this.element.scrollTop = core.scroll.top;
        delete core.scroll;
        return this.applyState(state, callback);
      }
      if (core.selected) {
        const current = [...this.selection.getSelected()].sort().join(',');
        if (core.initial_selection === undefined || core.initial_selection === current) {
          this.deselect_all();
          if (Array.isArray(core.selected)) {
            for (const id of core.selected) this.select_node(String(id), false, true);
          }
        }
        delete core.initial_selection;
        delete core.selected;
        return this.applyState(state, callback);
      }
      for (const key of Object.keys(state)) {
        if (key !== 'core' && !this.getPlugin(key)) delete state[key];
      }
      // Anything else in core has no step; it would otherwise stall the state.
      delete state.core;
      return this.applyState(state, callback);
    }

    // The checkbox plugin's step, while checking is not tied to selection.
    if (state.checkbox !== undefined) {
      const checkbox = this.checkboxPlugin;
      if (checkbox && this.config.checkbox?.tie_selection === false) {
        checkbox.uncheck_all();
        if (Array.isArray(state.checkbox)) {
          for (const id of state.checkbox) checkbox.check_node(String(id));
        }
      }
      delete state.checkbox;
      return this.applyState(state, callback);
    }

    for (const key of Object.keys(state)) {
      if (!this.getPlugin(key)) delete state[key];
    }
    if (Object.keys(state).length === 0) {
      callback?.();
      this.emit(`set_state.${EVENT_NS}`, {});
      return false;
    }
    return true;
  }

  // ---- Additional Utility Methods ----

  get_children_dom(obj: NodeRef): HTMLElement[] {
    const id = this.resolveId(obj);
    if (id === null) return [];
    const selector = id === '#'
      ? '.md-tree-container-ul > .md-tree-node'
      : `#${CSS.escape(id)} > .md-tree-children > .md-tree-node`;
    return Array.from(this.element.querySelectorAll(selector)) as HTMLElement[];
  }

  is_loading(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.loading;
  }

  private lastError: unknown = null;

  last_error(): unknown {
    return this.lastError;
  }

  destroy(): void {
    if (this.destroyed) return;
    // As in jstree, `destroy` fires first, while the tree is intact.
    this.emit(`destroy.${EVENT_NS}`, {});
    this.destroyed = true;
    for (const finish of [...this.slides.values()]) finish();
    this.workQueue = [];
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }

    for (const plugin of this.plugins) {
      plugin.destroy();
    }

    // Detach every listener bound directly to the container.
    this.listeners.abort();

    this.keyboard.setFocused(null);
    this.clipboard.forget();

    this.eventBus.destroy();
    this.store.clear();
    this.rootNode.children = [];
    this.rootNode.children_d = [];
    this.element.removeAttribute('aria-multiselectable');
    this.element.removeAttribute('aria-busy');
    this.theme.teardown();
    this.element.classList.remove(
      'md-tree',
      'md-tree-rtl',
      'md-tree-loading',
      'md-tree-checkbox-no-clicked',
      'md-tree-checkbox-selection',
      'md-tree-no-checkboxes',
    );
    this.element.innerHTML = '';

    // Remove instance reference
    delete (this.element as unknown as Record<string, unknown>).__mdFolderTree;
  }

  // ---- TreePluginHost implementation ----

  getContainer(): HTMLElement {
    return this.element;
  }

  on(event: string, handler: EventHandler): void {
    this.eventBus.on(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.eventBus.off(event, handler);
  }

  emit(event: string, detail: unknown): void {
    this.eventBus.emit(event, detail);
  }

  // ---- New TreePluginHost methods ----

  getAllNodes(): TreeNode[] {
    return this.store.getAll();
  }

  getNodeChildren(id: string): TreeNode[] {
    const node = this.store.get(id);
    if (!node) return [];
    return node.children.map((cid) => this.store.get(cid)!).filter(Boolean);
  }

  getOpenedIds(): string[] {
    return this.store.getAll().filter((n) => n.state.opened).map((n) => n.id);
  }

  /**
   * Open a node, as jstree's open_node: `before_open` and `open_node` at
   * once, `after_open` when its children have slid down over `animation` ms
   * (the core.animation setting by default; 0 or false for none).
   */
  openNode(id: string, suppress = false, animation?: number | false): void {
    const node = this.store.get(id);
    if (!node) return;
    // As in jstree, opening an open node does nothing.
    if (node.state.opened && node.state.loaded) return;

    // If the node hasn't been loaded yet, trigger lazy loading first
    if (!node.state.loaded && !node.state.loading) {
      // As in jstree, open only once the load succeeds; a failed load
      // leaves the node closed rather than retrying.
      this.load_node(id, (_node, ok) => {
        if (ok) this.openNode(id, suppress, animation);
      });
      return;
    }

    if (!suppress) {
      this.emit(`before_open.${EVENT_NS}`, { node });
    }
    node.state.opened = true;
    this.renderer.renderSingleNode(node);
    if (!suppress) this.emit(`open_node.${EVENT_NS}`, { node });
    this.slide(node.id, 'down', this.animationFor(animation), () => {
      if (!suppress) this.emit(`after_open.${EVENT_NS}`, { node });
    });
  }

  /** Close a node, as jstree's close_node: `close_node` at once, `after_close` once the slide ends. */
  closeNode(id: string, suppress = false, animation?: number | false): void {
    const node = this.store.get(id);
    if (!node) return;
    node.state.opened = false;
    this.renderer.renderSingleNode(node);
    if (!suppress) this.emit(`close_node.${EVENT_NS}`, { node });
    this.slide(node.id, 'up', this.animationFor(animation), () => {
      if (!suppress) this.emit(`after_close.${EVENT_NS}`, { node });
    });
  }

  /** The slide length for an open or close: the argument, else core.animation; 0 for none. */
  private animationFor(animation?: number | false): number {
    const ms = animation === undefined ? this.config.core?.animation : animation;
    return typeof ms === 'number' && ms > 0 ? ms : 0;
  }

  /**
   * jstree's slideDown / slideUp of a node's children over `ms`, then `done`
   * — at once without an animation or a rendered list. A new slide of the
   * same node finishes the previous one first, as jQuery's `.stop(true, true)`
   * does; a destroyed tree fires nothing more.
   */
  private slide(id: string, direction: 'down' | 'up', ms: number, done: () => void): void {
    this.slides.get(id)?.();
    const list = ms
      ? (this.element.querySelector(`#${CSS.escape(id)} > .md-tree-children`) as HTMLElement | null)
      : null;
    if (!list) {
      done();
      return;
    }

    const full = list.scrollHeight;
    list.style.overflow = 'hidden';
    // A closed node's children are hidden by the stylesheet; keep them shown
    // while they slide up.
    list.style.display = 'block';
    list.style.height = direction === 'down' ? '0px' : `${full}px`;
    void list.offsetHeight;
    list.style.transition = `height ${ms}ms`;
    list.style.height = direction === 'down' ? `${full}px` : '0px';

    const finish = (): void => {
      clearTimeout(timer);
      this.slides.delete(id);
      for (const prop of ['overflow', 'display', 'height', 'transition']) list.style.removeProperty(prop);
      if (!this.destroyed) done();
    };
    const timer = setTimeout(finish, ms);
    this.slides.set(id, finish);
  }

  redraw(): void {
    this.renderer.render(this.getRootNodes());
    // As in jstree, the event carries the nodes that were drawn.
    this.emit(`redraw.${EVENT_NS}`, { nodes: Array.from(this.element.querySelectorAll('.md-tree-node')) });
  }

  moveNode(id: string, parentId: string, position: number): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    // Resolve the destination before mutating, so a refused move is a no-op.
    const newParent = this.resolveParent(parentId);
    if (!newParent) {
      this.reportError({ error: 'missing_parent', operation: 'move_node', id, parent: parentId, position });
      return false;
    }

    // Structural rules (no cycle, not the current position), then check_callback.
    if (!this.check('move_node', node, newParent, position, CORE_MORE)) return false;

    // As in jstree, the position is read against the children before the
    // move, so a node moved down within its own parent lands one earlier.
    const oldIndex = newParent.children.indexOf(id);
    let pos = Math.min(position, newParent.children.length);
    if (oldIndex !== -1 && pos > oldIndex) pos--;

    // Remove from old parent, noting where it sat for the event.
    const oldParent = this.resolveParent(node.parent);
    const oldPosition = oldParent ? oldParent.children.indexOf(id) : -1;
    if (oldParent) {
      oldParent.children = oldParent.children.filter((cid) => cid !== id);
      oldParent.children_d = oldParent.children_d.filter((cid) => cid !== id);
    }

    // Add to new parent
    newParent.children.splice(pos, 0, id);
    newParent.children_d.push(id);

    // Update node's parent reference; derived ancestry is rebuilt below.
    node.parent = parentId;
    this.reindex();

    this.renderer.render(this.getRootNodes());
    this.emit(`move_node.${EVENT_NS}`, {
      node,
      parent: parentId,
      position: pos,
      old_parent: oldParent?.id ?? '#',
      old_position: oldPosition,
      is_multi: false,
      is_foreign: false,
      old_instance: this,
      new_instance: this,
    });
    return true;
  }

  copyNode(id: string, parentId: string, position: number): string | false {
    const original = this.store.get(id);
    if (!original) return false;

    const newParent = this.resolveParent(parentId);
    if (!newParent) {
      this.reportError({ error: 'missing_parent', operation: 'copy_node', id, parent: parentId, position });
      return false;
    }

    if (!this.check('copy_node', original, newParent, position, CORE_MORE)) return false;

    // Where the original sits, which the event reports.
    const originalParent = this.resolveParent(original.parent);
    const oldPosition = originalParent ? originalParent.children.indexOf(id) : -1;
    const newId = this.copySubtree(original, parentId, new Set());
    const copy = this.store.get(newId)!;

    const pos = Math.min(position, newParent.children.length);
    newParent.children.splice(pos, 0, newId);
    this.reindex();
    this.emitModel([newId, ...copy.children_d], parentId);

    this.renderer.render(this.getRootNodes());
    this.emit(`copy_node.${EVENT_NS}`, {
      node: copy,
      original,
      parent: parentId,
      position: pos,
      old_parent: original.parent,
      old_position: oldPosition,
      is_multi: false,
      is_foreign: false,
      old_instance: this,
      new_instance: this,
    });
    return newId;
  }

  /**
   * Recursively duplicate `source` and its descendants under `parentId`,
   * minting a fresh id for every node and detaching all mutable objects from
   * the source. Returns the id of the new subtree root.
   */
  private copySubtree(source: TreeNode, parentId: string, seen: Set<string>): string {
    seen.add(source.id);

    const newId = this.mintId(`${source.id}_copy`);
    const copy: TreeNode = {
      ...source,
      id: newId,
      parent: parentId,
      parents: this.buildParentChain(parentId),
      children: [],
      children_d: [],
      state: { ...source.state, selected: false, checked: false },
      li_attr: { ...source.li_attr, id: newId },
      // As in jstree, whose copy drops the anchor id, the copy's anchor gets its own.
      a_attr: { ...source.a_attr, id: `${newId}_anchor` },
      data: source.data === null ? null : this.cloneData(source.data),
      original: this.cloneData(source.original),
    };
    this.store.set(newId, copy);

    for (const childId of source.children) {
      const child = this.store.get(childId);
      if (!child || seen.has(childId)) continue;
      const copiedChildId = this.copySubtree(child, newId, seen);
      copy.children.push(copiedChildId);
      copy.children_d.push(copiedChildId, ...this.store.get(copiedChildId)!.children_d);
    }

    return newId;
  }

  /** Deep-clone consumer-supplied node data, tolerating non-cloneable values. */
  private cloneData<T extends object>(data: T): T {
    try {
      return structuredClone(data);
    } catch {
      try {
        return JSON.parse(JSON.stringify(data)) as T;
      } catch {
        return { ...data };
      }
    }
  }

  renameNode(id: string, text: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    if (!this.check('rename_node', node, node.parent, text)) return false;

    const oldText = node.text;
    node.text = text;
    this.renderer.renderSingleNode(node);
    this.emit(`rename_node.${EVENT_NS}`, { node, text, old: oldText });
    return true;
  }

  deleteNode(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    const index = this.resolveParent(node.parent)?.children.indexOf(id) ?? -1;
    if (!this.check('delete_node', node, node.parent, index)) return false;

    // As in jstree, losing a selected node is reported as a change afterwards.
    const hadSelected = [id, ...node.children_d].some((removed) => this.selection.isSelected(removed));

    // Remove from parent
    const parent = this.resolveParent(node.parent);
    if (parent) {
      parent.children = parent.children.filter((cid) => cid !== id);
      parent.children_d = parent.children_d.filter((cid) => cid !== id);
    }

    // Remove node and all descendants from store
    const removeRecursive = (nid: string): void => {
      const n = this.store.get(nid);
      if (!n) return;
      for (const child of n.children) {
        removeRecursive(child);
      }
      this.selection.deselect(nid);
      this.store.delete(nid);
    };
    removeRecursive(id);
    this.reindex();

    this.renderer.render(this.getRootNodes());
    this.emit(`delete_node.${EVENT_NS}`, { node, parent: parent?.id ?? '#' });
    if (hadSelected) {
      this.syncSelectionFlags();
      this.emitChanged('delete_node', node, undefined, undefined, { parent: parent?.id ?? '#' });
    }
    return true;
  }

  createNode(parentId: string, data: TreeNodeData, position?: number): TreeNode | false {
    const parent = this.resolveParent(parentId);
    if (!parent) return false;

    // Unspecified position means last, as in jstree.
    const checkPosition = position === undefined
      ? parent.children.length
      : Math.min(position, parent.children.length);
    if (!this.check('create_node', data, parentId, checkPosition)) return false;

    if (data.id && this.store.has(data.id)) {
      this.reportError({ error: 'duplicate_id', operation: 'create_node', id: data.id, parent: parentId });
      return false;
    }

    const node = this.buildAt(parent, data, position);
    this.emit(`create_node.${EVENT_NS}`, { node, parent: parentId, position });
    return node;
  }

  /**
   * Build `data` under `parent` at `position` (the end when omitted): from a
   * copy, so the caller's object is left alone, with nested children built as
   * a whole subtree through the same normalization as a load. As in jstree,
   * the node goes under `parent` whatever `parent` it names itself.
   */
  private buildAt(parent: TreeNode, data: TreeNodeData, position?: number): TreeNode {
    const copy = { ...this.cloneData(data), id: data.id || this.mintId('new') } as TreeNodeData;
    delete copy.parent;
    this.buildNodeTree([copy], parent.id);
    const node = this.store.get(copy.id)!;

    // buildNodeTree appends; move the new node to its position.
    const pos = position != null ? Math.min(position, parent.children.length - 1) : parent.children.length - 1;
    parent.children = parent.children.filter((cid) => cid !== node.id);
    parent.children.splice(pos, 0, node.id);
    this.reindex();
    this.emitModel([node.id, ...node.children_d], parent.id);

    this.renderer.render(this.getRootNodes());
    return node;
  }

  /**
   * Reorder a parent's children in the model without rendering. Kept separate
   * from `reorderChildren` so render-time hooks can adjust ordering without
   * re-entering the renderer.
   */
  setChildOrder(parentId: string, childIds: string[]): void {
    const parent = this.resolveParent(parentId);
    if (!parent) return;
    parent.children = childIds;
  }

  reorderChildren(parentId: string, childIds: string[]): void {
    this.setChildOrder(parentId, childIds);
    this.renderer.render(this.getRootNodes());
  }

  getRootNodeIds(): string[] {
    return [...this.rootNode.children];
  }

  // ---- Core Utility Methods (Phase 1) ----

  get_parent(obj: NodeRef): string | null {
    const id = this.resolveId(obj);
    if (id === null) return null;
    const node = this.store.get(id);
    if (!node) return null;
    return node.parent;
  }

  get_path(obj: NodeRef, glue: string | false = '/', ids = false): string | string[] | false {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;

    const path: string[] = [];
    let current: TreeNode | null = node;
    while (current && current.id !== '#') {
      path.unshift(ids ? current.id : current.text);
      current = current.parent !== '#' ? this.store.get(current.parent) : null;
    }

    if (glue === false) return path;
    return path.join(glue);
  }

  get_text(obj: NodeRef): string | false {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.text;
  }

  set_text(obj: NodeRef | NodeRef[], text: string): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.set_text(item, text);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    const old = node.text;
    node.text = text;
    this.renderer.renderSingleNode(node);
    // jstree names the node `obj` here; `node` and `old` are ours, kept.
    this.emit(`set_text.${EVENT_NS}`, { obj: node, node, text, old });
    return true;
  }

  /**
   * jstree's `get_json`: each node as `{ id, text, icon, li_attr, a_attr,
   * state, data, children }` — with `type` when the types plugin is active —
   * or, with `flat`, a pre-order list whose entries carry `parent` instead of
   * `children`. The root, or no argument, yields its children. `no_id` drops
   * ids (li_attr and a_attr ids too), `no_data` reports data as false, and
   * `no_state`, `no_children`, `no_li_attr` and `no_a_attr` drop those.
   */
  get_json(
    obj?: NodeRef,
    options: {
      flat?: boolean;
      no_state?: boolean;
      no_id?: boolean;
      no_children?: boolean;
      no_data?: boolean;
      no_li_attr?: boolean;
      no_a_attr?: boolean;
    } = {},
  ): TreeNodeData | TreeNodeData[] | false {
    const start = this.resolveNode(obj ?? '#');
    if (!start) return false;
    const withType = this.getPlugin('types') !== null;
    const flat: TreeNodeData[] = [];

    const serialize = (node: TreeNode): TreeNodeData => {
      const out: Record<string, unknown> = {
        id: node.id,
        text: node.text,
        icon: this.get_icon(node.id),
        li_attr: this.cloneData(node.li_attr),
        a_attr: this.cloneData(node.a_attr),
        state: { ...node.state },
        data: options.no_data ? false : this.cloneData(node.data ?? {}),
      };
      if (withType) out.type = node.type;
      if (options.flat) out.parent = node.parent;
      else out.children = [];
      if (options.no_state) delete out.state;
      if (options.no_li_attr) delete out.li_attr;
      if (options.no_a_attr) delete out.a_attr;
      if (options.no_id) {
        delete out.id;
        delete (out.li_attr as Record<string, string> | undefined)?.id;
        delete (out.a_attr as Record<string, string> | undefined)?.id;
      }
      if (options.flat && node.id !== '#') flat.push(out as TreeNodeData);
      if (!options.no_children) {
        for (const cid of node.children) {
          const child = this.store.get(cid);
          if (!child) continue;
          const json = serialize(child);
          if (!options.flat) (out.children as TreeNodeData[]).push(json);
        }
      }
      return out as TreeNodeData;
    };

    const result = serialize(start);
    if (options.flat) return flat;
    return start.id === '#' ? (result.children as TreeNodeData[]) : result;
  }

  is_selected(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    return this.selection.isSelected(id);
  }

  /**
   * jstree's is_parent: a node with children, or a lazy node not yet loaded,
   * which may have children once it is.
   */
  is_parent(obj: NodeRef): boolean {
    const node = this.resolveNode(obj);
    return !!node && (node.state.loaded === false || node.children.length > 0);
  }

  /**
   * jstree defines is_leaf as the negation of is_parent, so an unknown node
   * reports as a leaf. Kept literally, as part of the contract.
   */
  is_leaf(obj: NodeRef): boolean {
    return !this.is_parent(obj);
  }

  is_open(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.opened;
  }

  /** jstree's is_closed: a parent (loaded or not) that is not open. */
  is_closed(obj: NodeRef): boolean {
    const node = this.resolveNode(obj);
    return !!node && this.is_parent(node) && !node.state.opened;
  }

  is_disabled(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.disabled;
  }

  is_loaded(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.loaded;
  }

  toggle_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.toggle_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    const node = this.store.get(id);
    if (!node) return;
    if (node.state.opened) {
      this.close_node(id);
    } else {
      this.open_node(id);
    }
  }

  /**
   * The next visible node in document order; with `strict`, the next visible
   * sibling only. As in jstree, hidden nodes and the contents of collapsed
   * nodes are skipped.
   */
  get_next_dom(obj: NodeRef, strict = false): HTMLElement | null {
    const id = this.resolveId(obj);
    if (id === null) return null;
    const el = this.element.querySelector(`#${CSS.escape(id)}`);
    if (!el) return null;

    if (strict) {
      let next = el.nextElementSibling;
      while (next && !(next.classList.contains('md-tree-node') && isNodeVisible(next))) {
        next = next.nextElementSibling;
      }
      return next as HTMLElement | null;
    }

    const nodes = Array.from(this.element.querySelectorAll('.md-tree-node'));
    for (let i = nodes.indexOf(el) + 1; i < nodes.length; i++) {
      if (isNodeVisible(nodes[i])) return nodes[i] as HTMLElement;
    }
    return null;
  }

  /** The mirror image of `get_next_dom`. */
  get_prev_dom(obj: NodeRef, strict = false): HTMLElement | null {
    const id = this.resolveId(obj);
    if (id === null) return null;
    const el = this.element.querySelector(`#${CSS.escape(id)}`);
    if (!el) return null;

    if (strict) {
      let prev = el.previousElementSibling;
      while (prev && !(prev.classList.contains('md-tree-node') && isNodeVisible(prev))) {
        prev = prev.previousElementSibling;
      }
      return prev as HTMLElement | null;
    }

    const nodes = Array.from(this.element.querySelectorAll('.md-tree-node'));
    for (let i = nodes.indexOf(el) - 1; i >= 0; i--) {
      if (isNodeVisible(nodes[i])) return nodes[i] as HTMLElement;
    }
    return null;
  }

  get_top_selected(): string[] {
    const selected = this.selection.getSelected();
    const selectedSet = new Set(selected);
    return selected.filter((id) => {
      const node = this.store.get(id);
      if (!node) return false;
      // Check if any ancestor is also selected
      return !node.parents.some((pid) => pid !== '#' && selectedSet.has(pid));
    });
  }

  get_bottom_selected(): string[] {
    const selected = this.selection.getSelected();
    const selectedSet = new Set(selected);
    return selected.filter((id) => {
      const node = this.store.get(id);
      if (!node) return false;
      // Check if any descendant is also selected
      const hasSelectedDescendant = (nid: string): boolean => {
        const n = this.store.get(nid);
        if (!n) return false;
        for (const cid of n.children) {
          if (selectedSet.has(cid)) return true;
          if (hasSelectedDescendant(cid)) return true;
        }
        return false;
      };
      return !hasSelectedDescendant(id);
    });
  }

  set_id(obj: NodeRef, newId: string): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    if (this.store.has(newId)) return false;

    // Update store
    this.store.delete(id);
    node.id = newId;
    // As in jstree, which leaves the anchor id alone.
    node.li_attr.id = newId;
    this.store.set(newId, node);

    // Update parent's children arrays
    const parent = this.resolveParent(node.parent);
    if (parent) {
      const idx = parent.children.indexOf(id);
      if (idx !== -1) parent.children[idx] = newId;
      const dIdx = parent.children_d.indexOf(id);
      if (dIdx !== -1) parent.children_d[dIdx] = newId;
    }

    // Update children's parent references
    for (const cid of node.children) {
      const child = this.store.get(cid);
      if (child) {
        child.parent = newId;
      }
    }
    this.reindex();

    // Update selection
    if (this.selection.isSelected(id)) {
      this.selection.deselect(id);
      this.selection.select(newId);
    }

    // Update DOM
    const el = this.element.querySelector(`#${CSS.escape(id)}`);
    if (el) el.id = newId;

    this.emit(`set_id.${EVENT_NS}`, { node, old: id });
    return true;
  }

  // ---- Node Visibility (Phase 2) ----

  hide_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.hide_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    const node = this.store.get(id);
    if (!node) return;
    node.state.hidden = true;
    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (el) el.classList.add('md-tree-hidden');
    this.emit(`hide_node.${EVENT_NS}`, { node });
  }

  show_node(obj: NodeRef | NodeRef[]): boolean | void {
    if (Array.isArray(obj)) {
      for (const item of obj) this.show_node(item);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return;
    const node = this.store.get(id);
    if (!node) return;
    node.state.hidden = false;
    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (el) el.classList.remove('md-tree-hidden');
    this.emit(`show_node.${EVENT_NS}`, { node });
  }

  /** jstree's `hide_all`: hide every node, returning — and emitting as `nodes` — the ids it hid. */
  hide_all(_skipRedraw?: boolean): string[] {
    const ids: string[] = [];
    for (const node of this.store.getAll()) {
      if (node.state.hidden) continue;
      node.state.hidden = true;
      ids.push(node.id);
    }
    const nodes = this.element.querySelectorAll('.md-tree-node');
    for (const el of Array.from(nodes)) {
      el.classList.add('md-tree-hidden');
    }
    this.emit(`hide_all.${EVENT_NS}`, { nodes: ids });
    return ids;
  }

  /** jstree's `show_all`: show every node, returning — and emitting as `nodes` — the ids it showed. */
  show_all(_skipRedraw?: boolean): string[] {
    const ids: string[] = [];
    for (const node of this.store.getAll()) {
      if (!node.state.hidden) continue;
      node.state.hidden = false;
      ids.push(node.id);
    }
    const nodes = this.element.querySelectorAll('.md-tree-node');
    for (const el of Array.from(nodes)) {
      el.classList.remove('md-tree-hidden');
    }
    this.emit(`show_all.${EVENT_NS}`, { nodes: ids });
    return ids;
  }

  is_hidden(obj: NodeRef): boolean {
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.hidden ?? false;
  }

  // ---- Theme Runtime Toggles (Phase 3) ----

  show_stripes(): void {
    this.theme.showStripes();
  }

  hide_stripes(): void {
    this.theme.hideStripes();
  }

  toggle_stripes(): void {
    this.theme.toggleStripes();
  }

  show_dots(): void {
    this.theme.showDots();
  }

  hide_dots(): void {
    this.theme.hideDots();
  }

  toggle_dots(): void {
    this.theme.toggleDots();
  }

  show_icons(): void {
    this.theme.showIcons();
  }

  hide_icons(): void {
    this.theme.hideIcons();
  }

  toggle_icons(): void {
    this.theme.toggleIcons();
  }

  show_ellipsis(): void {
    this.theme.showEllipsis();
  }

  hide_ellipsis(): void {
    this.theme.hideEllipsis();
  }

  toggle_ellipsis(): void {
    this.theme.toggleEllipsis();
  }

  /**
   * jstree's `set_icon`: true, null, undefined or '' restore the theme icon;
   * false hides it; a string sets a class list or image URL.
   */
  set_icon(obj: NodeRef | NodeRef[], icon: string | boolean | null | undefined): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.set_icon(item, icon);
      return true;
    }
    const id = this.resolveId(obj);
    if (id === null) return false;
    const node = this.store.get(id);
    if (!node) return false;
    node.icon = icon === true || icon === null || icon === undefined || icon === '' ? true : icon;
    this.renderer.renderSingleNode(node);
    return true;
  }

  get_icon(obj: NodeRef): string | boolean {
    const id = this.resolveId(obj);
    if (id === null || id === '#') return false;
    const node = this.store.get(id);
    if (!node) return false;
    return node.icon;
  }

  /**
   * jstree's `hide_icon`: set the icon to false and hide the rendered one,
   * which keeps its `rel` for show_icon until the node is next redrawn.
   */
  hide_icon(obj: NodeRef | NodeRef[]): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.hide_icon(item);
      return true;
    }
    const id = this.resolveId(obj);
    const node = id === null ? null : this.store.get(id);
    if (!node) return false;
    node.icon = false;
    this.themeIconOf(node.id)?.classList.add('md-tree-themeicon-hidden');
    return true;
  }

  /**
   * jstree's `show_icon`: restore the icon recorded in the rendered icon's
   * `rel`, or the theme icon when there is none.
   */
  show_icon(obj: NodeRef | NodeRef[]): boolean {
    if (Array.isArray(obj)) {
      for (const item of obj) this.show_icon(item);
      return true;
    }
    const id = this.resolveId(obj);
    const node = id === null ? null : this.store.get(id);
    if (!node) return false;
    node.icon = this.themeIconOf(node.id)?.getAttribute('rel') || true;
    this.renderer.renderSingleNode(node);
    return true;
  }

  /** A node's rendered icon element, if the node is rendered. */
  private themeIconOf(id: string): HTMLElement | null {
    return this.element.querySelector(`#${CSS.escape(id)} > .md-tree-anchor > .md-tree-themeicon`);
  }

  // ---- Clipboard, as jstree's: one buffer for every tree ----

  /**
   * jstree's `cut`: buffer the nodes — the selection when given nothing — for
   * paste to move. False when there is nothing to buffer.
   */
  cut(obj?: NodeRef | NodeRef[]): false | void {
    return this.clipboard.cut(obj);
  }

  /** jstree's `copy`: as `cut`, for paste to copy. */
  copy(obj?: NodeRef | NodeRef[]): false | void {
    return this.clipboard.copy(obj);
  }

  /**
   * jstree's `paste(obj, pos)`: move or copy the buffered nodes into `obj`
   * through move_node / copy_node, with the buffer's tree as the origin — so
   * they keep their order, and may come from another tree — emit `paste`, and
   * empty the buffer (without `clear_buffer`). Returns whether it pasted.
   */
  paste(obj: NodeRef, pos?: number | string): boolean {
    return this.clipboard.paste(obj, pos);
  }

  /**
   * jstree's `get_buffer`: `{ mode, node, inst }` — 'move_node' or
   * 'copy_node', the nodes and their tree, all false when empty — with the
   * ids as `ids`, as earlier releases reported them.
   */
  get_buffer(): ClipboardBuffer {
    return this.clipboard.getBuffer();
  }

  /** jstree's `can_paste`: whether anything is buffered. */
  can_paste(): boolean {
    return this.clipboard.canPaste();
  }

  /** jstree's `clear_buffer`: empty the buffer and emit `clear_buffer`. */
  clear_buffer(): void {
    this.clipboard.clearBuffer();
  }

  /**
   * jstree's `edit`: rename a node in place, starting from `defaultText` when
   * given one. The callback is told the node, whether it was renamed, and
   * whether Escape cancelled it.
   */
  edit(obj: NodeRef, defaultText?: string, callback?: EditCallback): void {
    this.inlineEditor.edit(obj, defaultText, callback);
  }

  // ---- Refresh & Load (Phase 8) ----

  refresh(): void {
    if (this.destroyed) return;

    // Save state
    const openedIds = this.getOpenedIds();
    const selectedIds = this.getSelectedIds();

    // Clear
    this.store.clear();
    this.rootNode.children = [];
    this.rootNode.children_d = [];
    this.selection.deselectAll();
    // jstree's changed plugin forgets its last selection on refresh.
    this.lastChangedSelection = [];
    this.lastClicked = null;

    // Reload. State is restored in the completion hook because a
    // `DataCallback` populates the store asynchronously.
    this.loadData({
      emitLifecycle: false,
      onComplete: () => {
        for (const id of openedIds) {
          const node = this.store.get(id);
          if (node) node.state.opened = true;
        }
        for (const id of selectedIds) {
          if (this.store.has(id)) {
            this.selection.select(id);
          }
        }
        this.syncSelectionFlags();

        this.renderer.render(this.getRootNodes());
        this.emit(`refresh.${EVENT_NS}`, {});
      },
    });
  }

  /**
   * jstree's `load_node`: (re)load a node's children through `core.data`.
   * Returns true for any node that exists. A loaded node's descendants are
   * dropped when the reload starts; `load_node` is emitted with the outcome as
   * `status`, and the callback receives the node and that status. Given an
   * array, it loads the nodes not yet loaded and calls back once with the ids
   * that loaded.
   */
  load_node(obj: NodeRef[], callback?: (nodes: string[]) => void): boolean;
  load_node(obj: NodeRef, callback?: (node: TreeNode, status: boolean) => void): boolean;
  load_node(
    obj: NodeRef | NodeRef[],
    callback?: ((node: TreeNode, status: boolean) => void) | ((nodes: string[]) => void),
  ): boolean {
    if (Array.isArray(obj)) {
      const ids = obj.map((item) => this.resolveId(item)).filter((id): id is string => id !== null);
      this.loadNodes(ids, (loaded) => (callback as ((nodes: string[]) => void) | undefined)?.(loaded));
      return true;
    }
    const node = this.resolveNode(obj);
    if (!node) return false;
    const done = callback as ((node: TreeNode, status: boolean) => void) | undefined;

    // As in jstree, reloading a loaded node drops its descendants first.
    if (node.state.loaded) this.dropDescendants(node);
    node.state.failed = false;
    node.state.loading = true;
    node.state.loaded = false;
    this.renderer.renderSingleNode(node);

    this.fetchChildren(node, (status) => {
      node.state.loading = false;
      node.state.loaded = status;
      node.state.failed = !status;
      this.renderer.renderSingleNode(node);
      // As in jstree, the anchor reports that it is no longer busy.
      this.element
        .querySelector(`#${CSS.escape(node.id)} > .md-tree-anchor`)
        ?.setAttribute('aria-busy', 'false');
      this.emit(`load_node.${EVENT_NS}`, { node, status });
      done?.(node, status);
    });
    return true;
  }

  /**
   * jstree's `_load_node`: fetch a node's children from `core.data` and add
   * them, reporting whether that succeeded. A function is called with the
   * tree as `this` and may answer `false`, JSON or HTML. An ajax config is
   * fetched for every node (`core_04` on failure). An array or object loads
   * only the root (`core_05` for any other node), as does an HTML string
   * (`core_06`); with no data the root re-reads the container's markup.
   */
  private fetchChildren(node: TreeNode, done: (status: boolean) => void): void {
    const source = this.config.core?.data;
    let settled = false;
    const settle = (status: boolean): void => {
      if (settled) return;
      settled = true;
      done(status);
    };
    const refuse = (id: string): void => {
      this.reportError({
        error: 'nodata',
        plugin: 'core',
        id,
        reason: 'Could not load node',
        data: JSON.stringify({ id: node.id }),
      });
      settle(false);
    };
    const append = (data: unknown, then: () => void): void => {
      if (typeof data === 'string') this.appendChildren(node, this.htmlParser.parseFragment(data), then, false);
      else this.appendChildren(node, this.asNodeList(data), then);
    };

    // A node the massload plugin fetched loads from its answer.
    const massload = this.getPlugin<MassloadPlugin>('massload');
    const prefetched = massload?.take(node.id);
    if (prefetched) {
      append(prefetched, () => settle(true));
      return;
    }

    if (typeof source === 'function') {
      try {
        source.call(this, node, (data) => {
          if (settled) return;
          if (data === false) return settle(false);
          append(data, () => settle(true));
        });
      } catch (cause) {
        if (!settled) {
          this.reportError({ error: 'load_failed', operation: 'load_node', id: node.id, cause });
          settle(false);
        }
      }
      return;
    }
    if (isAjaxConfig(source)) {
      this.fetchAjax(node, source, append, settle);
      return;
    }
    if (typeof source === 'string') {
      if (node.id !== '#') return refuse('core_06');
      append(source, () => settle(true));
      return;
    }
    if (source) {
      if (node.id !== '#') return refuse('core_05');
      append(this.cloneData(source), () => settle(true));
      return;
    }
    if (node.id === '#' && this.originalHtml !== null) {
      // Parsed in an inert document, so nothing in the markup loads or runs.
      const inert = document.implementation.createHTMLDocument('');
      inert.body.innerHTML = this.originalHtml;
      this.appendChildren(node, this.htmlParser.parse(inert.body), () => settle(true), false);
      return;
    }
    settle(false);
  }

  /**
   * jstree's ajax `core.data`, fetched for each node load: `url` and `data`
   * may be functions of the node, called with the tree as `this`.
   */
  private fetchAjax(
    node: TreeNode,
    config: AjaxConfig,
    append: (data: unknown, then: () => void) => void,
    settle: (status: boolean) => void,
  ): void {
    const url = typeof config.url === 'function' ? config.url.call(this, node) : config.url;
    const data =
      typeof config.data === 'function'
        ? (config.data as (this: MDFolderTree, n: TreeNode) => unknown).call(this, node)
        : config.data;
    sendAjax(config, url, data, {
      success: (payload) => {
        if (this.destroyed) return;
        append(payload, () => settle(true));
      },
      fail: (xhr) => {
        if (this.destroyed) return;
        this.reportError({
          error: 'ajax',
          plugin: 'core',
          id: 'core_04',
          reason: 'Could not load node',
          data: JSON.stringify({ id: node.id, xhr }),
        });
        settle(false);
      },
    });
  }

  /**
   * JSON nodes as jstree's `_append_json_data` takes them: a `{ d }` wrapper
   * (as ASP.NET sends) unwrapped, and a single node wrapped in an array.
   */
  private asNodeList(payload: unknown): TreeNodeData[] {
    let data = payload;
    if (data && typeof data === 'object' && (data as { d?: unknown }).d) {
      data = (data as { d: unknown }).d;
      if (typeof data === 'string') data = JSON.parse(data);
    }
    if (data === null || data === undefined) return [];
    return (Array.isArray(data) ? data : [data]) as TreeNodeData[];
  }

  /**
   * Replace a node's children with new data, as jstree's `_append_json_data`
   * (JSON, through the worker when there is one) or `_append_html_data`
   * (parsed markup, here and now), then `done`.
   */
  private appendChildren(node: TreeNode, data: TreeNodeData[], done: () => void, json = true): void {
    for (const cid of [...node.children]) this.removeSubtree(cid);
    node.children = [];
    node.children_d = [];
    const finish = (): void => {
      this.reindex();
      this.emitModel(node.children_d, node.id);
      this.renderer.render(this.getRootNodes());
      done();
    };
    if (json) {
      this.ingest(data, node.id, finish);
      return;
    }
    this.buildNodeTree(data, node.id);
    finish();
  }

  /**
   * jstree's `_append_json_data`: build `data` under `parentId` — in a Web
   * Worker made from `buildModel`'s source when `core.worker` allows and
   * workers exist, one load at a time, falling back to this thread when the
   * worker fails or the data cannot be sent to it — then `done`.
   */
  private ingest(data: TreeNodeData[], parentId: string, done: () => void): void {
    const workers =
      this.config.core?.worker !== false &&
      typeof Worker !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL.createObjectURL === 'function';
    if (!workers) {
      this.buildNodeTree(data, parentId);
      done();
      return;
    }
    if (this.working) {
      this.workQueue.push(() => this.ingest(data, parentId, done));
      return;
    }

    this.working = true;
    const next = (): void => {
      this.working = false;
      this.workQueue.shift()?.();
    };
    const here = (): void => {
      this.buildNodeTree(data, parentId);
      done();
      next();
    };
    try {
      if (!this.workerUrl) {
        const source = `self.onmessage = function (e) { self.postMessage((${buildModel.toString()})(e.data)); };`;
        this.workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      }
      const worker = new Worker(this.workerUrl);
      worker.onmessage = (e: MessageEvent<ModelOutput>) => {
        worker.terminate();
        if (this.destroyed) return;
        this.applyModel(e.data);
        done();
        next();
      };
      worker.onerror = () => {
        worker.terminate();
        if (!this.destroyed) here();
      };
      worker.postMessage({
        data,
        parent: parentId,
        existing: this.store.getAll().map((n) => n.id),
        counter: this.idCounter,
        prefix: 'mdft',
      });
    } catch {
      here();
    }
  }

  /**
   * jstree's `load_all(obj, callback)`: load every unloaded node below `obj`
   * (the root by default) together — so massload can batch them — and again
   * for whatever those loads reveal, then call back with the node and emit
   * `load_all`. Unlike jstree, a node that failed to load is not retried,
   * which would otherwise repeat forever.
   */
  load_all(obj?: NodeRef, callback?: (node: TreeNode) => void): boolean | void {
    const start = this.resolveNode(obj ?? '#');
    if (!start) return false;
    const toLoad = [start, ...this.descendantsOf(start)]
      .filter((node) => !node.state.loaded && !node.state.failed)
      .map((node) => node.id);
    if (toLoad.length) {
      this.loadNodes(toLoad, () => this.load_all(start, callback));
      return;
    }
    callback?.(start);
    this.emit(`load_all.${EVENT_NS}`, { node: start });
  }

  /**
   * Drop a node's descendants ahead of a reload, as jstree's `load_node`
   * does, emitting `changed` when any of them were selected.
   */
  private dropDescendants(node: TreeNode): void {
    const hadSelected = node.children_d.some((id) => this.selection.isSelected(id));
    for (const cid of [...node.children]) this.removeSubtree(cid);
    node.children = [];
    this.reindex();
    if (hadSelected) {
      this.syncSelectionFlags();
      this.emitChanged('load_node', node);
    }
  }

  /**
   * jstree's `_load_nodes`: load every listed node that is unloaded and has
   * not failed — reloading, with `force`, the ones present at the start —
   * then call `done` once with the ids that ended up loaded. A node that a
   * parent's reload recreated loads only if it is unloaded.
   */
  private loadNodes(ids: string[], done: (loaded: string[]) => void, force = false): void {
    const initial = new Map(ids.map((id) => [id, this.store.get(id)]));
    let finished = false;
    const pass = (forcing: boolean): void => {
      let ready = true;
      for (const id of ids) {
        const node = this.store.get(id);
        if (!node) continue;
        const reload = forcing && node === initial.get(id);
        if (reload || (!node.state.loaded && !node.state.failed)) {
          ready = false;
          if (!node.state.loading) this.load_node(id, () => pass(false));
        }
      }
      if (ready && !finished) {
        finished = true;
        done(ids.filter((id) => this.store.get(id)?.state.loaded));
      }
    };
    // jstree's massload: fetch the nodes that need loading in one call first.
    const massload = this.getPlugin<MassloadPlugin>('massload');
    if (!massload) {
      pass(force);
      return;
    }
    const toLoad = ids.filter((id) => {
      const node = this.store.get(id);
      return !node || (!node.state.loaded && !node.state.failed) || force;
    });
    massload.prefetch(toLoad, () => pass(force));
  }

  private removeSubtree(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    for (const cid of node.children) {
      this.removeSubtree(cid);
    }
    this.selection.deselect(id);
    this.store.delete(id);
  }

  // ---- Static helpers ----

  static getInstance(element: HTMLElement): MDFolderTree | null {
    return ((element as unknown as Record<string, unknown>).__mdFolderTree as MDFolderTree) ?? null;
  }

  // ---- Private ----

  private mergeDefaults(config: TreeConfig): TreeConfig {
    return {
      core: {
        data: false,
        multiple: true,
        animation: 200,
        themes: {
          dots: true,
          icons: true,
          ...config.core?.themes,
        },
        expand_selected_onload: true,
        force_text: false,
        dblclick_toggle: true,
        // jstree's default: structural operations are refused until the tree
        // opts in.
        check_callback: false,
        ...config.core,
      },
      plugins: config.plugins ?? [],
      types: config.types,
      checkbox: config.checkbox,
      search: config.search,
      contextmenu: config.contextmenu,
      dnd: config.dnd,
      massload: config.massload,
      sort: config.sort,
      state: config.state,
      unique: config.unique,
      conditionalselect: config.conditionalselect,
    };
  }

  /**
   * jstree's container flags, set as it initializes: `md-tree-rtl` when the
   * container computes to a right-to-left direction, and
   * `aria-multiselectable` while `core.multiple` allows more than one node.
   */
  private applyContainerFlags(): void {
    const direction = typeof getComputedStyle === 'function' ? getComputedStyle(this.element).direction : '';
    this.element.classList.toggle('md-tree-rtl', direction === 'rtl');
    if (this.config.core?.multiple !== false) this.element.setAttribute('aria-multiselectable', 'true');
  }

  /** Plugin factories by the name a tree lists them under. */
  private static readonly registry = new Map<string, () => TreePlugin>();

  /**
   * Register a plugin under the name trees list it by, replacing whatever
   * held that name. The built-ins register themselves this way
   * ([src/plugins/register.ts](src/plugins/register.ts)), so a consumer's own
   * plugin is built on exactly the same terms.
   */
  static registerPlugin(name: string, factory: () => TreePlugin): void {
    MDFolderTree.registry.set(name, factory);
  }

  /** The plugin this tree built under `name`, or null where it has none. */
  getPlugin<T extends TreePlugin>(name: string): T | null {
    return (this.pluginsByName.get(name) as T | undefined) ?? null;
  }

  private get checkboxPlugin(): CheckboxPlugin | null {
    return this.getPlugin<CheckboxPlugin>('checkbox');
  }

  private get searchPlugin(): SearchPlugin | null {
    return this.getPlugin<SearchPlugin>('search');
  }

  private initPlugins(): void {
    const names = [...(this.config.plugins ?? [])];
    // Our one divergence: a `types` config enables the plugin without naming
    // it. It leads, as it did while the order was ours to choose.
    if (this.config.types && !names.includes('types')) names.unshift('types');

    for (const name of names) {
      const factory = MDFolderTree.registry.get(name);
      // As in jstree, a name with no plugin behind it is passed over.
      if (!factory) continue;
      const plugin = factory();
      plugin.init(this);
      this.plugins.push(plugin);
      this.pluginsByName.set(name, plugin);
    }
  }

  /**
   * @param options.onComplete Runs once the data is in the store. With a
   * `DataCallback` this is asynchronous, so callers that need to act on the
   * loaded tree must use it rather than the return of this method.
   * @param options.emitLifecycle Suppressed by `refresh()`, which emits its
   * own event; re-emitting `ready` would re-trigger plugins that restore state.
   */
  private loadData(options: { onComplete?: () => void; emitLifecycle?: boolean } = {}): void {
    const { onComplete, emitLifecycle = true } = options;
    const coreData = this.config.core?.data;

    const finish = (): void => {
      if (coreData) this.clearRootLoading();
      if (emitLifecycle) {
        // Deferred by a microtask: for synchronous data these would otherwise
        // fire before the constructor returns, so no consumer could ever
        // subscribe in time to observe them.
        queueMicrotask(() => {
          if (this.destroyed) return;
          this.emit(`loaded.${EVENT_NS}`, {});
          if (this.config.core?.expand_selected_onload !== false) this.openSelectedAncestors();
          // jstree reports the initial selection just before `ready`. It also
          // seeds the baseline that later `changed` diffs are computed from,
          // so preselected nodes are not reported as new in the next diff.
          if (!this.changedEmitted && this.selection.getSelected().length > 0) {
            this.emitChanged('ready', null);
          }
          this.emit(`ready.${EVENT_NS}`, { instance: this });
        });
      }
      onComplete?.();
    };

    if (emitLifecycle) {
      this.emit(`loading.${EVENT_NS}`, {});
      this.theme.applyFlags();
    }

    // Registered up front so `MDFolderTree.getInstance()` resolves inside a
    // `ready` handler.
    (this.element as unknown as Record<string, unknown>).__mdFolderTree = this;

    // jstree stands a placeholder in while the root loads. Markup in the
    // container is the source for an HTML tree, so it is left alone there.
    if (coreData) this.showRootLoading();

    // The root's nodes are in: index, announce and draw them, then finish.
    const rootLoaded = (): void => {
      this.reindex();
      this.emitModel(this.rootNode.children_d, '#');
      this.syncSelectionFlags();
      this.renderer.render(this.getRootNodes());
      finish();
    };

    if (typeof coreData === 'function') {
      // Pattern A: data callback. As in jstree, an answer of false loads
      // nothing, and a string is HTML.
      (coreData as DataCallback).call(this, this.rootNode, (data) => {
        if (typeof data === 'string') {
          this.buildNodeTree(this.htmlParser.parseFragment(data), '#');
          rootLoaded();
        } else {
          this.ingest(data === false ? [] : this.asNodeList(data), '#', rootLoaded);
        }
      });
    } else if (Array.isArray(coreData)) {
      // Pattern A variant: static JSON array
      this.ingest(coreData, '#', rootLoaded);
    } else if (coreData) {
      // An ajax config or an HTML string (or a single node) loads the root as
      // load_node would, as in jstree.
      this.fetchChildren(this.rootNode, () => {
        this.syncSelectionFlags();
        this.renderer.render(this.getRootNodes());
        finish();
      });
    } else {
      // Pattern B: parse existing HTML
      const parsed = this.htmlParser.parse(this.element);
      if (parsed.length > 0) {
        this.buildNodeTree(parsed, '#');
        rootLoaded();
      } else {
        finish();
      }
    }

  }

  /**
   * jstree's initial node: a placeholder reading `get_string('Loading ...')`,
   * standing in until the root's nodes arrive, while the container reports
   * itself busy.
   */
  private showRootLoading(): void {
    this.element.classList.add('md-tree-loading');
    this.element.setAttribute('aria-busy', 'true');

    const list = document.createElement('ul');
    list.className = 'md-tree-container-ul md-tree-children';
    list.setAttribute('role', 'group');
    const item = document.createElement('li');
    // Deliberately not `md-tree-node`: it stands in for one, and nothing that
    // walks the rendered nodes should count it.
    item.className = 'md-tree-initial-node md-tree-loading md-tree-leaf md-tree-last';
    item.setAttribute('role', 'none');
    const ocl = document.createElement('i');
    ocl.className = 'md-tree-icon md-tree-ocl';
    const anchor = document.createElement('a');
    anchor.className = 'md-tree-anchor';
    anchor.setAttribute('role', 'treeitem');
    anchor.setAttribute('href', '#');
    const icon = document.createElement('i');
    icon.className = 'md-tree-icon md-tree-themeicon-hidden';
    anchor.append(icon, document.createTextNode(this.get_string('Loading ...')));
    item.append(ocl, anchor);
    list.appendChild(item);
    this.element.innerHTML = '';
    this.element.appendChild(list);
  }

  /** The placeholder and the busy marks go as soon as the root has loaded. */
  private clearRootLoading(): void {
    this.element.classList.remove('md-tree-loading');
    this.element.setAttribute('aria-busy', 'false');
    this.element.querySelector('.md-tree-initial-node')?.remove();
  }

  /**
   * Materialize normalized data into the store beneath `parentId`.
   *
   * Runs in two passes so a node may name a parent that appears later in the
   * payload (jstree's flat format). Nested `children` arrays and flat `parent`
   * references are handled by the same code: a node's parent is whatever its
   * `parent` property says, defaulting to the enclosing `parentId`.
   */
  private buildNodeTree(data: TreeNodeData[], parentId: string): void {
    this.applyModel(
      buildModel({ data, parent: parentId, existing: this.store, counter: this.idCounter, prefix: 'mdft' }),
    );
  }

  /**
   * Put what `buildModel` made into the tree: the nodes into the store, each
   * under its parent, the id counter advanced, the problems met reported, and
   * the nodes the data selects selected.
   */
  private applyModel(model: ModelOutput): void {
    this.idCounter = Math.max(this.idCounter, model.counter);
    // A worker's model can arrive after the tree changed. A node whose id was
    // taken in the meantime is reported and dropped, as is one whose parent
    // has since gone — each with the nodes beneath it. Built here and now,
    // against the live store, a model has neither.
    const made = new Set(model.nodes.map((node) => node.id));
    const parentOf = new Map(model.links.map(([parentId, childId]) => [childId, parentId]));
    const clashes = model.nodes.filter((node) => this.store.has(node.id)).map((node) => node.id);
    const kept = new Map<string, boolean>(clashes.map((id) => [id, false]));
    const keep = (id: string): boolean => {
      if (!made.has(id)) return this.resolveParent(id) !== null;
      if (!kept.has(id)) {
        // Provisionally kept, so cyclic input stays as it would be here and now.
        kept.set(id, true);
        kept.set(id, keep(parentOf.get(id) ?? '#'));
      }
      return kept.get(id)!;
    };
    for (const id of clashes) {
      this.reportError({ error: 'duplicate_id', operation: 'load', id, parent: parentOf.get(id) ?? '#' });
    }
    for (const node of model.nodes) {
      if (keep(node.id)) this.store.set(node.id, node);
    }
    for (const [parentId, childId] of model.links) {
      if (!keep(childId)) continue;
      const parent = this.resolveParent(parentId)!;
      parent.children.push(childId);
      parent.children_d.push(childId);
    }
    for (const error of model.errors) this.reportError(error);
    for (const id of model.selected) {
      if (keep(id)) this.selection.select(id);
    }
  }

  private buildParentChain(parentId: string): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current = parentId;
    while (current !== '#') {
      // Cyclic parent references (possible with malformed flat data) would
      // otherwise loop until the array exceeds its maximum length.
      if (seen.has(current)) break;
      seen.add(current);
      chain.push(current);
      const parentNode = this.store.get(current);
      current = parentNode?.parent ?? '#';
    }
    chain.push('#');
    return chain;
  }

  /**
   * Rebuild derived ancestry (`parents`, `children_d`) for the whole tree.
   *
   * These were previously patched by hand at each mutation site, which drifted:
   * descendants kept stale ancestry after a move and `children_d` never held
   * anything deeper than direct children. A whole-tree pass is O(n) — the same
   * order as the re-render every structural change already performs.
   */
  private reindex(): void {
    const seen = new Set<string>();

    const visit = (id: string, ancestors: string[]): string[] => {
      const node = this.store.get(id);
      if (!node || seen.has(id)) return [];
      seen.add(id);

      node.parents = [...ancestors];

      const descendants: string[] = [];
      const childAncestors = [id, ...ancestors];
      for (const childId of node.children) {
        descendants.push(childId, ...visit(childId, childAncestors));
      }
      node.children_d = descendants;
      return descendants;
    };

    const all: string[] = [];
    for (const rootId of this.rootNode.children) {
      all.push(rootId, ...visit(rootId, ['#']));
    }
    this.rootNode.children_d = all;

    // Nodes unreachable from the root — only possible when input data is
    // cyclic — still need a bounded ancestor chain.
    for (const node of this.store.getAll()) {
      if (!seen.has(node.id)) {
        node.parents = this.buildParentChain(node.parent);
      }
    }
  }

  /**
   * Refresh the `state.selected` mirror on every node from the authoritative
   * selection set. `TreeSelection` owns membership and enforces
   * `core.multiple`; the per-node flag is derived from it and must never be
   * written directly.
   */
  private syncSelectionFlags(): void {
    // While checkboxes are tied to selection, checked *is* selected: jstree's
    // `is_checked` reads `state.selected` in that mode.
    const tied = this.checkboxPlugin !== null && this.config.checkbox?.tie_selection !== false;
    for (const node of this.store.getAll()) {
      const selected = this.selection.isSelected(node.id);
      node.state.selected = selected;
      if (tied) node.state.checked = selected;
    }
  }

  /** The node owning `target` when `target` is that node's anchor itself. */
  private anchorNodeOf(target: EventTarget | null): Element | null {
    if (!(target instanceof Element) || !target.classList.contains('md-tree-anchor')) return null;
    return target.closest('.md-tree-node');
  }

  /** Whether an activation originated on a checkbox icon rather than the label. */
  private isCheckboxTarget(event: ActivationEvent): boolean {
    const target = event.target;
    return target instanceof Element && target.classList.contains('md-tree-checkbox');
  }

  /** jstree's `_open_to`: open every collapsed ancestor so the node is visible. */
  private openAncestors(node: TreeNode): void {
    for (const ancestorId of node.parents) {
      if (ancestorId === '#') continue;
      const ancestor = this.store.get(ancestorId);
      if (ancestor && !ancestor.state.opened && ancestor.children.length > 0) {
        this.openNode(ancestorId, false, 0);
      }
    }
  }

  /** The selection logic of jstree's `activate_node`, ported branch for branch. */
  private applyActivation(
    node: TreeNode,
    event: ActivationEvent,
    ctrl: boolean,
    meta: boolean,
    shift: boolean,
  ): void {
    const id = node.id;
    const multiple = this.config.core?.multiple ?? true;

    // Revalidate the range anchor: it must still exist and be selected,
    // otherwise fall back to the most recently selected node.
    let last = this.lastClicked ? this.store.get(this.lastClicked) : null;
    if (last && !this.selection.isSelected(last.id)) last = null;
    if (!last) {
      const selected = this.selection.getSelected();
      last = selected.length ? this.store.get(selected[selected.length - 1]) : null;
    }
    this.lastClicked = last ? last.id : null;

    const modified = ctrl || meta || shift;
    const rangeless = shift && (!last || node.parent !== last.parent);

    if (!multiple || !modified || rangeless) {
      if (!multiple && modified && this.selection.isSelected(id)) {
        this.deselectNode(id, false, event);
        return;
      }
      const allowReselect = this.config.core?.allow_reselect ?? false;
      if (allowReselect || !this.selection.isSelected(id) || this.selection.getSelected().length !== 1) {
        this.deselect_all(true);
        this.selectNode(id, false, false, event);
      }
      this.lastClicked = id;
      return;
    }

    if (shift && last) {
      const siblings = this.resolveParent(last.parent)?.children ?? [];
      let inRange = false;
      for (const siblingId of siblings) {
        // Separate checks so the anchor and the target may be the same node.
        if (siblingId === id) inRange = !inRange;
        if (siblingId === last.id) inRange = !inRange;
        const sibling = this.store.get(siblingId);
        if (!sibling) continue;
        if (!sibling.state.disabled && (inRange || siblingId === id || siblingId === last.id)) {
          if (!sibling.state.hidden) this.selectNode(siblingId, true, false, event);
        } else if (!ctrl) {
          this.deselectNode(siblingId, true, event);
        }
      }
      this.emitChanged('select_node', node, event);
      return;
    }

    if (!this.selection.isSelected(id)) {
      if (ctrl) this.lastClicked = id;
      this.selectNode(id, false, false, event);
    } else {
      this.deselectNode(id, false, event);
    }
  }

  /**
   * Resolve a node reference in any form jstree's `get_node` accepts. Order
   * follows jstree: an element's own id before its DOM position, an object's
   * `id`, then a plain id, or a '#'-prefixed id. Unlike jstree, a string
   * that is not an id is not tried as a CSS selector: that fallback is an
   * undocumented side effect of jstree's DOM branch, and it makes a lookup of
   * a missing id such as 'a' match every node's anchor element. Arrays are not references; array-capable methods iterate
   * them before resolving.
   */
  private resolveNode(obj: NodeRef): TreeNode | null {
    if (obj === null || obj === undefined) return null;

    if (obj instanceof Element) {
      if (obj === this.element) return this.rootNode;
      const byId = this.lookupNode(obj.id);
      if (byId) return byId;
      if (!this.element.contains(obj)) return null;
      const li = obj.closest('.md-tree-node');
      return li ? this.lookupNode(li.id) : null;
    }

    if (typeof obj === 'number') return this.lookupNode(String(obj));

    if (typeof obj === 'string') {
      const direct = this.lookupNode(obj);
      if (direct) return direct;
      return obj.startsWith('#') ? this.lookupNode(obj.slice(1)) : null;
    }

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      const { id } = obj as { id?: unknown };
      if (id !== undefined && id !== null && id !== '') return this.lookupNode(String(id));
      // A jQuery-style wrapper: resolve its first element.
      const wrapper = obj as ArrayLike<Element>;
      if (typeof wrapper.length === 'number' && wrapper.length > 0) return this.resolveNode(wrapper[0]);
    }
    return null;
  }

  /** The id a reference resolves to — `'#'` for the root — or null. */
  private resolveId(obj: NodeRef): string | null {
    return this.resolveNode(obj)?.id ?? null;
  }

  private lookupNode(id: string): TreeNode | null {
    return id === '#' ? this.rootNode : this.store.get(id);
  }

  /**
   * Resolve a parent id to its node, mapping the `'#'` sentinel to the
   * ordered root container. Returns null when the parent does not exist.
   */
  private resolveParent(parentId: string): TreeNode | null {
    return parentId === '#' ? this.rootNode : this.store.get(parentId);
  }

  /**
   * Mint an id that is guaranteed not to collide with an existing node.
   * A monotonic counter is used rather than a timestamp, which repeats for
   * calls made within the same millisecond.
   */
  private mintId(prefix: string): string {
    let candidate: string;
    do {
      candidate = `${prefix}_${++this.idCounter}`;
    } while (this.store.has(candidate));
    return candidate;
  }

  /**
   * True when re-parenting `id` under `parentId` would make the node an
   * ancestor of itself.
   */
  private wouldCreateCycle(id: string, parentId: string): boolean {
    if (id === parentId) return true;

    const seen = new Set<string>();
    let current = parentId;
    while (current !== '#') {
      if (current === id) return true;
      // A pre-existing cycle is not caused by this move; stop rather than loop.
      if (seen.has(current)) break;
      seen.add(current);
      current = this.store.get(current)?.parent ?? '#';
    }
    return false;
  }

  private getRootNodes(): TreeNode[] {
    return this.rootNode.children
      .map((id) => this.store.get(id))
      .filter((n): n is TreeNode => n !== null);
  }

  private createRootNode(): TreeNode {
    return {
      id: '#',
      text: 'Root',
      icon: false,
      type: 'default',
      parent: '',
      parents: [],
      children: [],
      children_d: [],
      state: { opened: true, selected: false, disabled: false, loaded: true, loading: false, checked: false },
      li_attr: {},
      a_attr: {},
      data: null,
      original: { id: '#', text: 'Root' },
    };
  }

  private bindEvents(): void {
    // Event delegation: single click handler on container
    this.element.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Toggle open/close
      if (target.classList.contains('md-tree-ocl')) {
        const li = target.closest('.md-tree-node') as HTMLElement | null;
        if (li) {
          const node = this.store.get(li.id);
          if (node) {
            if (node.state.opened) {
              this.close_node(li.id);
            } else {
              this.open_node(li.id);
            }
          }
        }
        e.preventDefault();
        return;
      }

      // Node selection via anchor click
      const anchor = target.closest('.md-tree-anchor') as HTMLElement | null;
      if (anchor) {
        // The anchor carries href="#": suppress navigation up front, before
        // any early return, so a vetoed activation cannot jump the page.
        e.preventDefault();

        const li = anchor.closest('.md-tree-node') as HTMLElement | null;
        if (li && this.store.has(li.id)) {
          // As jstree does, focus the clicked node, then activate it.
          this.keyboard.setFocused(li.id);
          this.activate_node(li.id, e);
        }
      }
    }, { signal: this.listeners.signal });

    // Double-click
    this.element.addEventListener('dblclick', (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('.md-tree-anchor') as HTMLElement | null;
      if (anchor) {
        const li = anchor.closest('.md-tree-node') as HTMLElement | null;
        if (li) {
          const node = this.store.get(li.id);
          if (node) {
            this.emit(`dblclick.${EVENT_NS}`, { node, event: e });
            if (this.config.core?.dblclick_toggle !== false) {
              if (node.state.opened) {
                this.close_node(li.id);
              } else {
                this.open_node(li.id);
              }
            }
          }
        }
      }
    }, { signal: this.listeners.signal });

    // Hover
    this.element.addEventListener('mouseenter', (e: MouseEvent) => {
      const li = this.anchorNodeOf(e.target);
      if (li) this.hover_node(li.id);
    }, { capture: true, signal: this.listeners.signal });

    this.element.addEventListener('mouseleave', (e: MouseEvent) => {
      const li = this.anchorNodeOf(e.target);
      if (li) this.dehover_node(li.id);
    }, { capture: true, signal: this.listeners.signal });
  }

  private emitChanged(
    action: string,
    node: TreeNode | null,
    event?: ActivationEvent,
    oldSelection?: string[],
    extra?: Record<string, unknown>,
  ): void {
    const selected = this.selection.getSelected();
    const previous = this.lastChangedSelection;
    const before = new Set(previous);
    const after = new Set(selected);
    const detail: ChangedDetail = {
      action,
      node,
      selected,
      old_selection: oldSelection ?? previous,
      changed: {
        selected: selected.filter((id) => !before.has(id)),
        deselected: previous.filter((id) => !after.has(id)),
      },
    };
    if (event !== undefined) detail.event = event;
    if (extra) Object.assign(detail, extra);
    this.lastChangedSelection = [...selected];
    this.changedEmitted = true;
    this.emit(`changed.${EVENT_NS}`, detail);
  }

  /**
   * jstree's `model` event: nodes have entered the model and are about to be
   * rendered. The types plugin settles types and icons from it.
   */
  private emitModel(nodes: string[], parent: string): void {
    this.emit(`model.${EVENT_NS}`, { nodes: [...nodes], parent });
  }

  /**
   * jstree's `expand_selected_onload`: open every ancestor of a selected
   * node, so the selection starts out visible.
   */
  private openSelectedAncestors(): void {
    const ancestors = new Set<string>();
    for (const id of this.selection.getSelected()) {
      for (const parent of this.store.get(id)?.parents ?? []) {
        if (parent !== '#') ancestors.add(parent);
      }
    }
    for (const id of ancestors) this.openNode(id, false, 0);
  }

  /**
   * Record an error and surface it through the `core.error` callback.
   * Plugins report through it too.
   */
  reportError(error: Record<string, unknown>): void {
    this.lastError = error;
    if (this.config.core?.error) this.config.core.error(error);
  }

  /**
   * jstree's `check()`: validate a structural operation. Structural rules
   * come first — a node may not be moved or copied into itself or its own
   * descendant, nor moved to the position it already holds — then
   * `core.check_callback`, which may be a boolean, a function, or a map of
   * operation names to booleans. A refusal is recorded in `last_error()` in
   * jstree's shape and handed to `core.error`.
   */
  check(chk: string, obj: NodeRef, par: NodeRef, pos?: number | string, more?: CheckMore): boolean {
    // As in jstree, an object already carrying an id is used as-is; for
    // create_node it is the new node's data, which is not in the tree yet.
    const node = (chk === 'create_node' || more?.is_multi ? obj : this.resolveNode(obj)) as TreeNode | null;
    const parent = this.resolveNode(par);

    const refuse = (code: string, reason: string, plugin = 'core'): false => {
      this.reportError({
        error: 'check',
        plugin,
        id: code,
        reason,
        data: JSON.stringify({ chk, pos, obj: node?.id ?? false, par: parent?.id ?? false }),
      });
      return false;
    };

    if ((chk === 'move_node' || chk === 'copy_node') && node && parent && !more?.is_multi) {
      if (chk === 'move_node' && parent.children.indexOf(node.id) === pos) {
        return refuse('core_08', 'Moving node to its current position');
      }
      // children_d covers the tree as indexed; the live parent walk also
      // catches cycles present in the input data.
      if (
        node.id === parent.id ||
        node.children_d.includes(parent.id) ||
        this.wouldCreateCycle(node.id, parent.id)
      ) {
        return refuse('core_01', 'Moving parent inside child');
      }
    }

    // A node's data.functions permits or forbids an operation outright,
    // ahead of check_callback: the parent's for move / copy / create, the
    // node's own otherwise.
    const subject = /^(move_node|copy_node|create_node)$/.test(chk) ? parent : node;
    const holder = (subject?.data ?? subject) as { functions?: Record<string, unknown> } | null;
    const verdict = holder?.functions?.[chk];
    if (verdict === false) return refuse('core_02', 'Node data prevents function: ' + chk);

    if (verdict !== true) {
      const cb = this.config.core?.check_callback;
      const refused =
        cb === false ||
        (typeof cb === 'function' && node !== null && parent !== null &&
          cb.call(this, chk, node, parent, pos ?? 0, more ?? {}) === false) ||
        (typeof cb === 'object' && cb !== null && cb[chk] === false);
      if (refused) {
        return refuse('core_03', 'User config for core.check_callback prevents function: ' + chk);
      }
    }

    // As in jstree, plugins check once the core rules pass — even when
    // data.functions permitted the operation — and refuse in their own name.
    for (const plugin of this.plugins) {
      const answer = plugin.onCheck?.(chk, node, parent, pos, more ?? {});
      if (answer && answer !== true) return refuse(answer.id, answer.reason, plugin.name);
    }
    return true;
  }

  private invokeBeforeActivate(node: TreeNode, event?: Event): boolean {
    for (const plugin of this.plugins) {
      if (!plugin.onBeforeActivate) continue;
      try {
        if (!plugin.onBeforeActivate(node, event)) return false;
      } catch (cause) {
        // A veto hook that throws states no intent. Fail closed: refusing
        // activation is visible and debuggable, whereas proceeding would
        // silently do the thing the hook may have meant to block.
        this.reportError({
          error: 'plugin_hook',
          hook: 'onBeforeActivate',
          plugin: plugin.name,
          id: node.id,
          cause,
        });
        return false;
      }
    }
    return true;
  }
}
