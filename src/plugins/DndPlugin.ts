import type { TreePlugin, TreePluginHost, TreeNode, DndConfig } from '../types';

const EVENT_NS = 'MDFolderTree';

interface DropPosition {
  targetId: string;
  position: 'before' | 'after' | 'inside';
}

/**
 * DndPlugin - enables drag and drop of tree nodes for move/copy operations.
 * Mirrors jstree's "dnd" plugin.
 *
 * Config: `dnd: { copy, open_timeout, is_draggable, check_while_dragging, ... }`
 */
export class DndPlugin implements TreePlugin {
  readonly name = 'dnd';
  private tree!: TreePluginHost;
  private dragging = false;
  private dragNode: TreeNode | null = null;
  private dragHelper: HTMLElement | null = null;
  private marker: HTMLElement | null = null;
  private dropTarget: DropPosition | null = null;
  private openTimeout: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;
  private threshold = 5;

  // Bound handlers for cleanup
  private pointerDownHandler!: (e: PointerEvent) => void;
  private pointerMoveHandler!: (e: PointerEvent) => void;
  private pointerUpHandler!: (e: PointerEvent) => void;

  init(tree: TreePluginHost): void {
    this.tree = tree;

    this.pointerDownHandler = (e) => this.onPointerDown(e);
    this.pointerMoveHandler = (e) => this.onPointerMove(e);
    this.pointerUpHandler = (e) => this.onPointerUp(e);

    tree.getContainer().addEventListener('pointerdown', this.pointerDownHandler);
  }

  destroy(): void {
    this.tree.getContainer().removeEventListener('pointerdown', this.pointerDownHandler);
    this.cancelDrag();
  }

  private getConfig(): DndConfig {
    return this.tree.config.dnd ?? {};
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return; // Left button only

    const anchor = (e.target as HTMLElement).closest('.md-tree-anchor') as HTMLElement | null;
    if (!anchor) return;

    const li = anchor.closest('.md-tree-node') as HTMLElement | null;
    if (!li) return;

    const node = this.tree.getNode(li.id);
    if (!node) return;

    const config = this.getConfig();

    // Check if node is draggable
    if (config.is_draggable) {
      const nodes = config.drag_selection ? this.getSelectedNodes() : [node];
      if (!config.is_draggable(nodes)) return;
    }

    this.dragNode = node;
    this.startX = e.clientX;
    this.startY = e.clientY;

    document.addEventListener('pointermove', this.pointerMoveHandler);
    document.addEventListener('pointerup', this.pointerUpHandler);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragNode) return;

    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    // Threshold check: don't start drag until mouse moves enough
    if (!this.dragging) {
      if (Math.abs(dx) < this.threshold && Math.abs(dy) < this.threshold) return;
      this.startDrag(e);
    }

    // Move helper
    if (this.dragHelper) {
      this.dragHelper.style.left = `${e.clientX + 10}px`;
      this.dragHelper.style.top = `${e.clientY + 10}px`;
    }

    // Determine drop target
    this.updateDropTarget(e);

    // Auto-scroll
    this.autoScroll(e);

