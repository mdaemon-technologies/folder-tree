import type { TreePlugin, TreePluginHost, TreeNode, EventHandler, SortComparator } from '../types';

/**
 * SortPlugin - automatically sorts sibling nodes according to a comparator function.
 * Mirrors jstree's "sort" plugin.
 *
 * Config: `sort: (a: string, b: string) => number`, called with two node ids
 * and the tree as `this`. Defaults to jstree's case-sensitive text comparison.
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
    // Every non-root level.
    for (const node of this.tree.getAllNodes()) {
      if (node.children.length > 1) {
        this.tree.setChildOrder(node.id, this.sortIds(node.children));
      }
    }

    // Root order lives outside the store; sort it and write it back so
    // getRootNodeIds() agrees with what is rendered.
    const rootIds = this.sortIds(nodes.map((n) => n.id));
    this.tree.setChildOrder('#', rootIds);
    return rootIds
      .map((id) => this.tree.getNode(id))
      .filter((n): n is TreeNode => n !== null);
  }

  /**
   * jstree's `sort(obj, deep)`: order a node's children in the model and,
   * when `deep`, every descendant's as well. Like jstree it does not redraw.
   */
  sortNode(id: string, deep = false): void {
    const children = id === '#' ? this.tree.getRootNodeIds() : this.tree.getNode(id)?.children ?? [];
    if (children.length > 1) this.tree.setChildOrder(id, this.sortIds(children));
    if (!deep) return;
    const descendants = id === '#'
      ? this.tree.getAllNodes().map((n) => n.id)
      : this.tree.getNode(id)?.children_d ?? [];
    for (const descendant of descendants) this.sortNode(descendant, false);
  }

  /**
   * The comparator, over node ids with the tree as `this`, as jstree calls
   * it. The default is jstree's: a plain, case-sensitive text comparison.
   */
  private getComparator(): (a: string, b: string) => number {
    const custom = this.tree.config.sort;
    if (typeof custom === 'function') {
      const tree = this.tree as unknown as ThisParameterType<SortComparator>;
      return (a, b) => custom.call(tree, a, b);
    }
    const text = (id: string) => this.tree.getNode(id)?.text ?? '';
    return (a, b) => (text(a) > text(b) ? 1 : -1);
  }

  private sortIds(ids: string[]): string[] {
    return [...ids].sort(this.getComparator());
  }
}
