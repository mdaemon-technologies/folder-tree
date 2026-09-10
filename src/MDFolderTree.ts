import type {
  TreeConfig,
  TreeNode,
  TreeNodeData,
  TreePlugin,
  TreePluginHost,
  EventHandler,
  DataCallback,
  ChangedDetail,
} from './types';
import { TreeEventBus } from './events/TreeEventBus';
import { TreeRenderer } from './TreeRenderer';
import { TreeSelection } from './TreeSelection';
import { TreeNodeStore } from './TreeNode';
import { JsonParser } from './parsers/JsonParser';
import { HtmlParser } from './parsers/HtmlParser';
import { TypesPlugin } from './plugins/TypesPlugin';
import { CheckboxPlugin } from './plugins/CheckboxPlugin';
import { SearchPlugin } from './plugins/SearchPlugin';
import { ChangedPlugin } from './plugins/ChangedPlugin';
import { ConditionalSelectPlugin } from './plugins/ConditionalSelectPlugin';
import { WholerowPlugin } from './plugins/WholerowPlugin';
import { SortPlugin } from './plugins/SortPlugin';
import { UniquePlugin } from './plugins/UniquePlugin';
import { StatePlugin } from './plugins/StatePlugin';
import { ContextMenuPlugin } from './plugins/ContextMenuPlugin';
import { DndPlugin } from './plugins/DndPlugin';
import { MassloadPlugin } from './plugins/MassloadPlugin';

const EVENT_NS = 'MDFolderTree';

export class MDFolderTree implements TreePluginHost {
  readonly config: TreeConfig;
  private element: HTMLElement;
  private eventBus: TreeEventBus;
  private renderer: TreeRenderer;
  private selection: TreeSelection;
  private store: TreeNodeStore;
  private plugins: TreePlugin[] = [];
  private checkboxPlugin: CheckboxPlugin | null = null;
  private searchPlugin: SearchPlugin | null = null;
  private jsonParser: JsonParser;
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

  constructor(element: HTMLElement, config: TreeConfig = {}) {
    if (!element || !element.classList) {
      throw new Error('MDFolderTree: a valid DOM element is required as the first argument.');
    }
    this.element = element;
    this.config = this.mergeDefaults(config);
    this.eventBus = new TreeEventBus(element);
    this.store = new TreeNodeStore();
    this.rootNode = this.createRootNode();
    this.selection = new TreeSelection(this.config.core?.multiple ?? true);
    this.jsonParser = new JsonParser(() => this.mintId('mdft'));
    this.htmlParser = new HtmlParser();

    // Initialize plugins
    this.initPlugins();
    this.renderer = new TreeRenderer(
      element,
      this.plugins,
      this.config.core?.sanitize_attrs ?? true,
      (error) => this.reportError(error),
    );

    // Apply theme classes
    this.applyThemeClasses();

    // Load data and render
    this.loadData();

    // Bind DOM event delegation
    this.bindEvents();

    // Keyboard navigation
    this.bindKeyboard();
  }

  // ---- Public API (md-tree-compatible, no jQuery required) ----

  get_node(id: string, asDom?: boolean): TreeNode | HTMLElement | null {
    if (asDom) {
      return this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    }
    return this.store.get(id);
  }

  getNode(id: string): TreeNode | null {
    return this.store.get(id);
  }

  select_node(id: string, suppressEvent = false): void {
    this.selectNode(id, suppressEvent);
  }

  selectNode(id: string, suppress = false): void {
    const node = this.store.get(id);
    if (!node || node.state.disabled) return;

    const oldSelection = this.selection.getSelected();
    this.selection.select(id);
    this.syncSelectionFlags();

    // Sync checked state when checkbox plugin is active with tie_selection
    if (this.checkboxPlugin && this.config.checkbox?.tie_selection !== false) {
      node.state.checked = true;
    }

    // If single-select, repaint the nodes that just lost selection
    if (!(this.config.core?.multiple ?? true)) {
      for (const prevId of oldSelection) {
        if (prevId !== id) {
          const prev = this.store.get(prevId);
          if (prev) {
            if (this.checkboxPlugin && this.config.checkbox?.tie_selection !== false) {
              prev.state.checked = false;
            }
            this.renderer.renderSingleNode(prev, this.getNodeMap());
          }
        }
      }
    }

    this.renderer.renderSingleNode(node, this.getNodeMap());

    if (!suppress) {
      this.emit(`select_node.${EVENT_NS}`, { node, selected: this.selection.getSelected() });
      this.emitChanged('select_node', node, oldSelection);
    }
  }

  deselect_node(id: string, suppressEvent = false): void {
    this.deselectNode(id, suppressEvent);
  }

  deselectNode(id: string, suppress = false): void {
    const node = this.store.get(id);
    if (!node) return;

    const oldSelection = this.selection.getSelected();
    this.selection.deselect(id);
    this.syncSelectionFlags();

    // Sync checked state when checkbox plugin is active with tie_selection
    if (this.checkboxPlugin && this.config.checkbox?.tie_selection !== false) {
      node.state.checked = false;
    }

    this.renderer.renderSingleNode(node, this.getNodeMap());

    if (!suppress) {
      this.emit(`deselect_node.${EVENT_NS}`, { node, selected: this.selection.getSelected() });
      this.emitChanged('deselect_node', node, oldSelection);
    }
  }

  select_all(suppress = false): void {
    const oldSelection = this.selection.getSelected();
    const selectable = this.store.getAll()
      .filter((node) => !node.state.disabled)
      .map((node) => node.id);

    this.selection.selectAll(selectable);
    this.syncSelectionFlags();
    this.renderer.render(this.getRootNodes(), this.getNodeMap());

    if (!suppress) {
      this.emitChanged('select_all', null, oldSelection);
    }
  }