    this.tree.emit(`dnd_move.${EVENT_NS}`, {
      node: this.dragNode,
      event: e,
      helper: this.dragHelper,
      position: this.dropTarget,
    });
  }

  private onPointerUp(_e: PointerEvent): void {
    document.removeEventListener('pointermove', this.pointerMoveHandler);
    document.removeEventListener('pointerup', this.pointerUpHandler);

    if (this.dragging && this.dragNode && this.dropTarget) {
      this.executeDrop();
    }

    this.cancelDrag();
  }

  private startDrag(e: PointerEvent): void {
    this.dragging = true;

    // Create drag helper
    this.dragHelper = document.createElement('div');
    this.dragHelper.className = 'md-tree-dnd-helper';
    this.dragHelper.textContent = this.dragNode!.text;
    this.dragHelper.style.position = 'fixed';
    this.dragHelper.style.zIndex = '10001';
    this.dragHelper.style.pointerEvents = 'none';
    this.dragHelper.style.left = `${e.clientX + 10}px`;
    this.dragHelper.style.top = `${e.clientY + 10}px`;
    document.body.appendChild(this.dragHelper);

    // Create drop marker
    this.marker = document.createElement('div');
    this.marker.className = 'md-tree-dnd-marker';
    this.marker.style.position = 'absolute';
    this.marker.style.display = 'none';
    this.tree.getContainer().appendChild(this.marker);

    // Add dragging class
    this.tree.getContainer().classList.add('md-tree-dnd-dragging');

    this.tree.emit(`dnd_start.${EVENT_NS}`, {
      node: this.dragNode,
      event: e,
      helper: this.dragHelper,
    });
  }

  private cancelDrag(): void {
    this.dragging = false;
    this.dragNode = null;
    this.dropTarget = null;

    if (this.dragHelper) {
      this.dragHelper.remove();
      this.dragHelper = null;
    }

    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }

    if (this.openTimeout) {
      clearTimeout(this.openTimeout);
      this.openTimeout = null;
    }

    this.tree.getContainer().classList.remove('md-tree-dnd-dragging');
  }

  private updateDropTarget(e: PointerEvent): void {
    const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (!elemBelow) {
      this.hideMarker();
      this.dropTarget = null;
      return;
    }

    const li = elemBelow.closest('.md-tree-node') as HTMLElement | null;
    if (!li || li.id === this.dragNode?.id) {
      this.hideMarker();
      this.dropTarget = null;
      return;
    }

    // Don't allow dropping onto own descendants
    if (this.isDescendant(li.id, this.dragNode!.id)) {
      this.hideMarker();
      this.dropTarget = null;
      return;
    }

    const node = this.tree.getNode(li.id);
    if (!node) {
      this.hideMarker();
      this.dropTarget = null;
      return;
    }

    // Determine position (before/after/inside) based on Y within the node
    const rect = li.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'after' | 'inside';
    if (relY < height * 0.25) {
      position = 'before';
    } else if (relY > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    this.dropTarget = { targetId: li.id, position };
    this.showMarker(li, position);

    // Auto-open folder on hover
    if (position === 'inside' && node.children.length > 0 && !node.state.opened) {
      this.scheduleAutoOpen(node);
    }
  }

  private showMarker(li: HTMLElement, position: 'before' | 'after' | 'inside'): void {
    if (!this.marker) return;

    const rect = li.getBoundingClientRect();
    const containerRect = this.tree.getContainer().getBoundingClientRect();

    this.marker.style.display = 'block';
    this.marker.style.left = `${rect.left - containerRect.left}px`;
    this.marker.style.width = `${rect.width}px`;

    if (position === 'before') {
      this.marker.style.top = `${rect.top - containerRect.top}px`;
      this.marker.className = 'md-tree-dnd-marker md-tree-dnd-marker-before';
    } else if (position === 'after') {
      this.marker.style.top = `${rect.bottom - containerRect.top}px`;
      this.marker.className = 'md-tree-dnd-marker md-tree-dnd-marker-after';
    } else {
      this.marker.style.top = `${rect.top - containerRect.top}px`;
      this.marker.style.height = `${rect.height}px`;
      this.marker.className = 'md-tree-dnd-marker md-tree-dnd-marker-inside';
    }
  }

  private hideMarker(): void {
    if (this.marker) {
      this.marker.style.display = 'none';
    }
  }

  private scheduleAutoOpen(node: TreeNode): void {
    if (this.openTimeout) clearTimeout(this.openTimeout);
    const config = this.getConfig();
    const timeout = config.open_timeout ?? 500;

    this.openTimeout = setTimeout(() => {
      this.tree.openNode(node.id);
      this.openTimeout = null;
    }, timeout);
  }

  private executeDrop(): void {
    if (!this.dragNode || !this.dropTarget) return;

    const config = this.getConfig();
    const isCopy = config.always_copy || (config.copy && this.isCopyModifier());
    const { targetId, position } = this.dropTarget;
    const targetNode = this.tree.getNode(targetId);
    if (!targetNode) return;

    let parentId: string;
    let insertPos: number;

    if (position === 'inside') {
      parentId = targetId;
      insertPos = config.inside_pos === 'first' ? 0
        : config.inside_pos === 'last' ? targetNode.children.length
        : typeof config.inside_pos === 'number' ? config.inside_pos
        : 0;
    } else {
      parentId = targetNode.parent;
      const parent = this.tree.getNode(parentId);
      if (!parent) return;
      const targetIndex = parent.children.indexOf(targetId);
      insertPos = position === 'before' ? targetIndex : targetIndex + 1;
    }

    if (isCopy) {
      this.tree.copyNode(this.dragNode.id, parentId, insertPos);
    } else {
      this.tree.moveNode(this.dragNode.id, parentId, insertPos);
    }

    this.tree.emit(`dnd_stop.${EVENT_NS}`, {
      node: this.dragNode,
      target: targetId,
      position,
      is_copy: isCopy,
    });
  }

  private isCopyModifier(): boolean {
    // Could be enhanced to check actual modifier keys during drag
    return false;
  }

  private isDescendant(potentialDescendantId: string, ancestorId: string): boolean {
    const node = this.tree.getNode(potentialDescendantId);
    if (!node) return false;
    return node.parents.includes(ancestorId);
  }

  private getSelectedNodes(): TreeNode[] {
    return this.tree.getSelectedIds()
      .map((id) => this.tree.getNode(id)!)
      .filter(Boolean);
  }

  private autoScroll(e: PointerEvent): void {
    const container = this.tree.getContainer();
    const rect = container.getBoundingClientRect();
    const scrollMargin = 30;
    const scrollSpeed = 10;

    if (e.clientY - rect.top < scrollMargin) {
      container.scrollTop -= scrollSpeed;
    } else if (rect.bottom - e.clientY < scrollMargin) {
      container.scrollTop += scrollSpeed;
    }
  }
}
