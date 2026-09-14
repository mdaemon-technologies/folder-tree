/**
 * The set of selected node ids.
 *
 * Deliberately policy-free: `core.multiple` is not enforced here. As in
 * jstree, it constrains user interaction (see `MDFolderTree.activate_node`),
 * while the programmatic selection API may select any number of nodes.
 */
export class TreeSelection {
  private selected: Set<string> = new Set();

  /**
   * @param _multiple Ignored. Retained so existing callers still compile;
   * `core.multiple` is enforced on activation instead.
   */
  constructor(_multiple = true) {}

  select(id: string): string[] {
    this.selected.add(id);
    return this.getSelected();
  }

  deselect(id: string): string[] {
    this.selected.delete(id);
    return this.getSelected();
  }

  selectAll(ids: string[]): string[] {
    for (const id of ids) {
      this.selected.add(id);
    }
    return this.getSelected();
  }

  deselectAll(): string[] {
    this.selected.clear();
    return [];
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  getSelected(): string[] {
    return Array.from(this.selected);
  }

  /** @deprecated No-op; `core.multiple` is enforced on activation. */
  setMultiple(_multiple: boolean): void {
    // Intentionally empty.
  }
}
