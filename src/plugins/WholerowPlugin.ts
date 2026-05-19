import type { TreePlugin, TreePluginHost, TreeNode } from '../types';

/**
 * WholerowPlugin - makes each node appear block level for easier selection.
 * Mirrors jstree's "wholerow" plugin.
 *
 * Inserts a full-width div as the first child of each node's <li> element.
 */
export class WholerowPlugin implements TreePlugin {
  readonly name = 'wholerow';
  private tree!: TreePluginHost;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    tree.getContainer().classList.add('md-tree-wholerow-ul');
  }

  destroy(): void {
    this.tree.getContainer().classList.remove('md-tree-wholerow-ul');
  }

  onNodeRender(_node: TreeNode, element: HTMLElement): void {
    // Avoid duplicating if already rendered
    if (element.querySelector(':scope > .md-tree-wholerow')) return;

    const wholerow = document.createElement('div');
    wholerow.className = 'md-tree-wholerow';
    element.insertBefore(wholerow, element.firstChild);
  }
}
