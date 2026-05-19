import type { TreeNode, TreePlugin, TreePluginHost, CheckboxConfig } from '../types';

/**
 * Renders checkbox icons before the anchor and manages tri-state
 * (undetermined) for parent nodes.
 */
export class CheckboxPlugin implements TreePlugin {
  name = 'checkbox';
  private tree!: TreePluginHost;
  private config: CheckboxConfig = {};
  private hiddenCheckboxes = false;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.config = tree.config.checkbox ?? {};
  }

  destroy(): void {
    // no-op
  }

  onNodeRender(node: TreeNode, element: HTMLElement): void {
    const anchor = element.querySelector('.md-tree-anchor');
    if (!anchor) return;

    // Only add checkbox if not already present
    if (anchor.querySelector('.md-tree-checkbox')) return;

    const cb = document.createElement('i');
    cb.className = 'md-tree-icon md-tree-checkbox';
    if (this.hiddenCheckboxes) cb.style.display = 'none';
    cb.setAttribute('role', 'presentation');
    anchor.insertBefore(cb, anchor.firstChild);

    // Apply checked / undetermined state
    if (node.state.checked) {
      element.classList.add('md-tree-checked');
    }

    // Apply no-clicked style if configured
    if (this.config.keep_selected_style === false) {
      const container = this.tree.getContainer();
      if (!container.classList.contains('md-tree-checkbox-no-clicked')) {
        container.classList.add('md-tree-checkbox-no-clicked');
      }
    }
  }

  /**
   * Update the tri-state (undetermined) class on a parent node
   * based on its children's checked state.
   */
  updateUndetermined(nodeId: string): void {
    const node = this.tree.getNode(nodeId);
    if (!node || node.children.length === 0) return;

    let allChecked = true;
    let noneChecked = true;

    for (const childId of node.children) {
      const child = this.tree.getNode(childId);
      if (!child) continue;
      if (child.state.checked) {
        noneChecked = false;
      } else {
        allChecked = false;
      }
    }

    const container = this.tree.getContainer();
    const nodeEl = container.querySelector(`#${CSS.escape(nodeId)}`);
    if (!nodeEl) return;

    const checkbox = nodeEl.querySelector(':scope > .md-tree-anchor > .md-tree-checkbox');
    if (!checkbox) return;

    if (!allChecked && !noneChecked) {
      checkbox.classList.add('md-tree-undetermined');
      nodeEl.classList.remove('md-tree-checked');
      node.state.checked = false;
    } else if (allChecked) {
      checkbox.classList.remove('md-tree-undetermined');
      nodeEl.classList.add('md-tree-checked');
      node.state.checked = true;
    } else {
      checkbox.classList.remove('md-tree-undetermined');
      nodeEl.classList.remove('md-tree-checked');
      node.state.checked = false;
    }

    // Propagate up
    if (node.parent && node.parent !== '#') {
      this.updateUndetermined(node.parent);
    }
  }

  // ---- Full Checkbox API ----

  check_node(id: string): void {
    const node = this.tree.getNode(id);
    if (!node) return;

    node.state.checked = true;
    node.state.selected = true;
    this.tree.selectNode(id, true);

    const container = this.tree.getContainer();
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) el.classList.add('md-tree-checked');

    // Cascade down if three_state
    if (this.config.three_state !== false) {
      this.cascadeCheck(node, true);
    }

    // Update parent undetermined
    if (node.parent && node.parent !== '#') {
      this.updateUndetermined(node.parent);
    }

    this.tree.emit('check_node.MDFolderTree', { node });
  }

  uncheck_node(id: string): void {
    const node = this.tree.getNode(id);
    if (!node) return;

    node.state.checked = false;
    node.state.selected = false;
    this.tree.deselectNode(id, true);

    const container = this.tree.getContainer();
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) el.classList.remove('md-tree-checked');

    // Cascade down if three_state
    if (this.config.three_state !== false) {
      this.cascadeCheck(node, false);
    }

    // Update parent undetermined
    if (node.parent && node.parent !== '#') {
      this.updateUndetermined(node.parent);
    }

    this.tree.emit('uncheck_node.MDFolderTree', { node });
  }

  check_all(): void {
    for (const node of this.tree.getAllNodes()) {
      node.state.checked = true;
      node.state.selected = true;
    }
    this.tree.redraw();
    this.tree.emit('check_all.MDFolderTree', {});
  }

  uncheck_all(): void {
    for (const node of this.tree.getAllNodes()) {
      node.state.checked = false;
      node.state.selected = false;
    }
    this.tree.redraw();
    this.tree.emit('uncheck_all.MDFolderTree', {});
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
    const result: string[] = [];
    const container = this.tree.getContainer();
    const els = container.querySelectorAll('.md-tree-undetermined');
    for (const el of Array.from(els)) {
      const li = el.closest('.md-tree-node');
      if (li) result.push(li.id);
    }
    return result;
  }

  is_undetermined(id: string): boolean {
    const container = this.tree.getContainer();
    const el = container.querySelector(`#${CSS.escape(id)} > .md-tree-anchor > .md-tree-checkbox`);
    return el?.classList.contains('md-tree-undetermined') ?? false;
  }

  show_checkboxes(): void {
    this.hiddenCheckboxes = false;
    const container = this.tree.getContainer();
    const cbs = container.querySelectorAll('.md-tree-checkbox');
    for (const cb of Array.from(cbs)) {
      (cb as HTMLElement).style.display = '';
    }
  }

  hide_checkboxes(): void {
    this.hiddenCheckboxes = true;
    const container = this.tree.getContainer();
    const cbs = container.querySelectorAll('.md-tree-checkbox');
    for (const cb of Array.from(cbs)) {
      (cb as HTMLElement).style.display = 'none';
    }
  }

  toggle_checkboxes(): void {
    if (this.hiddenCheckboxes) {
      this.show_checkboxes();
    } else {
      this.hide_checkboxes();
    }
  }

  disable_checkbox(id: string): void {
    const container = this.tree.getContainer();
    const cb = container.querySelector(`#${CSS.escape(id)} > .md-tree-anchor > .md-tree-checkbox`) as HTMLElement | null;
    if (cb) {
      cb.classList.add('md-tree-checkbox-disabled');
    }
    this.tree.emit('disable_checkbox.MDFolderTree', { node: this.tree.getNode(id) });
  }

  enable_checkbox(id: string): void {
    const container = this.tree.getContainer();
    const cb = container.querySelector(`#${CSS.escape(id)} > .md-tree-anchor > .md-tree-checkbox`) as HTMLElement | null;
    if (cb) {
      cb.classList.remove('md-tree-checkbox-disabled');
    }
    this.tree.emit('enable_checkbox.MDFolderTree', { node: this.tree.getNode(id) });
  }

  private cascadeCheck(node: TreeNode, checked: boolean): void {
    const container = this.tree.getContainer();
    const cascadeToDisabled = this.config.cascade_to_disabled !== false;
    const cascadeToHidden = this.config.cascade_to_hidden !== false;
    for (const childId of node.children) {
      const child = this.tree.getNode(childId);
      if (!child) continue;
      if (!cascadeToDisabled && child.state.disabled) continue;
      if (!cascadeToHidden && child.state.hidden) continue;
      child.state.checked = checked;
      child.state.selected = checked;
      if (checked) {
        this.tree.selectNode(childId, true);
      } else {
        this.tree.deselectNode(childId, true);
      }
      const childEl = container.querySelector(`#${CSS.escape(childId)}`);
      if (childEl) {
        if (checked) {
          childEl.classList.add('md-tree-checked');
        } else {
          childEl.classList.remove('md-tree-checked');
        }
      }
      if (child.children.length > 0) {
        this.cascadeCheck(child, checked);
      }
    }
  }
}
