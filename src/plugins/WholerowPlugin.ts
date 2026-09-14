import type { MDFolderTree } from '../MDFolderTree';
import type { EventHandler, TreeNode, TreePlugin, TreePluginHost } from '../types';

/**
 * Wholerow plugin, as jstree's: a strip behind each node makes the whole row
 * the target. A click, double-click or right-click on the strip is forwarded
 * to that node's anchor — so clicking the blank part of a row selects it,
 * ctrl-click extends, and a right-click opens the node's menu — as is a click
 * on a leaf's open/close icon, which has nothing to toggle. Hovering the strip
 * or an icon hovers the node.
 *
 * The strip carries `md-tree-wholerow-clicked` while the node is selected and
 * `md-tree-wholerow-hovered` while it is hovered, and the theme's dots are
 * hidden while the plugin is on.
 */
export class WholerowPlugin implements TreePlugin {
  readonly name = 'wholerow';
  private tree!: TreePluginHost;
  private api!: MDFolderTree;
  private hovered: string | null = null;

  private clickHandler!: (e: MouseEvent) => void;
  private dblclickHandler!: (e: MouseEvent) => void;
  private contextHandler!: (e: MouseEvent) => void;
  private overHandler!: (e: MouseEvent) => void;
  private leaveHandler!: (e: MouseEvent) => void;
  private markHandler!: EventHandler;
  private hoverHandler!: EventHandler;
  private dehoverHandler!: EventHandler;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.api = tree as unknown as MDFolderTree;
    const container = tree.getContainer();
    container.classList.add('md-tree-wholerow-ul');

    this.clickHandler = (e) => this.onClick(e);
    this.dblclickHandler = (e) => this.forwardFromStrip('dblclick', e);
    this.contextHandler = (e) => this.onContextMenu(e);
    this.overHandler = (e) => this.onOver(e);
    this.leaveHandler = (e) => this.onLeave(e);
    // Registered before the core binds its own listeners, so a forwarded event
    // can pre-empt the core's handling of the original.
    container.addEventListener('click', this.clickHandler);
    container.addEventListener('dblclick', this.dblclickHandler);
    container.addEventListener('contextmenu', this.contextHandler);
    container.addEventListener('mouseover', this.overHandler);
    // mouseleave does not bubble, so it is caught on the way down.
    container.addEventListener('mouseleave', this.leaveHandler, true);

    this.markHandler = () => this.refreshMarks();
    this.hoverHandler = (e) => this.setHovered((e.detail as { node: TreeNode }).node.id);
    this.dehoverHandler = () => this.setHovered(null);
    tree.on('changed.MDFolderTree', this.markHandler);
    tree.on('deselect_all.MDFolderTree', this.markHandler);
    tree.on('open_node.MDFolderTree', this.markHandler);
    tree.on('hover_node.MDFolderTree', this.hoverHandler);
    tree.on('dehover_node.MDFolderTree', this.dehoverHandler);
  }

  destroy(): void {
    const container = this.tree.getContainer();
    container.classList.remove('md-tree-wholerow-ul');
    container.removeEventListener('click', this.clickHandler);
    container.removeEventListener('dblclick', this.dblclickHandler);
    container.removeEventListener('contextmenu', this.contextHandler);
    container.removeEventListener('mouseover', this.overHandler);
    container.removeEventListener('mouseleave', this.leaveHandler, true);
    this.tree.off('changed.MDFolderTree', this.markHandler);
    this.tree.off('deselect_all.MDFolderTree', this.markHandler);
    this.tree.off('open_node.MDFolderTree', this.markHandler);
    this.tree.off('hover_node.MDFolderTree', this.hoverHandler);
    this.tree.off('dehover_node.MDFolderTree', this.dehoverHandler);
    for (const strip of Array.from(container.querySelectorAll('.md-tree-wholerow'))) strip.remove();
  }

  /**
   * jstree hides the dots on `ready`; our theme flags are applied after the
   * plugins start, so they are hidden as the tree draws instead — once, since
   * hide_dots emits.
   */
  onBeforeRender(nodes: TreeNode[]): TreeNode[] {
    if (!this.tree.getContainer().classList.contains('md-tree-no-dots')) this.api.hide_dots();
    return nodes;
  }

  onNodeRender(node: TreeNode, element: HTMLElement): void {
    if (element.querySelector(':scope > .md-tree-wholerow')) return;

    const strip = document.createElement('div');
    strip.className = 'md-tree-wholerow';
    strip.setAttribute('role', 'presentation');
    // Drawn from the model, so a redraw cannot lose either mark.
    if (node.state.selected) strip.classList.add('md-tree-wholerow-clicked');
    if (this.hovered === node.id) strip.classList.add('md-tree-wholerow-hovered');
    element.insertBefore(strip, element.firstChild);
  }

  /** A click on the strip, or on a leaf's open/close icon, acts on the anchor. */
  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.classList.contains('md-tree-wholerow')) {
      this.forwardFromStrip('click', e);
      return;
    }
    if (target.classList.contains('md-tree-ocl') && target.closest('.md-tree-leaf')) {
      this.forward('click', e, target.closest('.md-tree-node') as HTMLElement);
    }
  }

  /** As in jstree, the menu is only forwarded when the contextmenu plugin is on. */
  private onContextMenu(e: MouseEvent): void {
    if (!this.tree.config.plugins?.includes('contextmenu')) return;
    this.forwardFromStrip('contextmenu', e);
  }

  private forwardFromStrip(type: string, e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('md-tree-wholerow')) return;
    this.forward(type, e, target.closest('.md-tree-node') as HTMLElement);
  }

  /** Re-dispatch the event on the node's anchor, carrying the modifiers and the pointer. */
  private forward(type: string, e: MouseEvent, li: HTMLElement | null): void {
    const anchor = li?.querySelector(':scope > .md-tree-anchor') as HTMLElement | null;
    if (!anchor) return;
    // The original must not also be handled by the core.
    e.stopImmediatePropagation();
    e.preventDefault();
    anchor.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        button: e.button,
        clientX: e.clientX,
        clientY: e.clientY,
      }),
    );
  }

  /** Hovering the strip, or any of the node's icons, hovers the node itself. */
  private onOver(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('md-tree-wholerow') && !target.classList.contains('md-tree-icon')) return;
    const li = target.closest('.md-tree-node') as HTMLElement | null;
    if (!li || this.api.is_disabled(li.id)) return;
    this.api.hover_node(li.id);
  }

  private onLeave(e: MouseEvent): void {
    const li = (e.target as HTMLElement | null)?.closest?.('.md-tree-node') as HTMLElement | null;
    if (li) this.api.dehover_node(li.id);
  }

  /** Mark the strips of the selected nodes, and only those. */
  private refreshMarks(): void {
    const selected = new Set(this.tree.getSelectedIds());
    for (const li of Array.from(this.tree.getContainer().querySelectorAll('.md-tree-node'))) {
      li.querySelector(':scope > .md-tree-wholerow')?.classList.toggle('md-tree-wholerow-clicked', selected.has(li.id));
    }
  }

  /** Only the row losing the mark and the one taking it are touched. */
  private setHovered(id: string | null): void {
    const mark = (nodeId: string | null, on: boolean): void => {
      if (!nodeId) return;
      this.tree
        .getContainer()
        .querySelector(`#${CSS.escape(nodeId)} > .md-tree-wholerow`)
        ?.classList.toggle('md-tree-wholerow-hovered', on);
    };
    mark(this.hovered, false);
    this.hovered = id;
    mark(id, true);
  }
}