  deselect_all(suppress = false): void {
    const oldSelection = this.selection.getSelected();
    this.selection.deselectAll();
    this.syncSelectionFlags();
    this.renderer.render(this.getRootNodes(), this.getNodeMap());

    if (!suppress) {
      this.emitChanged('deselect_all', null, oldSelection);
    }
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

  open_node(id: string): void {
    this.openNode(id);
  }

  close_node(id: string): void {
    this.closeNode(id);
  }

  open_all(): void {
    for (const node of this.store.getAll()) {
      if (node.children.length > 0) {
        node.state.opened = true;
      }
    }
    this.renderer.render(this.getRootNodes(), this.getNodeMap());
  }

  close_all(): void {
    for (const node of this.store.getAll()) {
      node.state.opened = false;
    }
    this.renderer.render(this.getRootNodes(), this.getNodeMap());
  }

  enable_node(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    node.state.disabled = false;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    this.emit(`enable_node.${EVENT_NS}`, { node });
  }

  disable_node(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    node.state.disabled = true;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    this.emit(`disable_node.${EVENT_NS}`, { node });
  }

  refresh_node(id: string): void {
    this.redrawNode(id);
  }

  redrawNode(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    this.renderer.renderSingleNode(node, this.getNodeMap());
  }

  search(query: string): string[] {
    if (this.searchPlugin) {
      return this.searchPlugin.search(query);
    }
    return [];
  }

  clear_search(): void {
    if (this.searchPlugin) {
      this.searchPlugin.clearSearch();
    }
  }

  // ---- Checkbox API (delegated to plugin) ----

  check_node(id: string): void {
    if (this.checkboxPlugin) this.checkboxPlugin.check_node(id);
  }

  uncheck_node(id: string): void {
    if (this.checkboxPlugin) this.checkboxPlugin.uncheck_node(id);
  }

  check_all(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.check_all();
  }

  uncheck_all(): void {
    if (this.checkboxPlugin) this.checkboxPlugin.uncheck_all();
  }

  is_checked(id: string): boolean {
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

  is_undetermined(id: string): boolean {
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

  disable_checkbox(id: string): void {
    if (this.checkboxPlugin) this.checkboxPlugin.disable_checkbox(id);
  }

  enable_checkbox(id: string): void {
    if (this.checkboxPlugin) this.checkboxPlugin.enable_checkbox(id);
  }

  get_checked_descendants(id: string): string[] {
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

  move_node(id: string, parentId: string, position = 0): boolean {
    return this.moveNode(id, parentId, position);
  }

  copy_node(id: string, parentId: string, position = 0): string | false {
    return this.copyNode(id, parentId, position);
  }

  create_node(parentId: string, data: TreeNodeData, position?: number): TreeNode | false {
    return this.createNode(parentId, data, position);
  }

  rename_node(id: string, text: string): boolean {
    return this.renameNode(id, text);
  }

  delete_node(id: string): boolean {
    return this.deleteNode(id);
  }

  get_container(): HTMLElement {
    return this.getContainer();
  }

  // ---- Theme Runtime API ----

  private themeName = 'default';
  private themeVariant: string | false = false;

  set_theme(name: string, _url?: string): void {
    const old = this.themeName;
    this.element.classList.remove(`md-tree-${old}`);
    this.themeName = name;
    this.renderer.setThemeName(name);
    this.element.classList.add(`md-tree-${name}`);
    this.emit(`set_theme.${EVENT_NS}`, { theme: name });
  }

  get_theme(): string {
    return this.themeName;
  }

  set_theme_variant(variant: string | false): void {
    if (this.themeVariant) {
      this.element.classList.remove(`md-tree-${this.themeName}-${this.themeVariant}`);
    }
    this.themeVariant = variant;
    if (variant) {
      this.element.classList.add(`md-tree-${this.themeName}-${variant}`);
    }
  }

  // ---- State API ----

  get_state(): { opened: string[]; selected: string[] } {
    return {
      opened: this.getOpenedIds(),
      selected: this.getSelectedIds(),
    };
  }

  set_state(state: { opened?: string[]; selected?: string[] }, callback?: () => void): void {
    // Close all first
    for (const node of this.store.getAll()) {
      node.state.opened = false;
    }
    this.selection.deselectAll();

    // Restore opened
    if (state.opened) {
      for (const id of state.opened) {
        const node = this.store.get(id);
        if (node) node.state.opened = true;
      }
    }

    // Restore selected
    if (state.selected) {
      for (const id of state.selected) {
        if (this.store.has(id)) {
          this.selection.select(id);
        }
      }
    }
    this.syncSelectionFlags();

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`set_state.${EVENT_NS}`, { state });
    if (callback) callback();
  }

  // ---- Additional Utility Methods ----

  get_children_dom(id: string): HTMLElement[] {
    const selector = id === '#'
      ? '.md-tree-container-ul > .md-tree-node'
      : `#${CSS.escape(id)} > .md-tree-children > .md-tree-node`;
    return Array.from(this.element.querySelectorAll(selector)) as HTMLElement[];
  }

  is_loading(id: string): boolean {
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
    this.destroyed = true;

    for (const plugin of this.plugins) {
      plugin.destroy();
    }

    // Detach every listener bound directly to the container.
    this.listeners.abort();

    this.setFocused(null);
    this.buffer = null;

    this.eventBus.destroy();
    this.store.clear();
    this.rootNode.children = [];
    this.rootNode.children_d = [];
    this.element.classList.remove('md-tree', 'md-tree-default', 'md-tree-checkbox-no-clicked');
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

  openNode(id: string, suppress = false): void {
    const node = this.store.get(id);
    if (!node) return;

    // If the node hasn't been loaded yet, trigger lazy loading first
    if (!node.state.loaded && !node.state.loading && typeof this.config.core?.data === 'function') {
      this.load_node(id, () => {
        this.openNode(id, suppress);
      });
      return;
    }

    if (!suppress) {
      this.emit(`before_open.${EVENT_NS}`, { node });
    }
    node.state.opened = true;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    if (!suppress) {
      this.emit(`open_node.${EVENT_NS}`, { node });
      this.emit(`after_open.${EVENT_NS}`, { node });
    }
  }

  closeNode(id: string, suppress = false): void {
    const node = this.store.get(id);
    if (!node) return;
    node.state.opened = false;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    if (!suppress) {
      this.emit(`close_node.${EVENT_NS}`, { node });
      this.emit(`after_close.${EVENT_NS}`, { node });
    }
  }

  redraw(): void {
    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`redraw.${EVENT_NS}`, {});
  }

  moveNode(id: string, parentId: string, position: number): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    // A node may not become its own ancestor.
    if (this.wouldCreateCycle(id, parentId)) {
      this.reportError({ error: 'cycle', operation: 'move_node', id, parent: parentId, position });
      return false;
    }

    // Resolve the destination before mutating, so a refused move is a no-op.
    // Structural validation precedes check_callback so a consumer's callback
    // is never invoked for an operation that cannot succeed.
    const newParent = this.resolveParent(parentId);
    if (!newParent) {
      this.reportError({ error: 'missing_parent', operation: 'move_node', id, parent: parentId, position });
      return false;
    }

    // check_callback validation
    if (!this.checkOperation('move_node', node, parentId, position)) return false;

    // Remove from old parent
    const oldParent = this.resolveParent(node.parent);
    if (oldParent) {
      oldParent.children = oldParent.children.filter((cid) => cid !== id);
      oldParent.children_d = oldParent.children_d.filter((cid) => cid !== id);
    }

    // Add to new parent
    const pos = Math.min(position, newParent.children.length);
    newParent.children.splice(pos, 0, id);
    newParent.children_d.push(id);

    // Update node's parent reference; derived ancestry is rebuilt below.
    node.parent = parentId;
    this.reindex();

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`move_node.${EVENT_NS}`, { node, parent: parentId, position, old_parent: oldParent?.id ?? '#' });
    return true;
  }

  copyNode(id: string, parentId: string, position: number): string | false {
    const original = this.store.get(id);
    if (!original) return false;

    if (!this.checkOperation('copy_node', original, parentId, position)) return false;

    const newParent = this.resolveParent(parentId);
    if (!newParent) {
      this.reportError({ error: 'missing_parent', operation: 'copy_node', id, parent: parentId, position });
      return false;
    }

    const newId = this.copySubtree(original, parentId, new Set());
    const copy = this.store.get(newId)!;

    const pos = Math.min(position, newParent.children.length);
    newParent.children.splice(pos, 0, newId);
    this.reindex();

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`copy_node.${EVENT_NS}`, { node: copy, original, parent: parentId, position });
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
      li_attr: { ...source.li_attr },
      a_attr: { ...source.a_attr },
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
  private cloneData(data: TreeNodeData): TreeNodeData {
    try {
      return structuredClone(data);
    } catch {
      try {
        return JSON.parse(JSON.stringify(data)) as TreeNodeData;
      } catch {
        return { ...data };
      }
    }
  }

  renameNode(id: string, text: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    if (!this.checkOperation('rename_node', node, node.parent, 0)) return false;

    const oldText = node.text;
    node.text = text;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    this.emit(`rename_node.${EVENT_NS}`, { node, text, old: oldText });
    return true;
  }

  deleteNode(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    if (!this.checkOperation('delete_node', node, node.parent, 0)) return false;

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

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`delete_node.${EVENT_NS}`, { node, parent: parent?.id ?? '#' });
    return true;
  }

