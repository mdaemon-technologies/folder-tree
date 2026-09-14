import type {
  TreeNode,
  TreePlugin,
  TreePluginHost,
  CheckboxConfig,
  EventHandler,
  ActivationEvent,
} from '../types';

/**
 * Renders checkbox icons before the anchor and manages tri-state
 * (undetermined) for parent nodes.
 */
export class CheckboxPlugin implements TreePlugin {
  name = 'checkbox';
  private tree!: TreePluginHost;
  private config: CheckboxConfig = {};
  private cascadeOnEvent = '';
  private cascadeOffEvent = '';
  private cascadeOnHandler!: EventHandler;
  private cascadeOffHandler!: EventHandler;
  private loadingHandler!: EventHandler;
  private modelHandler!: EventHandler;
  private deleteHandler!: EventHandler;
  private moveHandler!: EventHandler;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.config = tree.config.checkbox ?? {};

    // Cascade by listening, as jstree does: to the selection events while
    // checking is tied to selection, and to the check events otherwise.
    const [on, off] = this.tiesSelection
      ? ['select_node', 'deselect_node']
      : ['check_node', 'uncheck_node'];
    this.cascadeOnEvent = `${on}.MDFolderTree`;
    this.cascadeOffEvent = `${off}.MDFolderTree`;
    this.cascadeOnHandler = (e) => this.cascade((e.detail as { node: TreeNode }).node, true);
    this.cascadeOffHandler = (e) => this.cascade((e.detail as { node: TreeNode }).node, false);
    tree.on(this.cascadeOnEvent, this.cascadeOnHandler);
    tree.on(this.cascadeOffEvent, this.cascadeOffHandler);

    // jstree marks the container at init, and applies `visible` while loading.
    const container = tree.getContainer();
    if (this.tiesSelection) container.classList.add('md-tree-checkbox-selection');
    if (this.config.keep_selected_style === false) container.classList.add('md-tree-checkbox-no-clicked');
    this.loadingHandler = () => {
      if (this.config.visible === false) this.hide_checkboxes();
      else this.show_checkboxes();
    };
    tree.on('loading.MDFolderTree', this.loadingHandler);

