import type { MDFolderTree } from '../MDFolderTree';
import type { TreePlugin, TreePluginHost, TreeNode } from '../types';

/**
 * ConditionalSelectPlugin - allows preventing node selection via a callback.
 * Mirrors jstree's "conditionalselect" plugin.
 *
 * Config: `conditionalselect: (node, event) => boolean`
 * Return false from the callback to prevent the node from being selected.
 * As in jstree, it is called with the tree as `this`, so it may consult the
 * tree (`this.get_type(node)`) to decide.
 */
export class ConditionalSelectPlugin implements TreePlugin {
  readonly name = 'conditionalselect';
  private tree!: TreePluginHost;

  init(tree: TreePluginHost): void {
    this.tree = tree;
  }

  destroy(): void {
    // No cleanup needed
  }

  onBeforeActivate(node: TreeNode, event?: Event): boolean {
    const callback = this.tree.config.conditionalselect;
    if (typeof callback === 'function') {
      return callback.call(this.tree as unknown as MDFolderTree, node, event);
    }
    return true;
  }
}