  createNode(parentId: string, data: TreeNodeData, position?: number): TreeNode | false {
    const parent = this.resolveParent(parentId);
    if (!parent) return false;

    if (!this.checkOperation('create_node', null!, parentId, position ?? 0)) return false;

    if (data.id && this.store.has(data.id)) {
      this.reportError({ error: 'duplicate_id', operation: 'create_node', id: data.id, parent: parentId });
      return false;
    }

    const node: TreeNode = {
      id: data.id || this.mintId('new'),
      text: data.text ?? '',
      icon: data.icon ?? false,
      type: data.type ?? 'default',
      parent: parentId,
      parents: this.buildParentChain(parentId),
      children: [],
      children_d: [],
      state: {
        opened: data.state?.opened ?? false,
        selected: data.state?.selected ?? false,
        disabled: data.state?.disabled ?? false,
        loaded: true,
        loading: false,
        checked: data.state?.checked ?? false,
      },
      li_attr: data.li_attr ?? {},
      a_attr: data.a_attr ?? {},
      original: data,
    };

    this.store.set(node.id, node);

    const pos = position != null ? Math.min(position, parent.children.length) : parent.children.length;
    parent.children.splice(pos, 0, node.id);
    this.reindex();

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`create_node.${EVENT_NS}`, { node, parent: parentId, position });
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
    this.renderer.render(this.getRootNodes(), this.getNodeMap());
  }

  getRootNodeIds(): string[] {
    return [...this.rootNode.children];
  }

  // ---- Core Utility Methods (Phase 1) ----

  get_parent(id: string): string | null {
    const node = this.store.get(id);
    if (!node) return null;
    return node.parent;
  }

  get_path(id: string, glue: string | false = '/', ids = false): string | string[] | false {
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

  get_text(id: string): string | false {
    const node = this.store.get(id);
    if (!node) return false;
    return node.text;
  }

  set_text(id: string, text: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    const old = node.text;
    node.text = text;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    this.emit(`set_text.${EVENT_NS}`, { node, text, old });
    return true;
  }

  get_json(id?: string, options?: { flat?: boolean; no_state?: boolean; no_id?: boolean; no_children?: boolean; no_data?: boolean }): TreeNodeData | TreeNodeData[] | false {
    const opts = options ?? {};

    const serializeNode = (node: TreeNode, includeChildren = true): TreeNodeData => {
      const result: TreeNodeData = {
        id: opts.no_id ? '' : node.id,
        text: node.text,
      };
      if (node.icon) result.icon = node.icon;
      if (node.type !== 'default') result.type = node.type;
      if (!opts.no_state) {
        const state: TreeNodeData['state'] = {};
        if (node.state.opened) state.opened = true;
        if (node.state.selected) state.selected = true;
        if (node.state.disabled) state.disabled = true;
        if (node.state.checked) state.checked = true;
        if (Object.keys(state).length > 0) result.state = state;
      }
      if (Object.keys(node.li_attr).length > 0) result.li_attr = { ...node.li_attr };
      if (Object.keys(node.a_attr).length > 0) result.a_attr = { ...node.a_attr };
      if (includeChildren && !opts.no_children && node.children.length > 0) {
        result.children = node.children
          .map((cid) => this.store.get(cid))
          .filter((child): child is TreeNode => child !== null)
          .map((child) => serializeNode(child));
      }
      return result;
    };

    if (!id || id === '#') {
      const roots = this.getRootNodes();
      if (opts.flat) {
        const flat: TreeNodeData[] = [];
        const walk = (n: TreeNode) => {
          // Flat output lists every node once; nesting them as well would
          // duplicate the whole tree inside its own first entry.
          flat.push(serializeNode(n, false));
          for (const cid of n.children) {
            const child = this.store.get(cid);
            if (child) walk(child);
          }
        };
        for (const root of roots) walk(root);
        return flat;
      }
      // Wrapped rather than passed by reference: `map` supplies an index,
      // which would bind to `includeChildren`.
      return roots.map((root) => serializeNode(root));
    }

    const node = this.store.get(id);
    if (!node) return false;
    return serializeNode(node);
  }

  is_selected(id: string): boolean {
    return this.selection.isSelected(id);
  }

  is_parent(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return node.children.length > 0;
  }

  is_leaf(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return node.children.length === 0;
  }

  is_open(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.opened;
  }

  is_closed(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return !node.state.opened && node.children.length > 0;
  }

  is_disabled(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.disabled;
  }

  is_loaded(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.loaded;
  }

  toggle_node(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    if (node.state.opened) {
      this.close_node(id);
    } else {
      this.open_node(id);
    }
  }

  get_next_dom(id: string, strict = false): HTMLElement | null {
    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (!el) return null;

    // If open and has children, first child
    if (!strict && el.classList.contains('md-tree-open')) {
      const childList = el.querySelector(':scope > .md-tree-children');
      if (childList) {
        const first = childList.querySelector(':scope > .md-tree-node') as HTMLElement | null;
        if (first) return first;
      }
    }

    // Next sibling
    let next = el.nextElementSibling as HTMLElement | null;
    if (next && next.classList.contains('md-tree-node')) return next;

    // Walk up and find parent's next sibling
    let parent = el.parentElement?.closest('.md-tree-node') as HTMLElement | null;
    while (parent) {
      next = parent.nextElementSibling as HTMLElement | null;
      if (next && next.classList.contains('md-tree-node')) return next;
      parent = parent.parentElement?.closest('.md-tree-node') as HTMLElement | null;
    }
    return null;
  }

  get_prev_dom(id: string, strict = false): HTMLElement | null {
    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (!el) return null;

    // Previous sibling
    const prev = el.previousElementSibling as HTMLElement | null;
    if (prev && prev.classList.contains('md-tree-node')) {
      if (!strict) {
        // Descend to last visible descendant
        let deepest = prev;
        while (deepest.classList.contains('md-tree-open')) {
          const childList = deepest.querySelector(':scope > .md-tree-children');
          if (!childList) break;
          const children = childList.querySelectorAll(':scope > .md-tree-node');
          if (children.length === 0) break;
          deepest = children[children.length - 1] as HTMLElement;
        }
        return deepest;
      }
      return prev;
    }

    // Parent
    const parent = el.parentElement?.closest('.md-tree-node') as HTMLElement | null;
    return parent ?? null;
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

  set_id(id: string, newId: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    if (this.store.has(newId)) return false;

    // Update store
    this.store.delete(id);
    node.id = newId;
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

  hide_node(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    node.state.hidden = true;
    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (el) el.classList.add('md-tree-hidden');
    this.emit(`hide_node.${EVENT_NS}`, { node });
  }

  show_node(id: string): void {
    const node = this.store.get(id);
    if (!node) return;
    node.state.hidden = false;
    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (el) el.classList.remove('md-tree-hidden');
    this.emit(`show_node.${EVENT_NS}`, { node });
  }

  hide_all(): void {
    for (const node of this.store.getAll()) {
      node.state.hidden = true;
    }
    const nodes = this.element.querySelectorAll('.md-tree-node');
    for (const el of Array.from(nodes)) {
      el.classList.add('md-tree-hidden');
    }
    this.emit(`hide_all.${EVENT_NS}`, {});
  }

  show_all(): void {
    for (const node of this.store.getAll()) {
      node.state.hidden = false;
    }
    const nodes = this.element.querySelectorAll('.md-tree-node');
    for (const el of Array.from(nodes)) {
      el.classList.remove('md-tree-hidden');
    }
    this.emit(`show_all.${EVENT_NS}`, {});
  }

  is_hidden(id: string): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    return node.state.hidden ?? false;
  }

  // ---- Theme Runtime Toggles (Phase 3) ----

  show_stripes(): void {
    this.element.classList.add('md-tree-striped');
    this.emit(`show_stripes.${EVENT_NS}`, {});
  }

  hide_stripes(): void {
    this.element.classList.remove('md-tree-striped');
    this.emit(`hide_stripes.${EVENT_NS}`, {});
  }

  toggle_stripes(): void {
    if (this.element.classList.contains('md-tree-striped')) {
      this.hide_stripes();
    } else {
      this.show_stripes();
    }
  }

  show_dots(): void {
    this.element.classList.remove('md-tree-no-dots');
    this.emit(`show_dots.${EVENT_NS}`, {});
  }

  hide_dots(): void {
    this.element.classList.add('md-tree-no-dots');
    this.emit(`hide_dots.${EVENT_NS}`, {});
  }

  toggle_dots(): void {
    if (this.element.classList.contains('md-tree-no-dots')) {
      this.show_dots();
    } else {
      this.hide_dots();
    }
  }

  show_icons(): void {
    this.element.classList.remove('md-tree-no-icons');
    this.emit(`show_icons.${EVENT_NS}`, {});
  }

  hide_icons(): void {
    this.element.classList.add('md-tree-no-icons');
    this.emit(`hide_icons.${EVENT_NS}`, {});
  }

  toggle_icons(): void {
    if (this.element.classList.contains('md-tree-no-icons')) {
      this.show_icons();
    } else {
      this.hide_icons();
    }
  }

  show_ellipsis(): void {
    this.element.classList.add('md-tree-ellipsis');
    this.emit(`show_ellipsis.${EVENT_NS}`, {});
  }

  hide_ellipsis(): void {
    this.element.classList.remove('md-tree-ellipsis');
    this.emit(`hide_ellipsis.${EVENT_NS}`, {});
  }

  toggle_ellipsis(): void {
    if (this.element.classList.contains('md-tree-ellipsis')) {
      this.hide_ellipsis();
    } else {
      this.show_ellipsis();
    }
  }

  set_icon(id: string, icon: string | false): boolean {
    const node = this.store.get(id);
    if (!node) return false;
    node.icon = icon;
    this.renderer.renderSingleNode(node, this.getNodeMap());
    return true;
  }

  get_icon(id: string): string | false {
    const node = this.store.get(id);
    if (!node) return false;
    return node.icon;
  }

  hide_icon(id: string): void {
    const el = this.element.querySelector(`#${CSS.escape(id)} > .md-tree-anchor > .md-tree-themeicon`) as HTMLElement | null;
    if (el) el.style.display = 'none';
  }

  show_icon(id: string): void {
    const el = this.element.querySelector(`#${CSS.escape(id)} > .md-tree-anchor > .md-tree-themeicon`) as HTMLElement | null;
    if (el) el.style.display = '';
  }

  // ---- Clipboard (Phase 4) ----

  private buffer: { mode: 'copy' | 'cut'; ids: string[] } | null = null;

  cut(ids: string | string[]): void {
    const nodeIds = Array.isArray(ids) ? ids : [ids];

    // Remove previous cut visual
    if (this.buffer?.mode === 'cut') {
      for (const bid of this.buffer.ids) {
        const el = this.element.querySelector(`#${CSS.escape(bid)}`);
        if (el) el.classList.remove('md-tree-cut');
      }
    }

    this.buffer = { mode: 'cut', ids: nodeIds };

    // Add cut visual
    for (const nid of nodeIds) {
      const el = this.element.querySelector(`#${CSS.escape(nid)}`);
      if (el) el.classList.add('md-tree-cut');
    }

    this.emit(`cut.${EVENT_NS}`, { ids: nodeIds });
  }

  copy(ids: string | string[]): void {
    const nodeIds = Array.isArray(ids) ? ids : [ids];

    // Remove previous cut visual if any
    if (this.buffer?.mode === 'cut') {
      for (const bid of this.buffer.ids) {
        const el = this.element.querySelector(`#${CSS.escape(bid)}`);
        if (el) el.classList.remove('md-tree-cut');
      }
    }

    this.buffer = { mode: 'copy', ids: nodeIds };
    this.emit(`copy.${EVENT_NS}`, { ids: nodeIds });
  }

  paste(targetId: string, position?: number): boolean {
    if (!this.buffer || this.buffer.ids.length === 0) return false;

    const pos = position ?? 0;
    let success = false;

    if (this.buffer.mode === 'cut') {
      for (const nid of this.buffer.ids) {
        if (this.moveNode(nid, targetId, pos)) {
          success = true;
        }
      }
    } else {
      for (const nid of this.buffer.ids) {
        if (this.copyNode(nid, targetId, pos)) {
          success = true;
        }
      }
    }

    if (success) {
      this.emit(`paste.${EVENT_NS}`, { ids: this.buffer.ids, mode: this.buffer.mode, parent: targetId, position: pos });
    }

    this.clear_buffer();
    return success;
  }

  get_buffer(): { mode: 'copy' | 'cut'; ids: string[] } | null {
    return this.buffer ? { ...this.buffer, ids: [...this.buffer.ids] } : null;
  }

  can_paste(): boolean {
    return this.buffer !== null && this.buffer.ids.length > 0;
  }

  clear_buffer(): void {
    if (this.buffer?.mode === 'cut') {
      for (const bid of this.buffer.ids) {
        const el = this.element.querySelector(`#${CSS.escape(bid)}`);
        if (el) el.classList.remove('md-tree-cut');
      }
    }
    this.buffer = null;
    this.emit(`clear_buffer.${EVENT_NS}`, {});
  }

  // ---- Inline Editing (Phase 5) ----

  edit(id: string, defaultText?: string, callback?: (node: TreeNode, status: boolean, cancel: boolean) => void): void {
    const node = this.store.get(id);
    if (!node) return;

    const el = this.element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (!el) return;

    const anchor = el.querySelector(':scope > .md-tree-anchor') as HTMLElement | null;
    if (!anchor) return;

    // Find the text span
    const textSpan = anchor.querySelector('span') as HTMLElement | null;
    if (!textSpan) return;

    const originalText = node.text;
    const editText = defaultText ?? originalText;

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'md-tree-rename-input';
    input.value = editText;

    // Hide text, show input
    textSpan.style.display = 'none';
    anchor.appendChild(input);
    input.focus();
    input.select();

    this.emit(`edit.${EVENT_NS}`, { node });

    const commit = () => {
      const newText = input.value.trim();
      cleanup();
      if (newText && newText !== originalText) {
        this.renameNode(id, newText);
        if (callback) callback(node, true, false);
      } else {
        if (callback) callback(node, false, false);
      }
    };

    const cancel = () => {
      cleanup();
      if (callback) callback(node, false, true);
    };

    const cleanup = () => {
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      if (input.parentElement) input.parentElement.removeChild(input);
      textSpan.style.display = '';
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    const onBlur = () => {
      commit();
    };

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
  }

  // ---- Keyboard Navigation (Phase 6) ----

  private focusedId: string | null = null;

  private setFocused(id: string | null): void {
    // Remove old focus
    if (this.focusedId) {
      const oldEl = this.element.querySelector(`#${CSS.escape(this.focusedId)} > .md-tree-anchor`);
      if (oldEl) oldEl.classList.remove('md-tree-focused');
    }

    this.focusedId = id;

    // Add new focus
    if (id) {
      const newEl = this.element.querySelector(`#${CSS.escape(id)} > .md-tree-anchor`) as HTMLElement | null;
      if (newEl) {
        newEl.classList.add('md-tree-focused');
        if (newEl.scrollIntoView) newEl.scrollIntoView({ block: 'nearest' });
      }
      this.element.setAttribute('aria-activedescendant', id);
    } else {
      this.element.removeAttribute('aria-activedescendant');
    }
  }

  private getFirstVisibleNodeId(): string | null {
    const first = this.element.querySelector('.md-tree-container-ul > .md-tree-node:not(.md-tree-hidden)') as HTMLElement | null;
    return first?.id ?? null;
  }

  private getLastVisibleNodeId(): string | null {
    const all = this.element.querySelectorAll('.md-tree-node:not(.md-tree-hidden)');
    // Find the last node that no collapsed *ancestor* is hiding. Searching
    // from the node itself would reject every closed parent, which is visible.
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i] as HTMLElement;
      if (!el.parentElement?.closest('.md-tree-closed')) {
        return el.id;
      }
    }
    return null;
  }

  private bindKeyboard(): void {
    this.element.setAttribute('tabindex', '0');

    this.element.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.destroyed) return;

      const currentId = this.focusedId;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (!currentId) {
            this.setFocused(this.getFirstVisibleNodeId());
          } else {
            const next = this.get_next_dom(currentId);
            if (next) this.setFocused(next.id);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (!currentId) {
            this.setFocused(this.getFirstVisibleNodeId());
          } else {
            const prev = this.get_prev_dom(currentId);
            if (prev) this.setFocused(prev.id);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (!currentId) break;
          const node = this.store.get(currentId);
          if (!node) break;
          if (node.children.length > 0 && !node.state.opened) {
            this.open_node(currentId);
          } else if (node.state.opened && node.children.length > 0) {
            // Focus first child
            const firstChild = this.element.querySelector(`#${CSS.escape(currentId)} > .md-tree-children > .md-tree-node`) as HTMLElement | null;
            if (firstChild) this.setFocused(firstChild.id);
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (!currentId) break;
          const node = this.store.get(currentId);
          if (!node) break;
          if (node.state.opened) {
            this.close_node(currentId);
          } else if (node.parent !== '#') {
            this.setFocused(node.parent);
          }
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (!currentId) break;
          const node = this.store.get(currentId);
          if (!node || node.state.disabled) break;
          if (!this.invokeBeforeActivate(node, e)) break;
          if (this.checkboxPlugin) {
            this.toggleNodeChecked(currentId, e);
          } else if (node.state.selected && (this.config.core?.multiple ?? true)) {
            this.deselectNode(currentId);
          } else {
            this.selectNode(currentId);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          this.setFocused(this.getFirstVisibleNodeId());
          break;
        }
        case 'End': {
          e.preventDefault();
          this.setFocused(this.getLastVisibleNodeId());
          break;
        }
        case 'F2': {
          e.preventDefault();
          if (currentId) {
            this.edit(currentId);
          }
          break;
        }
        case 'Delete': {
          e.preventDefault();
          if (currentId) {
            this.deleteNode(currentId);
          }
          break;
        }
        case 'x': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const selected = this.get_selected();
            if (selected.length > 0) {
              this.cut(selected);
            } else if (currentId) {
              this.cut(currentId);
            }
          }
          break;
        }
        case 'c': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const selected = this.get_selected();
            if (selected.length > 0) {
              this.copy(selected);
            } else if (currentId) {
              this.copy(currentId);
            }
          }
          break;
        }
        case 'v': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const target = currentId ?? this.getRootNodeIds()[0];
            if (target) this.paste(target);
          }
          break;
        }
      }
    }, { signal: this.listeners.signal });

    // Set initial focus on click
    this.element.addEventListener('click', () => {
      const selected = this.get_selected();
      if (selected.length > 0 && !this.focusedId) {
        this.setFocused(selected[0]);
      }
    }, { signal: this.listeners.signal });
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

        this.renderer.render(this.getRootNodes(), this.getNodeMap());
        this.emit(`refresh.${EVENT_NS}`, {});
      },
    });
  }

  load_node(id: string, callback?: (node: TreeNode, status: boolean) => void): boolean {
    const node = this.store.get(id);
    if (!node) return false;

    const coreData = this.config.core?.data;
    if (typeof coreData !== 'function') {
      if (callback) callback(node, false);
      return false;
    }

    node.state.loading = true;
    node.state.loaded = false;
    this.renderer.renderSingleNode(node, this.getNodeMap());

    const settle = (): void => {
      node.state.loading = false;
      this.renderer.renderSingleNode(node, this.getNodeMap());
    };

    try {
      this.invokeDataCallback(coreData as DataCallback, node, callback);
    } catch (cause) {
      this.reportError({ error: 'load_failed', operation: 'load_node', id, cause });
      settle();
      if (callback) callback(node, false);
      return false;
    }

    return true;
  }

  private invokeDataCallback(
    coreData: DataCallback,
    node: TreeNode,
    callback?: (node: TreeNode, status: boolean) => void,
  ): void {
    coreData(node, (data: TreeNodeData[]) => {
      // Clear existing children
      for (const cid of [...node.children]) {
        this.removeSubtree(cid);
      }
      node.children = [];
      node.children_d = [];

      // Parse and add new children through the same normalization the
      // initial load uses, so defaults and generated ids are applied.
      this.buildNodeTree(this.jsonParser.parse(data), node.id);
      this.reindex();

      node.state.loading = false;
      node.state.loaded = true;

      this.renderer.render(this.getRootNodes(), this.getNodeMap());
      this.emit(`load_node.${EVENT_NS}`, { node });
      if (callback) callback(node, true);
    });
  }

  load_all(id?: string, callback?: () => void): void {
    const rootId = id ?? '#';
    const nodesToLoad: string[] = [];

    const collect = (nid: string) => {
      const n = nid === '#' ? null : this.store.get(nid);
      const children = nid === '#'
        ? this.getRootNodeIds()
        : n?.children ?? [];

      for (const cid of children) {
        const child = this.store.get(cid);
        if (child && !child.state.loaded && child.children.length === 0) {
          nodesToLoad.push(cid);
        }
        collect(cid);
      }
    };

    collect(rootId);

    if (nodesToLoad.length === 0) {
      this.emit(`load_all.${EVENT_NS}`, {});
      if (callback) callback();
      return;
    }

    let loaded = 0;
    for (const nid of nodesToLoad) {
      this.load_node(nid, () => {
        loaded++;
        if (loaded >= nodesToLoad.length) {
          this.emit(`load_all.${EVENT_NS}`, {});
          if (callback) callback();
        }
      });
    }
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

  private applyThemeClasses(): void {
    const themes = this.config.core?.themes;
    if (themes) {
      if (themes.dots === false) {
        this.element.classList.add('md-tree-no-dots');
      } else {
        this.element.classList.remove('md-tree-no-dots');
      }
      if (themes.icons === false) {
        this.element.classList.add('md-tree-no-icons');
      } else {
        this.element.classList.remove('md-tree-no-icons');
      }
    }
  }

  /**
   * Checkbox-mode activation. Delegates to CheckboxPlugin — the single owner
   * of cascade, `tie_selection` and the `cascade_to_*` options — then emits
   * the selection-change events the core is responsible for.
   */
  private toggleNodeChecked(id: string, event?: Event): void {
    const plugin = this.checkboxPlugin;
    if (!plugin) return;
    const node = this.store.get(id);
    if (!node) return;

    const oldSelection = this.selection.getSelected();
    const willCheck = !node.state.checked;

    if (willCheck) {
      plugin.check_node(id);
    } else {
      plugin.uncheck_node(id);
    }

    // Selection events only make sense while checking is tied to selection.
    if (this.config.checkbox?.tie_selection !== false) {
      const selected = this.selection.getSelected();
      const action = willCheck ? 'select_node' : 'deselect_node';
      this.emit(`${action}.${EVENT_NS}`, { node, selected, event });
      this.emitChanged(action, node, oldSelection);
    }
  }

  private initPlugins(): void {
    const pluginNames = this.config.plugins ?? [];

    if (pluginNames.includes('types') || this.config.types) {
      const p = new TypesPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('checkbox')) {
      const p = new CheckboxPlugin();
      p.init(this);
      this.plugins.push(p);
      this.checkboxPlugin = p;
    }

    if (pluginNames.includes('search')) {
      const p = new SearchPlugin();
      p.init(this);
      this.plugins.push(p);
      this.searchPlugin = p;
    }

    if (pluginNames.includes('changed')) {
      const p = new ChangedPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('conditionalselect')) {
      const p = new ConditionalSelectPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('wholerow')) {
      const p = new WholerowPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('sort')) {
      const p = new SortPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('unique')) {
      const p = new UniquePlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('state')) {
      const p = new StatePlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('contextmenu')) {
      const p = new ContextMenuPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('dnd')) {
      const p = new DndPlugin();
      p.init(this);
      this.plugins.push(p);
    }

    if (pluginNames.includes('massload')) {
      const p = new MassloadPlugin();
      p.init(this);
      this.plugins.push(p);
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
      if (emitLifecycle) {
        // Deferred by a microtask: for synchronous data these would otherwise
        // fire before the constructor returns, so no consumer could ever
        // subscribe in time to observe them.
        queueMicrotask(() => {
          if (this.destroyed) return;
          this.emit(`loaded.${EVENT_NS}`, {});
          this.emit(`ready.${EVENT_NS}`, { instance: this });
        });
      }
      onComplete?.();
    };

    if (emitLifecycle) this.emit(`loading.${EVENT_NS}`, {});

    // Registered up front so `MDFolderTree.getInstance()` resolves inside a
    // `ready` handler.
    (this.element as unknown as Record<string, unknown>).__mdFolderTree = this;

    if (typeof coreData === 'function') {
      // Pattern A: data callback
      (coreData as DataCallback)(this.rootNode, (data: TreeNodeData[]) => {
        const parsed = this.jsonParser.parse(data);
        this.buildNodeTree(parsed, '#');
        this.reindex();
        this.syncSelectionFlags();
        this.renderer.render(this.getRootNodes(), this.getNodeMap());
        finish();
      });
    } else if (Array.isArray(coreData)) {
      // Pattern A variant: static JSON array
      const parsed = this.jsonParser.parse(coreData);
      this.buildNodeTree(parsed, '#');
      this.reindex();
      this.syncSelectionFlags();
      this.renderer.render(this.getRootNodes(), this.getNodeMap());
      finish();
    } else {
      // Pattern B: parse existing HTML
      const parsed = this.jsonParser.parse(this.htmlParser.parse(this.element));
      if (parsed.length > 0) {
        this.buildNodeTree(parsed, '#');
        this.reindex();
        this.syncSelectionFlags();
        this.renderer.render(this.getRootNodes(), this.getNodeMap());
      }
      finish();
    }

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
    // Pass 1: create every node, so forward parent references resolve.
    const accepted: TreeNodeData[] = [];
    for (const raw of data) {
      if (this.store.has(raw.id)) {
        this.reportError({ error: 'duplicate_id', operation: 'load', id: raw.id, parent: parentId });
        continue;
      }
      this.store.set(raw.id, this.materializeNode(raw, (raw.parent as string) ?? parentId));
      accepted.push(raw);
    }

    // Pass 2: attach to parents and recurse into nested children.
    for (const raw of accepted) {
      const node = this.store.get(raw.id)!;

      // A parent named but never supplied would leave the node attached to
      // nothing and silently unrenderable; rescue it to the root instead.
      let parent = this.resolveParent(node.parent);
      if (!parent) {
        this.reportError({
          error: 'missing_parent',
          operation: 'load',
          id: node.id,
          parent: node.parent,
        });
        node.parent = '#';
        parent = this.rootNode;
      }
      parent.children.push(node.id);
      parent.children_d.push(node.id);

      if (node.state.selected) {
        this.selection.select(node.id);
      }

      if (Array.isArray(raw.children)) {
        this.buildNodeTree(raw.children, node.id);
      }
    }
  }

  /** Build the internal node representation from normalized raw data. */
  private materializeNode(raw: TreeNodeData, parentId: string): TreeNode {
    return {
      id: raw.id,
      text: raw.text,
      icon: raw.icon ?? false,
      type: raw.type ?? 'default',
      parent: parentId,
      parents: [],
      children: [],
      children_d: [],
      state: {
        opened: raw.state?.opened ?? false,
        selected: raw.state?.selected ?? false,
        disabled: raw.state?.disabled ?? false,
        loaded: raw.children !== true,
        loading: false,
        checked: raw.state?.checked ?? false,
      },
      li_attr: raw.li_attr ?? {},
      a_attr: raw.a_attr ?? {},
      original: raw,
    };
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
    for (const node of this.store.getAll()) {
      node.state.selected = this.selection.isSelected(node.id);
    }
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

  private getNodeMap(): Map<string, TreeNode> {
    const map = new Map<string, TreeNode>();
    for (const node of this.store.getAll()) {
      map.set(node.id, node);
    }
    return map;
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
        if (li) {
          const node = this.store.get(li.id);
          if (node && !node.state.disabled) {
            // Check onBeforeActivate hook (conditionalselect)
            if (!this.invokeBeforeActivate(node, e)) return;

            this.emit(`activate_node.${EVENT_NS}`, { node, event: e });

            if (this.checkboxPlugin) {
              // Checkbox mode: toggle checked state
              this.toggleNodeChecked(li.id, e);
            } else if (node.state.selected && (this.config.core?.multiple ?? true)) {
              this.deselectNode(li.id);
            } else {
              this.selectNode(li.id);
            }
          }
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
      const anchor = (e.target as HTMLElement).closest?.('.md-tree-anchor') as HTMLElement | null;
      if (anchor) {
        anchor.classList.add('md-tree-hovered');
        const li = anchor.closest('.md-tree-node') as HTMLElement | null;
        if (li) {
          const node = this.store.get(li.id);
          if (node) this.emit(`hover_node.${EVENT_NS}`, { node });
        }
      }
    }, { capture: true, signal: this.listeners.signal });

    this.element.addEventListener('mouseleave', (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.('.md-tree-anchor') as HTMLElement | null;
      if (anchor) {
        anchor.classList.remove('md-tree-hovered');
        const li = anchor.closest('.md-tree-node') as HTMLElement | null;
        if (li) {
          const node = this.store.get(li.id);
          if (node) this.emit(`dehover_node.${EVENT_NS}`, { node });
        }
      }
    }, { capture: true, signal: this.listeners.signal });
  }

  private emitChanged(action: string, node: TreeNode | null, oldSelection: string[]): void {
    const selected = this.selection.getSelected();
    const detail: ChangedDetail = {
      action,
      node,
      selected,
      old_selection: oldSelection,
      changed: {
        selected: selected.filter((id) => !oldSelection.includes(id)),
        deselected: oldSelection.filter((id) => !selected.includes(id)),
      },
    };
    this.emit(`changed.${EVENT_NS}`, detail);
  }

  /** Record an error and surface it through the `core.error` callback. */
  private reportError(error: Record<string, unknown>): void {
    this.lastError = error;
    if (this.config.core?.error) this.config.core.error(error);
  }

  private checkOperation(operation: string, node: TreeNode | null, parentId: string, position: number): boolean {
    const cb = this.config.core?.check_callback;
    if (cb === true) return true;

    const reject = (): void => this.reportError({
      error: 'check_callback',
      operation,
      id: node?.id,
      parent: parentId,
      position,
    });

    if (cb === false) {
      reject();
      return false;
    }
    if (typeof cb === 'function') {
      const parent = this.resolveParent(parentId) ?? this.createRootNode();
      const result = cb(operation, node!, parent, position, {});
      if (!result) reject();
      return result;
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
