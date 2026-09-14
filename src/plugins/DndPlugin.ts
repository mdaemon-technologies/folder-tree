import type { MDFolderTree } from '../MDFolderTree';
import type { TreePlugin, TreePluginHost, TreeNode, DndConfig, CheckMore, NodeRef } from '../types';
import { EVENT_NS } from '../events/namespace';

/** jstree's `$.vakata.dnd.settings`. */
const THRESHOLD = 5;
const THRESHOLD_TOUCH = 10;
const SCROLL_PROXIMITY = 20;
const SCROLL_SPEED = 10;

/** Where a drop would go, as jstree's `lastmv`: a tree, a parent and a position in it. */
interface DropPosition {
  ins: MDFolderTree;
  parent: string;
  pos: number | 'last';
}

/**
 * Drag and drop, as jstree's dnd plugin — on pointer events, so mouse, pen
 * and touch drag alike.
 *
 * A drag starts on a node's anchor (anywhere on the node with
 * `large_drag_target`) with the primary button, or a touch as `touch`
 * allows. Dragging a selected node drags the top selected nodes (with
 * `drag_selection`, the default); `is_draggable(nodes, e)` may refuse. Once
 * the pointer moves past jstree's threshold, a helper follows it and
 * `dnd_start` is emitted with jstree's payload; the click that ends a drag is
 * swallowed, and Escape cancels.
 *
 * With `use_html5`, the browser's native drag and drop drives the drag
 * instead, as jstree's HTML5 backend: anchors (nodes, with
 * large_drag_target) are `draggable`, and dragstart, dragover and drop run the
 * same checks and drop rules. The browser draws the dragged image, so there
 * is no helper.
 */
export class DndPlugin implements TreePlugin {
  readonly name = 'dnd';
  private tree!: TreePluginHost;
  private api!: MDFolderTree;
  private dragging = false;
  private dragNode: TreeNode | null = null;
  private dragIds: string[] = [];
  private dragElement: HTMLElement | null = null;
  private dragTarget: EventTarget | null = null;
  private dragText = '';
  private isTouch = false;
  private dragHelper: HTMLElement | null = null;
  private marker: HTMLElement | null = null;
  private dropTarget: DropPosition | null = null;
  private openTimeout: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;
  private swallow: { target: Element; handler: (e: Event) => void } | null = null;
  private lastError: Record<string, unknown> | null = null;
  private hoverTarget: Element | null = null;
  private lastPointer: MouseEvent | null = null;
  private copyKey = false;
  private scroll: { box: Element; dx: number; dy: number } | null = null;
  private scrollTimer: ReturnType<typeof setInterval> | null = null;
  /** jstree's HTML5 backend, where elements can be draggable. */
  private html5 = false;

  // Bound handlers for cleanup
  private pointerDownHandler!: (e: PointerEvent) => void;
  private pointerMoveHandler!: (e: PointerEvent) => void;
  private pointerUpHandler!: (e: PointerEvent) => void;
  private pointerCancelHandler!: (e: PointerEvent) => void;
  private keyUpHandler!: (e: KeyboardEvent) => void;
  private keyDownHandler!: (e: KeyboardEvent) => void;
  private dragStartHandler!: (e: DragEvent) => void;
  private dragOverHandler!: (e: DragEvent) => void;
  private dropHandler!: (e: DragEvent) => void;
  private dragEndHandler!: () => void;
  private acceptHandler!: (e: Event) => void;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.api = tree as unknown as MDFolderTree;

    this.pointerDownHandler = (e) => this.onPointerDown(e);
    this.pointerMoveHandler = (e) => this.onPointerMove(e);
    this.pointerUpHandler = (e) => this.onPointerUp(e);
    this.pointerCancelHandler = () => this.onPointerCancel();
    this.keyUpHandler = (e) => this.onKeyUp(e);
    this.keyDownHandler = (e) => this.onModifier(e);
    this.dragStartHandler = (e) => this.onDragStart(e);
    this.dragOverHandler = (e) => this.onDragOver(e);
    this.dropHandler = (e) => this.onDrop(e);
    this.dragEndHandler = () => this.onDragEnd();
    // As jstree's, the tree takes any native drag over it, so a drop fires there.
    this.acceptHandler = (e) => e.preventDefault();