    // jstree cascades as nodes enter the model, and re-applies up on delete
    // and move.
    this.modelHandler = (e) => {
      const { nodes, parent } = e.detail as { nodes: string[]; parent: string };
      this.cascadeLoaded(nodes, parent);
    };
    this.deleteHandler = (e) => {
      if (this.recheckUp((e.detail as { parent: string }).parent)) this.tree.redraw();
    };
    this.moveHandler = (e) => {
      const { parent, old_parent } = e.detail as { parent: string; old_parent: string };
      const changed = this.recheckUp(old_parent);
      if (this.resyncUp(parent) || changed) this.tree.redraw();
    };
    tree.on('model.MDFolderTree', this.modelHandler);
    tree.on('delete_node.MDFolderTree', this.deleteHandler);
    tree.on('move_node.MDFolderTree', this.moveHandler);
  }

  destroy(): void {
    this.tree.off(this.cascadeOnEvent, this.cascadeOnHandler);
    this.tree.off(this.cascadeOffEvent, this.cascadeOffHandler);
    this.tree.off('loading.MDFolderTree', this.loadingHandler);
    this.tree.off('model.MDFolderTree', this.modelHandler);
    this.tree.off('delete_node.MDFolderTree', this.deleteHandler);
    this.tree.off('move_node.MDFolderTree', this.moveHandler);
  }

  onNodeRender(node: TreeNode, element: HTMLElement): void {
    const anchor = element.querySelector('.md-tree-anchor');
    if (!anchor) return;

    // Only add checkbox if not already present
    if (anchor.querySelector('.md-tree-checkbox')) return;

    const cb = document.createElement('i');
    cb.className = 'md-tree-icon md-tree-checkbox';
    cb.setAttribute('role', 'presentation');
    // Derived from the model on every render, so a redraw cannot lose it.
    if (this.isUndetermined(node)) cb.classList.add('md-tree-undetermined');
    if (node.state.checkbox_disabled) cb.classList.add('md-tree-checkbox-disabled');
    anchor.insertBefore(cb, anchor.firstChild);

    // Apply checked / undetermined state
    if (node.state.checked) {
      element.classList.add('md-tree-checked');
    }
  }

  /**
   * Re-derive `nodeId`'s checked state from its children, then its
   * ancestors', and repaint. Cascading normally happens automatically; this
   * remains for callers that mutate children directly.
   */
  updateUndetermined(nodeId: string): void {
    const node = this.tree.getNode(nodeId);
    if (!node) return;
    this.resyncUp(node.id);
    this.repaint(node);
  }

  // ---- Full Checkbox API ----

  /** Whether checking a node also selects it (jstree's `tie_selection`). */
  private get tiesSelection(): boolean {
    return this.config.tie_selection !== false;
  }

  /**
   * jstree's `check_node`. While tied to selection it *is* `select_node`
   * (without opening ancestors); otherwise it sets the checked state and
   * emits `check_node`. Cascading happens in the event listener either way.
   */
  check_node(id: string, event?: ActivationEvent): void {
    if (this.tiesSelection) {
      this.tree.selectNode(id, false, true, event);
      return;
    }
    const node = this.tree.getNode(id);
    if (!node || node.state.checked) return;
    node.state.checked = true;
    this.tree.redrawNode(id);
    this.tree.emit('check_node.MDFolderTree', { node, selected: this.get_checked(), event });
  }

  /** jstree's `uncheck_node`; the mirror image of `check_node`. */
  uncheck_node(id: string, event?: ActivationEvent): void {
    if (this.tiesSelection) {
      this.tree.deselectNode(id, false, event);
      return;
    }
    const node = this.tree.getNode(id);
    if (!node || !node.state.checked) return;
    node.state.checked = false;
    this.tree.redrawNode(id);
    this.tree.emit('uncheck_node.MDFolderTree', { node, selected: this.get_checked(), event });
  }

  /** jstree's `check_all`: `select_all` while tied, otherwise every node. */
  check_all(): void {
    if (this.tiesSelection) {
      this.tree.selectAll();
      return;
    }
    // Every node, disabled included, as jstree checks `root.children_d`.
    for (const node of this.tree.getAllNodes()) {
      node.state.checked = true;
    }
    this.tree.redraw();
    this.tree.emit('check_all.MDFolderTree', { selected: this.get_checked() });
  }

  /** jstree's `uncheck_all`: `deselect_all` while tied. */
  uncheck_all(): void {
    if (this.tiesSelection) {
      this.tree.deselectAll();
      return;
    }
    const previous = this.get_checked();
    for (const node of this.tree.getAllNodes()) {
      node.state.checked = false;
    }
    this.tree.redraw();
    this.tree.emit('uncheck_all.MDFolderTree', { selected: [], node: previous });
  }

  is_checked(id: string): boolean {
    const node = this.tree.getNode(id);
    return node?.state.checked ?? false;
  }

  get_checked(): string[] {
    return this.tree.getAllNodes().filter((n) => n.state.checked).map((n) => n.id);
  }

  get_top_checked(): string[] {
    const checked = new Set(this.get_checked());
    return [...checked].filter((id) => {
      const node = this.tree.getNode(id);
      if (!node) return false;
      return !node.parents.some((pid) => pid !== '#' && checked.has(pid));
    });
  }

  get_bottom_checked(): string[] {
    const checked = new Set(this.get_checked());
    return [...checked].filter((id) => {
      const node = this.tree.getNode(id);
      if (!node) return false;
      const hasCheckedDescendant = (nid: string): boolean => {
        const n = this.tree.getNode(nid);
        if (!n) return false;
        for (const cid of n.children) {
          if (checked.has(cid)) return true;
          if (hasCheckedDescendant(cid)) return true;
        }
        return false;
      };
      return !hasCheckedDescendant(id);
    });
  }

  get_undetermined(): string[] {
    return this.tree.getAllNodes().filter((node) => this.isUndetermined(node)).map((node) => node.id);
  }

  is_undetermined(id: string): boolean {
    const node = this.tree.getNode(id);
    return node ? this.isUndetermined(node) : false;
  }

  /** jstree's `show_checkboxes`: a container class, so redraws keep it. */
  show_checkboxes(): void {
    this.tree.getContainer().classList.remove('md-tree-no-checkboxes');
  }

  /** jstree's `hide_checkboxes`. */
  hide_checkboxes(): void {
    this.tree.getContainer().classList.add('md-tree-no-checkboxes');
  }

  toggle_checkboxes(): void {
    if (this.tree.getContainer().classList.contains('md-tree-no-checkboxes')) {
      this.show_checkboxes();
    } else {
      this.hide_checkboxes();
    }
  }

  /** jstree's `disable_checkbox`: a flag on the node, drawn on every render. */
  disable_checkbox(id: string): void {
    const node = this.tree.getNode(id);
    if (!node || node.state.checkbox_disabled) return;
    node.state.checkbox_disabled = true;
    this.tree.redrawNode(id);
    this.tree.emit('disable_checkbox.MDFolderTree', { node });
  }

  /** jstree's `enable_checkbox`. */
  enable_checkbox(id: string): void {
    const node = this.tree.getNode(id);
    if (!node || !node.state.checkbox_disabled) return;
    node.state.checkbox_disabled = false;
    this.tree.redrawNode(id);
    this.tree.emit('enable_checkbox.MDFolderTree', { node });
  }

  /** jstree's effective cascade: `three_state` means up+down+undetermined. */
  private get cascadeMode(): string {
    return this.config.three_state !== false ? 'up+down+undetermined' : this.config.cascade ?? '';
  }

  /** Whether a node is checked — while tied to selection, selected. */
  private isOn(node: TreeNode): boolean {
    return this.tiesSelection ? node.state.selected : node.state.checked;
  }

  /**
   * Partially checked, as jstree's get_undetermined reports it (only with
   * 'undetermined'): not checked itself, with a checked descendant — or with
   * an unloaded descendant, or itself unloaded, that the server marked
   * `state.undetermined`.
   */
  private isUndetermined(node: TreeNode): boolean {
    if (!this.cascadeMode.includes('undetermined') || this.isOn(node)) return false;
    if (this.serverUndetermined(node)) return true;
    return node.children_d.some((id) => {
      const descendant = this.tree.getNode(id);
      return descendant !== null && (this.isOn(descendant) || this.serverUndetermined(descendant));
    });
  }

  private serverUndetermined(node: TreeNode): boolean {
    const original = node.original?.state as { undetermined?: unknown } | undefined;
    return !node.state.loaded && original?.undetermined === true;
  }

  /**
   * Listener for check / select (and uncheck / deselect): cascade as the
   * configured directions say, then repaint.
   */
  private cascade(node: TreeNode, checked: boolean): void {
    const mode = this.cascadeMode;
    let stillOn = checked;
    if (mode.includes('down')) {
      const on = new Set(this.newCheckedState(node.id, checked));
      const subtree = [node.id, ...node.children_d];
      this.setChecked(subtree.filter((id) => on.has(id)), true);
      this.setChecked(subtree.filter((id) => !on.has(id)), false);
      stillOn = on.has(node.id);
    }
    if (mode.includes('up')) {
      if (checked) this.checkUpward(node.parent);
      else if (!stillOn) this.setChecked(node.parents.filter((id) => id !== '#'), false);
    }
    this.repaint(node);
  }

  /**
   * jstree's `_cascade_new_checked_state`: the ids in `id`'s subtree that end
   * up checked when it is checked (true) or unchecked (false). A node that
   * cascade_to_disabled / cascade_to_hidden exclude keeps its own state and
   * its checked descendants; any other node ends up checked only when being
   * checked and every child does too — so a partial node ends unchecked.
   */
  private newCheckedState(id: string, checking: boolean): string[] {
    const node = this.tree.getNode(id);
    if (!node) return [];
    const included =
      (this.config.cascade_to_disabled !== false || !node.state.disabled) &&
      (this.config.cascade_to_hidden !== false || !node.state.hidden);
    if (!included) {
      const kept = node.children_d.filter((childId) => {
        const child = this.tree.getNode(childId);
        return child !== null && this.isOn(child);
      });
      if (this.isOn(node)) kept.push(node.id);
      return kept;
    }
    const on: string[] = [];
    let onChildren = 0;
    for (const childId of node.children) {
      const result = this.newCheckedState(childId, checking);
      on.push(...result);
      if (result.includes(childId)) onChildren++;
    }
    const undetermined = onChildren > 0 && onChildren < node.children.length;
    if (!undetermined && checking && onChildren === node.children.length) on.push(node.id);
    return on;
  }

  /** jstree's cascade up on check: each ancestor whose children are all checked becomes checked. */
  private checkUpward(parentId: string): void {
    let parent = parentId === '#' ? null : this.tree.getNode(parentId);
    while (parent) {
      const children = parent.children.map((id) => this.tree.getNode(id));
      if (!children.every((child) => child !== null && this.isOn(child))) break;
      this.setChecked([parent.id], true);
      parent = parent.parent === '#' ? null : this.tree.getNode(parent.parent);
    }
  }

  /** jstree's cascade as nodes enter the model (load, create, copy). */
  private cascadeLoaded(nodes: string[], parentId: string): void {
    const mode = this.cascadeMode;
    const parent = parentId === '#' ? null : this.tree.getNode(parentId);
    if (mode.includes('down')) {
      if (parent && this.isOn(parent)) {
        this.setChecked(nodes, true);
      } else {
        for (const id of nodes) {
          const node = this.tree.getNode(id);
          if (node && this.isOn(node)) this.setChecked(node.children_d, true);
        }
      }
    }
    if (mode.includes('up')) {
      const scope = parent
        ? parent.children_d
        : this.tree.getRootNodeIds().flatMap((id) => [id, ...(this.tree.getNode(id)?.children_d ?? [])]);
      const leafParents = new Set<string>();
      for (const id of scope) {
        const node = this.tree.getNode(id);
        if (node && node.children.length === 0) leafParents.add(node.parent);
      }
      for (const id of leafParents) this.checkUpward(id);
    }
  }

  /**
   * jstree's cascade up after a node leaves `parentId` (delete, or the old
   * parent of a move): each unchecked ancestor whose remaining children are
   * all checked becomes checked. Returns whether anything changed.
   */
  private recheckUp(parentId: string): boolean {
    if (!this.cascadeMode.includes('up')) return false;
    let changed = false;
    let parent = parentId === '#' ? null : this.tree.getNode(parentId);
    while (parent && !this.isOn(parent)) {
      const children = parent.children.map((id) => this.tree.getNode(id));
      if (children.length === 0 || !children.every((child) => child !== null && this.isOn(child))) break;
      this.setChecked([parent.id], true);
      changed = true;
      parent = parent.parent === '#' ? null : this.tree.getNode(parent.parent);
    }
    return changed;
  }

  /**
   * jstree's cascade up on a move's new parent: each ancestor follows its
   * children — checked when all are, unchecked when not. Returns whether
   * anything changed.
   */
  private resyncUp(parentId: string): boolean {
    if (!this.cascadeMode.includes('up')) return false;
    let changed = false;
    let parent = parentId === '#' ? null : this.tree.getNode(parentId);
    while (parent) {
      const children = parent.children.map((id) => this.tree.getNode(id));
      const all = children.every((child) => child !== null && this.isOn(child));
      if (all && !this.isOn(parent)) {
        this.setChecked([parent.id], true);
        changed = true;
      } else if (!all && this.isOn(parent)) {
        this.setChecked([parent.id], false);
        changed = true;
      } else if (!all) {
        break;
      }
      parent = parent.parent === '#' ? null : this.tree.getNode(parent.parent);
    }
    return changed;
  }

  /**
   * Set checked state without emitting events. While tied, checked *is*
   * selected, so membership goes through the tree's silent selection path.
   */
  private setChecked(ids: string[], checked: boolean): void {
    if (ids.length === 0) return;
    if (this.tiesSelection) {
      this.tree.applySelection(ids, checked);
      return;
    }
    for (const id of ids) {
      const node = this.tree.getNode(id);
      if (node) node.state.checked = checked;
    }
  }

  /** Repaint the root-level subtree containing `node`, which spans all a cascade touched. */
  private repaint(node: TreeNode): void {
    const top = node.parents.length > 1 ? node.parents[node.parents.length - 2] : node.id;
    this.tree.redrawNode(top);
  }
}
