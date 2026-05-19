/**
 * Manages the set of selected node IDs.
 */
export class TreeSelection {
  private selected: Set<string> = new Set();
  private multiple: boolean;

  constructor(multiple: boolean = true) {
    this.multiple = multiple;
  }

  select(id: string): string[] {
    if (!this.multiple) {
      this.selected.clear();
    }
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

  setMultiple(multiple: boolean): void {
    this.multiple = multiple;
  }
}
