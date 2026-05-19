import type { TreePlugin, TreePluginHost, TreeNode, EventHandler } from '../types';

/**
 * SortPlugin - automatically sorts sibling nodes according to a comparator function.
 * Mirrors jstree's "sort" plugin.
 *
 * Config: `sort: (a: TreeNode, b: TreeNode) => number`
 * Defaults to case-insensitive alphabetical comparison of node text.
 */
export class SortPlugin implements TreePlugin {
  readonly name = 'sort';
  private tree!: TreePluginHost;
  private handler!: EventHandler;

  init(tree: TreePluginHost): void {
    this.tree = tree;

    // Sort on structure-changing events
    this.handler = () => this.sortAll();
    tree.on('ready.MDFolderTree', this.handler);
    tree.on('create_node.MDFolderTree', this.handler);
    tree.on('rename_node.MDFolderTree', this.handler);
    tree.on('move_node.MDFolderTree', this.handler);
  }

  destroy(): void {
    this.tree.off('ready.MDFolderTree', this.handler);
    this.tree.off('create_node.MDFolderTree', this.handler);
    this.tree.off('rename_node.MDFolderTree', this.handler);
    this.tree.off('move_node.MDFolderTree', this.handler);
  }

  onBeforeRender(nodes: TreeNode[]): TreeNode[] {
    return this.sortNodes(nodes);
  }

  private getComparator(): (a: TreeNode, b: TreeNode) => number {
    const custom = this.tree.config.sort;
    if (typeof custom === 'function') return custom;
    return (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  }

  private sortNodes(nodes: TreeNode[]): TreeNode[] {
    const comparator = this.getComparator();
    return [...nodes].sort(comparator);
  }

  private sortAll(): void {
    const comparator = this.getComparator();

    // Sort root-level nodes
    const rootIds = this.tree.getRootNodeIds();
    const rootNodes = rootIds.map((id) => this.tree.getNode(id)!).filter(Boolean);
    rootNodes.sort(comparator);
    // Root ordering is driven by onBeforeRender, no explicit reorder needed

    // Sort each parent's children array
    for (const node of this.tree.getAllNodes()) {
      if (node.children.length > 1) {
        const children = node.children.map((id) => this.tree.getNode(id)!).filter(Boolean);
        children.sort(comparator);
        node.children = children.map((c) => c.id);
      }
    }
  }
}
