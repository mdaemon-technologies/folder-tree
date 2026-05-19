import type { TreePlugin, TreePluginHost, UniqueConfig } from '../types';

/**
 * UniquePlugin - enforces that no nodes with the same name can coexist as siblings.
 * Mirrors jstree's "unique" plugin.
 *
 * Prevents renaming and moving nodes to a parent which already contains a node
 * with the same name (optionally case-sensitive, with whitespace trimming).
 */
export class UniquePlugin implements TreePlugin {
  readonly name = 'unique';
  private tree!: TreePluginHost;


  init(tree: TreePluginHost): void {
    this.tree = tree;
  }

  destroy(): void {
    // No event listeners to remove — validation is done via onBeforeActivate-style checks
  }

  /**
   * Check if a name would be unique among siblings.
   * Called externally by the tree when validating rename/move operations.
   */
  isUnique(parentId: string, name: string, excludeId?: string): boolean {
    const config = this.getConfig();
    const siblings = this.tree.getNodeChildren(parentId);

    const normalize = (text: string): string => {
      let t = text;
      if (config.trim_whitespace) t = t.trim();
      if (!config.case_sensitive) t = t.toLowerCase();
      return t;
    };

    const normalizedName = normalize(name);

    for (const sibling of siblings) {
      if (excludeId && sibling.id === excludeId) continue;
      if (normalize(sibling.text) === normalizedName) return false;
    }
    return true;
  }

  /**
   * Generate a unique name using the duplicate function.
   */
  getUniqueName(parentId: string, name: string, excludeId?: string): string {
    if (this.isUnique(parentId, name, excludeId)) return name;

    const config = this.getConfig();
    const duplicateFn = config.duplicate ?? ((n, counter) => `${n} (${counter})`);

    let counter = 1;
    let candidate = duplicateFn(name, counter);
    while (!this.isUnique(parentId, candidate, excludeId)) {
      counter++;
      candidate = duplicateFn(name, counter);
      if (counter > 1000) break; // Safety limit
    }
    return candidate;
  }

  private getConfig(): Required<UniqueConfig> {
    const cfg = this.tree.config.unique ?? {};
    return {
      case_sensitive: cfg.case_sensitive ?? false,
      trim_whitespace: cfg.trim_whitespace ?? false,
      duplicate: cfg.duplicate ?? ((name, counter) => `${name} (${counter})`),
    };
  }
}
