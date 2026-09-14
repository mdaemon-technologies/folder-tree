import type { MDFolderTree } from '../MDFolderTree';
import type { CheckMore, TreeNode, TreeNodeData, TreePlugin, TreePluginHost, UniqueConfig } from '../types';

/**
 * Unique plugin, as jstree's. It joins `check` to refuse a name a sibling
 * already has — `unique_01` for rename, `unique_02` copy, `unique_03` move (a
 * reorder within the parent is allowed) and `unique_04` create — comparing
 * case-insensitively unless `case_sensitive`, and ignoring surrounding
 * whitespace with `trim_whitespace`. It also names a node created without
 * text: `New node`, then `duplicate(name, counter)` from 2.
 */
export class UniquePlugin implements TreePlugin {
  readonly name = 'unique';
  private tree!: TreePluginHost;


  init(tree: TreePluginHost): void {
    this.tree = tree;
  }

  destroy(): void {
    // Nothing to release: the plugin answers check() as it is asked.
  }

  /** jstree's unique `check`. */
  onCheck(
    chk: string,
    node: TreeNode | TreeNodeData | null,
    parent: TreeNode | null,
    pos: unknown,
    more: CheckMore,
  ): true | { id: string; reason: string } {
    if (!parent) return true;
    const names = this.siblingNames(parent);
    const name = this.normalize(chk === 'rename_node' ? String(pos ?? '') : String(node?.text ?? ''));
    const taken = names.includes(name);
    const refuse = (id: string) => ({ id, reason: `Child with name ${name} already exists. Preventing: ${chk}` });

    switch (chk) {
      case 'rename_node': {
        // Renaming a node to its own name, in any case, is allowed.
        const own = node?.text ? this.normalize(String(node.text)) : null;
        return !taken || own === name ? true : refuse('unique_01');
      }
      case 'create_node':
        return taken ? refuse('unique_04') : true;
      case 'copy_node':
        return taken ? refuse('unique_02') : true;
      case 'move_node':
        return ((node as TreeNode | null)?.parent === parent.id && !more.is_multi) || !taken
          ? true
          : refuse('unique_03');
    }
    return true;
  }

  /**
   * jstree's naming of a node created without text: `base`, then
   * `duplicate(base, counter)` from 2 until it is free among `par`'s children.
   */
  newNodeName(par: TreeNode, base: string): string {
    const names = this.siblingNames(par);
    const cfg = this.tree.config.unique ?? {};
    const duplicate = cfg.duplicate ?? ((name: string, counter: number) => `${name} (${counter})`);
    let name = base;
    let counter = 1;
    while (names.includes(this.normalize(name))) {
      name = String(duplicate.call(this.tree as unknown as MDFolderTree, base, ++counter));
    }
    return name;
  }

  private siblingNames(parent: TreeNode): string[] {
    return parent.children.map((id) => this.normalize(this.tree.getNode(id)?.text ?? ''));
  }

  /** jstree's comparison form: lowercased unless case_sensitive, trimmed with trim_whitespace. */
  private normalize(text: string): string {
    const cfg = this.tree.config.unique ?? {};
    let t = text;
    if (!cfg.case_sensitive) t = t.toLowerCase();
    if (cfg.trim_whitespace) t = t.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    return t;
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
    const tree = this.tree as unknown as MDFolderTree;
    let candidate = duplicateFn.call(tree, name, counter);
    while (!this.isUnique(parentId, candidate, excludeId)) {
      counter++;
      candidate = duplicateFn.call(tree, name, counter);
      if (counter > 1000) break; // Safety limit
    }
    return candidate;
  }

  private getConfig(): Required<UniqueConfig> {
    const cfg = this.tree.config.unique ?? {};
    return {
      case_sensitive: cfg.case_sensitive ?? false,
      trim_whitespace: cfg.trim_whitespace ?? false,
      duplicate: cfg.duplicate ?? ((name: string, counter: number) => `${name} (${counter})`),
    };
  }
}
