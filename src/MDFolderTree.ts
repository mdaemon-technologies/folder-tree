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

  constructor(element: HTMLElement, config: TreeConfig = {}) {
    if (!element || !element.classList) {
      throw new Error('MDFolderTree: a valid DOM element is required as the first argument.');
    }
    this.element = element;
    this.config = this.mergeDefaults(config);
    this.eventBus = new TreeEventBus(element);
    this.store = new TreeNodeStore();
    this.selection = new TreeSelection(this.config.core?.multiple ?? true);
    this.jsonParser = new JsonParser();
    this.htmlParser = new HtmlParser();

    // Initialize plugins
    this.initPlugins();
    this.renderer = new TreeRenderer(element, this.plugins, this.config.core?.sanitize_attrs ?? false);

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
    node.state.selected = true;
    this.selection.select(id);

    // Sync checked state when checkbox plugin is active with tie_selection
    if (this.checkboxPlugin && this.config.checkbox?.tie_selection !== false) {
      node.state.checked = true;
    }

    // If single-select, deselect others
    if (!(this.config.core?.multiple ?? true)) {
      for (const prevId of oldSelection) {
        if (prevId !== id) {
          const prev = this.store.get(prevId);
          if (prev) {
            prev.state.selected = false;
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
    node.state.selected = false;
    this.selection.deselect(id);

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
    const allIds = this.store.getAllIds();
    for (const id of allIds) {
      const node = this.store.get(id);
      if (node && !node.state.disabled) {
        node.state.selected = true;
      }
    }
    this.selection.selectAll(allIds.filter((id) => !this.store.get(id)?.state.disabled));
    this.renderer.render(this.getRootNodes(), this.getNodeMap());

    if (!suppress) {
      this.emitChanged('select_all', null, []);
    }
  }

  deselect_all(suppress = false): void {
    const oldSelection = this.selection.getSelected();
    for (const id of oldSelection) {
      const node = this.store.get(id);
      if (node) node.state.selected = false;
    }
    this.selection.deselectAll();
    this.renderer.render(this.getRootNodes(), this.getNodeMap());

    if (!suppress) {
      this.emitChanged('deselect_all', null, oldSelection);
    }
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
      node.state.selected = false;
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
        const node = this.store.get(id);
        if (node) {
          node.state.selected = true;
          this.selection.select(id);
        }
      }
    }

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

    this.eventBus.destroy();
    this.store.clear();
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

    // check_callback validation
    if (!this.checkOperation('move_node', node, parentId, position)) return false;

    // Remove from old parent
    const oldParent = this.store.get(node.parent);
    if (oldParent) {
      oldParent.children = oldParent.children.filter((cid) => cid !== id);
      oldParent.children_d = oldParent.children_d.filter((cid) => cid !== id);
    }

    // Add to new parent
    const newParent = this.store.get(parentId);
    if (newParent) {
      const pos = Math.min(position, newParent.children.length);
      newParent.children.splice(pos, 0, id);
      newParent.children_d.push(id);
    }

    // Update node's parent references
    node.parent = parentId;
    node.parents = this.buildParentChain(parentId);

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`move_node.${EVENT_NS}`, { node, parent: parentId, position, old_parent: oldParent?.id ?? '#' });
    return true;
  }

  copyNode(id: string, parentId: string, position: number): string | false {
    const original = this.store.get(id);
    if (!original) return false;

    if (!this.checkOperation('copy_node', original, parentId, position)) return false;

    const newId = `${id}_copy_${Date.now()}`;
    const copy: TreeNode = {
      ...original,
      id: newId,
      parent: parentId,
      parents: this.buildParentChain(parentId),
      children: [],
      children_d: [],
      state: { ...original.state, selected: false },
    };

    this.store.set(newId, copy);

    const newParent = this.store.get(parentId);
    if (newParent) {
      const pos = Math.min(position, newParent.children.length);
      newParent.children.splice(pos, 0, newId);
      newParent.children_d.push(newId);
    }

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`copy_node.${EVENT_NS}`, { node: copy, original, parent: parentId, position });
    return newId;
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
    const parent = this.store.get(node.parent);
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

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`delete_node.${EVENT_NS}`, { node, parent: parent?.id ?? '#' });
    return true;
  }

  createNode(parentId: string, data: TreeNodeData, position?: number): TreeNode | false {
    const parent = parentId === '#' ? null : this.store.get(parentId);
    if (parentId !== '#' && !parent) return false;

    if (!this.checkOperation('create_node', null!, parentId, position ?? 0)) return false;

    const node: TreeNode = {
      id: data.id || `new_${Date.now()}`,
      text: data.text,
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

    if (parent) {
      const pos = position != null ? Math.min(position, parent.children.length) : parent.children.length;
      parent.children.splice(pos, 0, node.id);
      parent.children_d.push(node.id);
    }

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`create_node.${EVENT_NS}`, { node, parent: parentId, position });
    return node;
  }

  reorderChildren(parentId: string, childIds: string[]): void {
    if (parentId === '#') {
      // Reorder root nodes - we store them by order in the store traversal
      // Root ordering is implicit from insertion order; for sort we just re-render
      this.renderer.render(this.getRootNodes(), this.getNodeMap());
      return;
    }
    const parent = this.store.get(parentId);
    if (!parent) return;
    parent.children = childIds;
    this.renderer.render(this.getRootNodes(), this.getNodeMap());
  }

  getRootNodeIds(): string[] {
    return this.store.getAll().filter((n) => n.parent === '#').map((n) => n.id);
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

    const serializeNode = (node: TreeNode): TreeNodeData => {
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
      if (!opts.no_children && node.children.length > 0) {
        result.children = node.children.map((cid) => serializeNode(this.store.get(cid)!)).filter(Boolean);
      }
      return result;
    };

    if (!id || id === '#') {
      const roots = this.getRootNodes();
      if (opts.flat) {
        const flat: TreeNodeData[] = [];
        const walk = (n: TreeNode) => {
          flat.push(serializeNode(n));
          for (const cid of n.children) {
            const child = this.store.get(cid);
            if (child) walk(child);
          }
        };
        for (const root of roots) walk(root);
        return flat;
      }
      return roots.map(serializeNode);
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
    const parent = this.store.get(node.parent);
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
        child.parents = child.parents.map((p) => p === id ? newId : p);
      }
    }

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
    // Find last visible (not inside a closed parent)
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i] as HTMLElement;
      // Check if visible (not inside a closed node)
      if (el.offsetParent !== null || el.closest('.md-tree-closed') === null) {
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
            this.toggleChecked(currentId);
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
    });

    // Set initial focus on click
    this.element.addEventListener('click', () => {
      const selected = this.get_selected();
      if (selected.length > 0 && !this.focusedId) {
        this.setFocused(selected[0]);
      }
    });
  }

  // ---- Refresh & Load (Phase 8) ----

  refresh(): void {
    if (this.destroyed) return;

    // Save state
    const openedIds = this.getOpenedIds();
    const selectedIds = this.getSelectedIds();

    // Clear
    this.store.clear();
    this.selection.deselectAll();

    // Reload
    this.loadData();

    // Restore state
    for (const id of openedIds) {
      const node = this.store.get(id);
      if (node) node.state.opened = true;
    }
    for (const id of selectedIds) {
      const node = this.store.get(id);
      if (node) {
        node.state.selected = true;
        this.selection.select(id);
      }
    }

    this.renderer.render(this.getRootNodes(), this.getNodeMap());
    this.emit(`refresh.${EVENT_NS}`, {});
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

    (coreData as DataCallback)(node, (data: TreeNodeData[]) => {
      // Clear existing children
      for (const cid of [...node.children]) {
        this.removeSubtree(cid);
      }
      node.children = [];
      node.children_d = [];

      // Parse and add new children
      this.buildNodeTree(data, node.id);

      node.state.loading = false;
      node.state.loaded = true;

      this.renderer.render(this.getRootNodes(), this.getNodeMap());
      this.emit(`load_node.${EVENT_NS}`, { node });
      if (callback) callback(node, true);
    });

    return true;
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

  private toggleChecked(id: string): void {
    const node = this.store.get(id);
    if (!node) return;

    const newChecked = !node.state.checked;
    const threeState = this.config.checkbox?.three_state !== false;

    // If single-select, uncheck all others first
    if (!(this.config.core?.multiple ?? true) && newChecked) {
      for (const n of this.store.getAll()) {
        if (n.id !== id && n.state.checked) {
          n.state.checked = false;
          n.state.selected = false;
          this.selection.deselect(n.id);
          const el = this.element.querySelector(`#${CSS.escape(n.id)}`);
          if (el) el.classList.remove('md-tree-checked');
        }
      }
    }

    // Toggle the clicked node
    this.setChecked(id, newChecked);

    // Cascade to children if three_state
    if (threeState && node.children.length > 0) {
      this.cascadeChecked(node.children, newChecked);
    }

    // Update parent undetermined state
    if (node.parent && node.parent !== '#' && this.checkboxPlugin) {
      this.checkboxPlugin.updateUndetermined(node.parent);
    }

    this.emit(`select_node.${EVENT_NS}`, { node, selected: this.selection.getSelected() });
  }

  private setChecked(id: string, checked: boolean): void {
    const node = this.store.get(id);
    if (!node) return;

    node.state.checked = checked;
    node.state.selected = checked;

    if (checked) {
      this.selection.select(id);
    } else {
      this.selection.deselect(id);
    }

    const nodeEl = this.element.querySelector(`#${CSS.escape(id)}`);
    if (nodeEl) {
      if (checked) {
        nodeEl.classList.add('md-tree-checked');
      } else {
        nodeEl.classList.remove('md-tree-checked');
      }
    }
  }

  private cascadeChecked(childIds: string[], checked: boolean): void {
    for (const childId of childIds) {
      this.setChecked(childId, checked);
      const child = this.store.get(childId);
      if (child && child.children.length > 0) {
        this.cascadeChecked(child.children, checked);
      }
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

  private loadData(): void {
    const coreData = this.config.core?.data;

    this.emit(`loading.${EVENT_NS}`, {});

    if (typeof coreData === 'function') {
      // Pattern A: data callback
      const rootNode = this.createRootNode();
      (coreData as DataCallback)(rootNode, (data: TreeNodeData[]) => {
        const parsed = this.jsonParser.parse(data);
        this.buildNodeTree(parsed, '#');
        this.renderer.render(this.getRootNodes(), this.getNodeMap());
        this.emit(`loaded.${EVENT_NS}`, {});
        this.emit(`ready.${EVENT_NS}`, { instance: this });
      });
    } else if (Array.isArray(coreData)) {
      // Pattern A variant: static JSON array
      const parsed = this.jsonParser.parse(coreData);
      this.buildNodeTree(parsed, '#');
      this.renderer.render(this.getRootNodes(), this.getNodeMap());
      this.emit(`loaded.${EVENT_NS}`, {});
      this.emit(`ready.${EVENT_NS}`, { instance: this });
    } else {
      // Pattern B: parse existing HTML
      const parsed = this.htmlParser.parse(this.element);
      if (parsed.length > 0) {
        this.buildNodeTree(parsed, '#');
        this.renderer.render(this.getRootNodes(), this.getNodeMap());
      }
      this.emit(`loaded.${EVENT_NS}`, {});
      this.emit(`ready.${EVENT_NS}`, { instance: this });
    }

    // Store instance reference on element
    (this.element as unknown as Record<string, unknown>).__mdFolderTree = this;
  }

  private buildNodeTree(data: TreeNodeData[], parentId: string): void {
    // Check if this is a flat array with parent references (jstree-style)
    const hasParentRefs = data.some(
      (n) => typeof n.parent === 'string' && n.parent !== parentId
    );

    if (hasParentRefs) {
      // Two-pass approach for flat arrays with parent references
      // Pass 1: Create all nodes in the store
      for (const raw of data) {
        const nodeParent = (raw.parent as string) ?? parentId;
        const node: TreeNode = {
          id: raw.id,
          text: raw.text,
          icon: raw.icon ?? false,
          type: raw.type ?? 'default',
          parent: nodeParent,
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

        this.store.set(node.id, node);

        if (node.state.selected) {
          this.selection.select(node.id);
        }
      }

      // Pass 2: Wire up parent-child relationships
      for (const raw of data) {
        const node = this.store.get(raw.id)!;
        const nodeParent = (raw.parent as string) ?? parentId;

        if (nodeParent !== '#') {
          const parent = this.store.get(nodeParent);
          if (parent) {
            parent.children.push(node.id);
            parent.children_d.push(node.id);
          }
        }

        node.parents = this.buildParentChain(nodeParent);

        if (Array.isArray(raw.children)) {
          this.buildNodeTree(raw.children, node.id);
        }
      }
    } else {
      // Original behavior: all items are children of parentId
      for (const raw of data) {
        const node: TreeNode = {
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

        this.store.set(node.id, node);

        if (node.state.selected) {
          this.selection.select(node.id);
        }

        if (parentId !== '#') {
          const parent = this.store.get(parentId);
          if (parent) {
            parent.children.push(node.id);
            parent.children_d.push(node.id);
          }
        }

        node.parents = this.buildParentChain(parentId);

        if (Array.isArray(raw.children)) {
          this.buildNodeTree(raw.children, node.id);
        }
      }
    }
  }

  private buildParentChain(parentId: string): string[] {
    const chain: string[] = [];
    let current = parentId;
    while (current !== '#') {
      chain.push(current);
      const parentNode = this.store.get(current);
      current = parentNode?.parent ?? '#';
    }
    chain.push('#');
    return chain;
  }

  private getRootNodes(): TreeNode[] {
    return this.store.getAll().filter((n) => n.parent === '#');
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
        const li = anchor.closest('.md-tree-node') as HTMLElement | null;
        if (li) {
          const node = this.store.get(li.id);
          if (node && !node.state.disabled) {
            // Check onBeforeActivate hook (conditionalselect)
            if (!this.invokeBeforeActivate(node, e)) return;

            this.emit(`activate_node.${EVENT_NS}`, { node, event: e });

            if (this.checkboxPlugin) {
              // Checkbox mode: toggle checked state
              this.toggleChecked(li.id);
            } else if (node.state.selected && (this.config.core?.multiple ?? true)) {
              this.deselectNode(li.id);
            } else {
              this.selectNode(li.id);
            }
          }
        }
        e.preventDefault();
      }
    });

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
    });

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
    }, true);

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
    }, true);
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

  private checkOperation(operation: string, node: TreeNode | null, parentId: string, position: number): boolean {
    const cb = this.config.core?.check_callback;
    if (cb === true) return true;
    if (cb === false) {
      this.lastError = { error: 'check_callback', operation, id: node?.id, parent: parentId, position };
      if (this.config.core?.error) this.config.core.error(this.lastError);
      return false;
    }
    if (typeof cb === 'function') {
      const parent = this.store.get(parentId) ?? this.createRootNode();
      const result = cb(operation, node!, parent, position, {});
      if (!result) {
        this.lastError = { error: 'check_callback', operation, id: node?.id, parent: parentId, position };
        if (this.config.core?.error) this.config.core.error(this.lastError);
      }
      return result;
    }
    return true;
  }

  private invokeBeforeActivate(node: TreeNode, event?: Event): boolean {
    for (const plugin of this.plugins) {
      if (plugin.onBeforeActivate && !plugin.onBeforeActivate(node, event)) {
        return false;
      }
    }
    return true;
  }
}