    // As jstree, the HTML5 backend only where elements can be draggable.
    this.html5 = Boolean(this.getConfig().use_html5) && 'draggable' in document.createElement('span');
    const container = tree.getContainer();
    if (this.html5) {
      container.addEventListener('dragstart', this.dragStartHandler);
      container.addEventListener('dragover', this.acceptHandler);
      container.addEventListener('drop', this.acceptHandler);
    } else {
      container.addEventListener('pointerdown', this.pointerDownHandler);
    }
  }

  destroy(): void {
    const container = this.tree.getContainer();
    container.removeEventListener('pointerdown', this.pointerDownHandler);
    container.removeEventListener('dragstart', this.dragStartHandler);
    container.removeEventListener('dragover', this.acceptHandler);
    container.removeEventListener('drop', this.acceptHandler);
    // A drag in progress leaves listeners on the document, not the container.
    this.detachDocumentListeners();
    this.releaseClick();
    this.cancelDrag();
  }

  /**
   * jstree's listeners while a drag is down. A native drag's end is heard on
   * the element it began on, which a redraw may have taken out of the page.
   */
  private attachDocumentListeners(): void {
    if (this.html5) {
      document.addEventListener('dragover', this.dragOverHandler);
      document.addEventListener('drop', this.dropHandler);
      this.dragTarget?.addEventListener('dragend', this.dragEndHandler);
      return;
    }
    document.addEventListener('pointermove', this.pointerMoveHandler);
    document.addEventListener('pointerup', this.pointerUpHandler);
    document.addEventListener('pointercancel', this.pointerCancelHandler);
    document.addEventListener('keyup', this.keyUpHandler);
    document.addEventListener('keydown', this.keyDownHandler);
  }

  private detachDocumentListeners(): void {
    document.removeEventListener('dragover', this.dragOverHandler);
    document.removeEventListener('drop', this.dropHandler);
    this.dragTarget?.removeEventListener('dragend', this.dragEndHandler);
    document.removeEventListener('pointermove', this.pointerMoveHandler);
    document.removeEventListener('pointerup', this.pointerUpHandler);
    document.removeEventListener('pointercancel', this.pointerCancelHandler);
    document.removeEventListener('keyup', this.keyUpHandler);
    document.removeEventListener('keydown', this.keyDownHandler);
  }

  private getConfig(): DndConfig {
    return this.tree.config.dnd ?? {};
  }

  /** jstree's draggable nodes under use_html5: the anchor, or with large_drag_target the node. */
  onNodeRender(_node: TreeNode, li: HTMLElement): void {
    if (!this.html5) return;
    const el = this.getConfig().large_drag_target ? li : li.querySelector(':scope > .md-tree-anchor');
    el?.setAttribute('draggable', 'true');
  }

  private onPointerDown(e: PointerEvent): void {
    this.isTouch = e.pointerType === 'touch';
    if (!this.isTouch && e.button !== 0) return; // Primary button only
    if (!this.prepare(e)) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.attachDocumentListeners();
  }

  /**
   * jstree's dragstart (use_html5): the checks a pointer drag makes, then the
   * drag starts at once.
   */
  private onDragStart(e: DragEvent): void {
    this.isTouch = false;
    if (!this.prepare(e)) return;
    this.attachDocumentListeners();
    this.startDrag(e);
  }

  /**
   * The checks jstree makes as a drag begins, on either backend: on a node's
   * anchor (anywhere on the node with large_drag_target), by touch as `touch`
   * allows, dragging the top selected nodes for a selected node
   * (drag_selection), unless is_draggable refuses. Records the drag and
   * returns true when one may start.
   */
  private prepare(e: PointerEvent | DragEvent): boolean {
    const config = this.getConfig();
    const target = e.target as HTMLElement;
    const container = this.tree.getContainer();

    // jstree binds on the anchor, or with large_drag_target on the node.
    const li = target.closest('.md-tree-node') as HTMLElement | null;
    if (!li || !container.contains(li)) return false;
    const start = config.large_drag_target ? li : (target.closest('.md-tree-anchor') as HTMLElement | null);
    if (!start || !li.contains(start)) return false;

    const node = this.tree.getNode(li.id);
    if (!node) return false;

    // jstree's `touch`: false never drags; 'selected' drags only a selected node.
    if (this.isTouch && (config.touch === false || (config.touch === 'selected' && !node.state.selected))) {
      return false;
    }

    // A selected node drags the top selected nodes, as jstree's drag_selection.
    const multiple = node.state.selected && config.drag_selection !== false ? this.api.get_top_selected() : [];
    const ids = multiple.length > 1 ? multiple : [node.id];

    const draggable = config.is_draggable ?? true;
    if (draggable !== true) {
      const nodes = ids.map((id) => this.tree.getNode(id)).filter((n): n is TreeNode => n !== null);
      if (typeof draggable !== 'function' || !draggable.call(this.api, nodes, e)) return false;
    }

    this.dragNode = node;
    this.dragIds = ids;
    this.dragElement = li;
    this.dragTarget = e.target;
    this.dragText = ids.length > 1 ? `${ids.length} ${this.api.get_string('nodes')}` : node.text;
    return true;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragNode) return;

    // jstree's threshold: a drag starts once the pointer has moved past it.
    if (!this.dragging) {
      const threshold = this.isTouch ? THRESHOLD_TOUCH : THRESHOLD;
      if (Math.abs(e.clientX - this.startX) <= threshold && Math.abs(e.clientY - this.startY) <= threshold) return;
      this.startDrag(e);
    }

    this.lastPointer = e;
    this.copyKey = e.ctrlKey || e.metaKey;

    // Move helper
    if (this.dragHelper) {
      this.dragHelper.style.left = `${e.clientX + 5}px`;
      this.dragHelper.style.top = `${e.clientY + 10}px`;
    }

    // Determine drop target
    this.updateDropTarget(e);

    // Auto-scroll
    this.autoScroll(e, this.hoverTarget);

    this.tree.emit(`dnd_move.${EVENT_NS}`, { ...this.eventData(e), position: this.dropTarget });
  }

  private onPointerUp(e: PointerEvent): void {
    this.detachDocumentListeners();

    if (this.dragging) {
      // A click only follows on the element the drag began on.
      if (e.target !== this.dragTarget) this.releaseClick();
      this.drop(e);
    }

    this.cancelDrag();
  }

  /**
   * jstree's dragover (use_html5): a move, the element under the pointer
   * being the event's target. A drop the target may take is accepted, with
   * the copy or move effect.
   */
  private onDragOver(e: DragEvent): void {
    if (!this.dragging) return;
    this.lastPointer = e;
    this.copyKey = e.ctrlKey || e.metaKey;
    this.updateDropTarget(e, e.target as Element | null);
    if (this.dropTarget) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = this.isCopy() ? 'copy' : 'move';
    }
    this.tree.emit(`dnd_move.${EVENT_NS}`, { ...this.eventData(e), position: this.dropTarget });
  }

  /** jstree's drop (use_html5): as a pointer release. */
  private onDrop(e: DragEvent): void {
    if (!this.dragging) return;
    e.preventDefault();
    this.detachDocumentListeners();
    this.drop(e);
    this.cancelDrag();
  }

  /** A native drag that ends without a drop is abandoned, as Escape abandons a pointer drag. */
  private onDragEnd(): void {
    this.detachDocumentListeners();
    this.cancelDrag();
  }

  /** jstree's dnd_stop: drop where the last move said, then say so. */
  private drop(e: MouseEvent): void {
    this.copyKey = e.ctrlKey || e.metaKey || this.copyKey;
    const drop = this.executeDrop();
    this.tree.emit(`dnd_stop.${EVENT_NS}`, { ...this.eventData(e), ...drop });
  }

  /** A cancelled pointer (gesture stolen, window blurred) abandons the drag. */
  private onPointerCancel(): void {
    this.detachDocumentListeners();
    this.releaseClick();
    this.cancelDrag();
  }

  /** jstree cancels a drag on Escape, without a drop or dnd_stop. */
  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.dragNode) {
      this.detachDocumentListeners();
      this.cancelDrag();
      return;
    }
    this.onModifier(e);
  }

  /** As jstree, pressing or releasing ctrl / meta mid-drag re-evaluates the drop. */
  private onModifier(e: KeyboardEvent): void {
    if (!this.dragging || !this.lastPointer) return;
    this.copyKey = e.ctrlKey || e.metaKey;
    this.updateDropTarget(this.lastPointer);
  }

  /** jstree's dnd payload: `{ data: { jstree, origin, obj, nodes }, element, helper, event }`. */
  private eventData(e: Event): Record<string, unknown> {
    return {
      data: { jstree: true, origin: this.api, obj: this.dragElement, nodes: [...this.dragIds] },
      element: this.dragElement,
      helper: this.dragHelper,
      event: e,
      // Earlier releases' field.
      node: this.dragNode,
    };
  }

  private startDrag(e: MouseEvent): void {
    this.dragging = true;
    // A native drag has no helper: the browser draws the dragged image.
    if (!this.html5) {
      this.dragHelper = this.createHelper(e);
      document.body.appendChild(this.dragHelper);
    }

    // jstree's marker, on the body, placed beside the target anchor.
    this.marker = document.createElement('div');
    this.marker.id = 'md-tree-marker';
    this.marker.className = 'md-tree-dnd-marker';
    this.marker.innerHTML = '&#160;';
    this.marker.style.position = 'absolute';
    this.marker.style.display = 'none';
    document.body.appendChild(this.marker);

    // Add dragging class
    this.tree.getContainer().classList.add('md-tree-dnd-dragging');

    // jstree swallows the click that ends a pointer drag; a native drag ends without one.
    if (!this.html5) this.swallowClick(this.dragTarget);

    this.tree.emit(`dnd_start.${EVENT_NS}`, this.eventData(e));
  }

  /**
   * jstree's helper, under the codemod's names: `#vakata-dnd` holding
   * `#md-tree-dnd` with the status icon, the text and the copy sign.
   */
  private createHelper(e: MouseEvent): HTMLElement {
    const helper = document.createElement('div');
    helper.id = 'vakata-dnd';
    helper.className = 'md-tree-dnd-helper';
    helper.style.position = 'fixed';
    helper.style.zIndex = '10000';
    helper.style.pointerEvents = 'none';
    helper.style.left = `${e.clientX + 5}px`;
    helper.style.top = `${e.clientY + 10}px`;

    const theme = this.api.get_theme();
    const variant = this.api.get_theme_variant();
    const body = document.createElement('div');
    body.id = 'md-tree-dnd';
    // As in jstree, the helper carries the theme, its variant, and the
    // responsive marker when the theme is responsive.
    body.className = [
      `md-tree-${theme}`,
      variant ? `md-tree-${theme}-${variant}` : '',
      this.tree.config.core?.themes?.responsive ? 'md-tree-dnd-responsive' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const icon = document.createElement('i');
    icon.className = 'md-tree-icon md-tree-er';
    const copy = document.createElement('ins');
    copy.className = 'md-tree-copy';
    copy.textContent = '+';
    copy.style.display = 'none';
    body.append(icon, document.createTextNode(this.dragText), copy);
    helper.appendChild(body);
    return helper;
  }

  private swallowClick(target: EventTarget | null): void {
    if (!(target instanceof Element)) return;
    const handler = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      this.releaseClick();
    };
    target.addEventListener('click', handler, true);
    this.swallow = { target, handler };
  }

  private releaseClick(): void {
    if (!this.swallow) return;
    this.swallow.target.removeEventListener('click', this.swallow.handler, true);
    this.swallow = null;
  }

  private cancelDrag(): void {
    this.stopScrolling();
    this.clearParentMark();
    this.lastError = null;
    this.hoverTarget = null;
    this.lastPointer = null;
    this.copyKey = false;
    this.dragging = false;
    this.dragNode = null;
    this.dragIds = [];
    this.dragElement = null;
    this.dragTarget = null;
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

  /** Whether the drop copies: always_copy, or ctrl / meta with `copy` (on by default). */
  private isCopy(): boolean {
    const config = this.getConfig();
    return Boolean(config.always_copy || (config.copy !== false && this.copyKey));
  }

  /** The tree an element belongs to, as jstree's `$.jstree.reference`. */
  private instanceAt(el: Element | null): MDFolderTree | null {
    const container = el?.closest('.md-tree');
    return (container as unknown as { __mdFolderTree?: MDFolderTree } | null)?.__mdFolderTree ?? null;
  }

  /** The tree under the pointer, if it takes drops (it has the dnd plugin). */
  private treeAt(el: Element | null): MDFolderTree | null {
    const tree = this.instanceAt(el);
    return tree && tree.config.plugins?.includes('dnd') ? tree : null;
  }

  /**
   * jstree's dnd_move handler: find where the dragged nodes would drop — in
   * this tree or another — and show it through the marker, the helper's
   * status icon and copy sign, and the parent the drop goes into. The target
   * tree's own dnd settings apply there; the copy settings are this tree's.
   * `target` is the element under the pointer: by default, the one at its
   * coordinates, as a captured pointer's events target where the drag began.
   */
  private updateDropTarget(e: MouseEvent, target = document.elementFromPoint(e.clientX, e.clientY)): void {
    const copying = this.isCopy();
    const op = copying ? 'copy_node' : 'move_node';
    this.setCopySign(copying);

    const moved = target !== this.hoverTarget;
    this.hoverTarget = target;
    if (this.openTimeout && moved) {
      clearTimeout(this.openTimeout);
      this.openTimeout = null;
    }

    const ins = this.treeAt(target);
    if (target && ins) {
      // A node from another tree is checked as that tree's node, as is_multi.
      const subject = (id: string): NodeRef => (ins === this.api ? id : (this.tree.getNode(id) as TreeNode));
      const more = (ref: TreeNode | false, pos: string): CheckMore => ({
        dnd: true,
        ref,
        pos,
        origin: this.api,
        is_multi: ins !== this.api,
        is_foreign: false,
      });
      const container = ins.getContainer();
      const rootList = container.querySelector(':scope > ul');
      if (target === container || target === rootList) {
        // Blank space: last at the root, with blank_space_drop or in an empty tree.
        if (ins.getRootNodeIds().length === 0 || ins.config.dnd?.blank_space_drop) {
          const root = ins.get_node('#') as TreeNode | false;
          const ok = this.dragIds.every((id) => ins.check(op, subject(id), '#', 'last', more(root, 'i')));
          if (ok) {
            this.dropTarget = { ins, parent: '#', pos: 'last' };
            this.clearParentMark();
            this.hideMarker();
            this.setStatus(true);
            return;
          }
          this.lastError = ins.last_error() as Record<string, unknown>;
        }
      } else {
        const anchor = ins.config.dnd?.large_drop_target
          ? (target.closest('.md-tree-node')?.querySelector(':scope > .md-tree-anchor') as HTMLElement | null)
          : (target.closest('.md-tree-anchor') as HTMLElement | null);
        const li = anchor?.parentElement ?? null;
        const ref = li ? ins.getNode(li.id) : null;
        if (anchor && li && ref && container.contains(anchor) && this.dropAt(ins, anchor, ref, e, op, moved, subject, more)) {
          return;
        }
      }
    }

    this.clearParentMark();
    this.dropTarget = null;
    this.setStatus(false);
    this.hideMarker();
  }

  /**
   * Over an anchor: the pointer's third orders before ('b'), inside ('i') and
   * after ('a'), and the first that every dragged node may take wins.
   */
  private dropAt(
    ins: MDFolderTree,
    anchor: HTMLElement,
    ref: TreeNode,
    e: MouseEvent,
    op: 'copy_node' | 'move_node',
    moved: boolean,
    subject: (id: string) => NodeRef,
    more: (ref: TreeNode | false, pos: string) => CheckMore,
  ): boolean {
    const config = ins.config.dnd ?? {};
    const rect = anchor.getBoundingClientRect();
    const rel = e.clientY - rect.top;
    const h = rect.height;
    const order = rel < h / 3 ? ['b', 'i', 'a'] : rel > h - h / 3 ? ['a', 'i', 'b'] : rel > h / 2 ? ['i', 'a', 'b'] : ['i', 'b', 'a'];
    const childrenOf = (id: string) => (id === '#' ? ins.getRootNodeIds() : ins.getNode(id)?.children ?? []);
    const siblings = childrenOf(ref.parent);
    const insidePos = config.inside_pos ?? 0;

    for (const v of order) {
      let parent: string;
      let index: number;
      let cls: string;
      let top: number;
      let left = rect.left - 6;
      if (v === 'b') {
        parent = ref.parent;
        index = siblings.indexOf(ref.id);
        cls = 'md-tree-below';
        top = rect.top;
      } else if (v === 'i') {
        parent = ref.id;
        index =
          insidePos === 'first' ? 0 : insidePos === 'last' ? ref.children.length : Math.min(Number(insidePos), ref.children.length);
        cls = 'md-tree-inside';
        top = rect.top + h / 2 + 1;
        left = rect.left - 2;
      } else {
        parent = ref.parent;
        index = siblings.indexOf(ref.id) + 1;
        cls = 'md-tree-above';
        top = rect.top + h;
      }

      let ok = true;
      for (const id of this.dragIds) {
        // As jstree: after a node in the dragged node's own parent, the check
        // sees the position the node will land at.
        let pos = index;
        const dragged = ins === this.api ? this.tree.getNode(id) : null;
        if (op === 'move_node' && v === 'a' && dragged && dragged.parent === parent) {
          if (pos > childrenOf(parent).indexOf(id)) pos -= 1;
        }
        ok = config.check_while_dragging === false || ins.check(op, subject(id), parent, pos, more(ref, v));
        if (!ok) {
          this.lastError = ins.last_error() as Record<string, unknown>;
          break;
        }
      }

      if (v === 'i' && ins.is_closed(ref) && config.open_timeout !== 0 && moved) {
        if (this.openTimeout) clearTimeout(this.openTimeout);
        this.openTimeout = setTimeout(() => {
          this.openTimeout = null;
          ins.open_node(ref.id);
        }, config.open_timeout ?? 500);
      }

      if (ok) {
        this.markParent(ins, parent);
        this.dropTarget = {
          ins,
          parent,
          pos: v === 'i' && insidePos === 'last' && index === 0 && !ref.state.loaded ? 'last' : index,
        };
        this.showMarker(left + window.scrollX, top + window.scrollY, cls);
        this.setStatus(true);
        this.lastError = null;
        return true;
      }
    }
    return false;
  }

  private showMarker(left: number, top: number, cls: string): void {
    if (!this.marker) return;
    this.marker.style.left = `${left}px`;
    this.marker.style.top = `${top}px`;
    this.marker.style.display = 'block';
    this.marker.className = `md-tree-dnd-marker ${cls}`;
  }

  private hideMarker(): void {
    if (this.marker) this.marker.style.display = 'none';
  }

  /** The helper's status icon: ok over a valid target, er otherwise. */
  private setStatus(ok: boolean): void {
    const icon = this.dragHelper?.querySelector('#md-tree-dnd > .md-tree-icon');
    icon?.classList.toggle('md-tree-ok', ok);
    icon?.classList.toggle('md-tree-er', !ok);
  }

  private setCopySign(copying: boolean): void {
    const sign = this.dragHelper?.querySelector('.md-tree-copy') as HTMLElement | null;
    if (sign) sign.style.display = copying ? '' : 'none';
  }

  /** jstree marks the node a drop goes into as `jstree-dnd-parent`. */
  private markParent(ins: MDFolderTree, parentId: string): void {
    const li = parentId === '#' ? null : ins.getContainer().querySelector(`#${CSS.escape(parentId)}`);
    for (const el of Array.from(document.querySelectorAll('.md-tree-dnd-parent'))) {
      if (el !== li) el.classList.remove('md-tree-dnd-parent');
    }
    li?.classList.add('md-tree-dnd-parent');
  }

  private clearParentMark(): void {
    for (const el of Array.from(document.querySelectorAll('.md-tree-dnd-parent'))) {
      el.classList.remove('md-tree-dnd-parent');
    }
  }

  /**
   * jstree's dnd_stop handler: move (or copy) the dragged nodes where the last
   * move said — into another tree too, with this tree as the origin — or
   * report why nothing may be dropped. Returns what earlier releases
   * reported in dnd_stop.
   */
  private executeDrop(): Record<string, unknown> | null {
    const drop = this.dropTarget;
    const isCopy = this.isCopy();
    if (!drop) {
      if (this.lastError && this.lastError.error === 'check') {
        (this.instanceAt(this.hoverTarget) ?? this.api).reportError(this.lastError);
      }
      return null;
    }
    const method = isCopy ? 'copy_node' : 'move_node';
    drop.ins[method](this.dragIds, drop.parent, drop.pos, undefined, false, false, this.api);
    return { target: drop.parent, position: drop.pos, is_copy: isCopy };
  }

  /**
   * jstree's drag auto-scroll: within 20px of the edge of the nearest
   * scrollable ancestor of the element under the pointer — or else of the
   * page — scroll it 10px every 100ms.
   */
  private autoScroll(e: PointerEvent, target: Element | null): void {
    this.scroll = null;
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (!/^(auto|scroll)$/.test(getComputedStyle(el).overflow)) continue;
      const vertical = el.scrollHeight > (el as HTMLElement).offsetHeight;
      const horizontal = el.scrollWidth > (el as HTMLElement).offsetWidth;
      if (!vertical && !horizontal) continue;
      const box = el.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (vertical) {
        if (box.bottom - e.clientY < SCROLL_PROXIMITY) dy = 1;
        if (e.clientY - box.top < SCROLL_PROXIMITY) dy = -1;
      }
      if (horizontal) {
        if (box.right - e.clientX < SCROLL_PROXIMITY) dx = 1;
        if (e.clientX - box.left < SCROLL_PROXIMITY) dx = -1;
      }
      if (dx || dy) {
        this.scroll = { box: el, dx, dy };
        break;
      }
    }
    if (!this.scroll) {
      const page = document.scrollingElement ?? document.documentElement;
      let dx = 0;
      let dy = 0;
      if (page.scrollHeight > window.innerHeight) {
        if (e.clientY < SCROLL_PROXIMITY) dy = -1;
        if (window.innerHeight - e.clientY < SCROLL_PROXIMITY) dy = 1;
      }
      if (page.scrollWidth > window.innerWidth) {
        if (e.clientX < SCROLL_PROXIMITY) dx = -1;
        if (window.innerWidth - e.clientX < SCROLL_PROXIMITY) dx = 1;
      }
      if (dx || dy) this.scroll = { box: page, dx, dy };
    }
    if (!this.scroll) this.stopScrolling();
    else if (!this.scrollTimer) this.scrollTimer = setInterval(() => this.scrollStep(), 100);
  }

  private scrollStep(): void {
    if (!this.scroll) {
      this.stopScrolling();
      return;
    }
    const { box, dx, dy } = this.scroll;
    const top = box.scrollTop;
    const left = box.scrollLeft;
    box.scrollTop = top + dy * SCROLL_SPEED;
    box.scrollLeft = left + dx * SCROLL_SPEED;
    if (box.scrollTop !== top || box.scrollLeft !== left) {
      // jstree's dnd_scroll: what lies under the pointer has changed.
      this.hideMarker();
      this.clearParentMark();
      this.dropTarget = null;
      this.hoverTarget = null;
      this.setStatus(false);
      this.tree.emit(`dnd_scroll.${EVENT_NS}`, this.eventData(this.lastPointer ?? new Event('scroll')));
    }
  }

  private stopScrolling(): void {
    if (this.scrollTimer) clearInterval(this.scrollTimer);
    this.scrollTimer = null;
    this.scroll = null;
  }
}
