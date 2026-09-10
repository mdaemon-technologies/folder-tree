import type { TreePlugin, TreePluginHost, TreeNode, EventHandler } from '../types';

/**
 * SortPlugin - automatically sorts sibling nodes according to a comparator function.
 * Mirrors jstree's "sort" plugin.
 *
 * Config: `sort: (a: TreeNode, b: TreeNode) => number`
 * Defaults to case-insensitive alphabetical comparison of node text.
 *
 * Ordering is applied at render time (`onBeforeRender`) and written back to
 * the model, so `node.children` and the rendered DOM cannot disagree. Reacting
 * to `create_node` / `move_node` instead would sort *after* the render that
 * those operations already performed.
 */
export class SortPlugin implements TreePlugin {
  readonly name = 'sort';
  private tree!: TreePluginHost;
  private resortHandler!: EventHandler;

  init(tree: TreePluginHost): void {
    this.tree = tree;

    // Operations that repaint a single node bypass `onBeforeRender`, so a
    // label change needs an explicit redraw to re-sort its siblings.
    this.resortHandler = () => this.tree.redraw();
    tree.on('rename_node.MDFolderTree', this.resortHandler);
    tree.on('set_text.MDFolderTree', this.resortHandler);
  }

  destroy(): void {
    this.tree.off('rename_node.MDFolderTree', this.resortHandler);
    this.tree.off('set_text.MDFolderTree', this.resortHandler);
  }

  onBeforeRender(nodes: TreeNode[]): TreeNode[] {
    const comparator = this.getComparator();

    // Every non-root level.
    for (const node of this.tree.getAllNodes()) {
      if (node.children.length > 1) {
        this.tree.setChildOrder(node.id, this.sortIds(node.children, comparator));
      }
    }

    // Root order lives outside the store; sort it and write it back so
    // getRootNodeIds() agrees with what is rendered.
    const sortedRoots = [...nodes].sort(comparator);
    this.tree.setChildOrder('#', sortedRoots.map((n) => n.id));
    return sortedRoots;
  }

  private getComparator(): (a: TreeNode, b: TreeNode) => number {
    const custom = this.tree.config.sort;
    if (typeof custom === 'function') return custom;
    return (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  }

  private sortIds(ids: string[], comparator: (a: TreeNode, b: TreeNode) => number): string[] {
    return ids
      .map((id) => this.tree.getNode(id))
      .filter((n): n is TreeNode => n !== null)
      .sort(comparator)
      .map((n) => n.id);
  }
}
