import type { MDFolderTree } from './MDFolderTree';
import type { NodeRef, TreeNode } from './types';
import { EVENT_NS } from './events/namespace';

/** What `get_buffer` reports, in jstree's shape. */
export interface ClipboardBuffer {
  mode: 'move_node' | 'copy_node' | false;
  node: TreeNode[] | false;
  inst: MDFolderTree | false;
  ids: string[];
}

/**
 * jstree's clipboard (its `ccp_node`, `ccp_mode` and `ccp_inst`): one buffer
 * for every tree on the page, so what is cut or copied in one tree pastes
 * into another. It is module state precisely because it belongs to the page
 * rather than to any one tree.
 */
let clipboard: { mode: 'move_node' | 'copy_node'; nodes: TreeNode[]; inst: MDFolderTree } | null = null;

/** The buffered nodes' `md-tree-cut` marking, in their own tree, while they wait to be moved. */
function markCut(on: boolean): void {
  if (clipboard?.mode !== 'move_node') return;
  const container = clipboard.inst.getContainer();
  for (const node of clipboard.nodes) {
    container.querySelector(`#${CSS.escape(node.id)}`)?.classList.toggle('md-tree-cut', on);
  }
}

/**
 * The cut / copy / paste buffer behind `MDFolderTree`'s clipboard methods,
 * which delegate here. It reaches its tree through the public API alone, so
 * the two share no state beyond the tree itself.
 */
export class TreeClipboard {
  constructor(private readonly tree: MDFolderTree) {}

  /**
   * jstree's `cut`: buffer the nodes -- the selection when given nothing --
   * for paste to move. False when there is nothing to buffer.
   */
  cut(obj?: NodeRef | NodeRef[]): false | void {
    return this.fill('move_node', obj);
  }

  /** jstree's `copy`: as `cut`, for paste to copy. */
  copy(obj?: NodeRef | NodeRef[]): false | void {
    return this.fill('copy_node', obj);
  }

  /**
   * jstree's `paste(obj, pos)`: move or copy the buffered nodes into `obj`
   * through move_node / copy_node, with the buffer's tree as the origin -- so
   * they keep their order, and may come from another tree -- emit `paste`,
   * and empty the buffer (without `clear_buffer`). Returns whether it pasted.
   */
  paste(obj: NodeRef, pos?: number | string): boolean {
    const target = this.node(obj);
    if (!target || !clipboard) return false;
    const { mode, nodes, inst } = clipboard;
    markCut(false);
    const pasted = this.tree[mode](nodes, target, pos, undefined, false, false, inst);
    if (pasted) {
      this.tree.emit(`paste.${EVENT_NS}`, { parent: target.id, node: nodes, mode, ids: nodes.map((n) => n.id) });
    }
    clipboard = null;
    return Boolean(pasted);
  }

  /** The buffer, all false when empty. */
  getBuffer(): ClipboardBuffer {
    if (!clipboard) return { mode: false, node: false, inst: false, ids: [] };
    return { mode: clipboard.mode, node: [...clipboard.nodes], inst: clipboard.inst, ids: clipboard.nodes.map((n) => n.id) };
  }

  /** Whether anything is buffered. */
  canPaste(): boolean {
    return clipboard !== null;
  }

  /** Empty the buffer and emit `clear_buffer`. */
  clearBuffer(): void {
    markCut(false);
    clipboard = null;
    this.tree.emit(`clear_buffer.${EVENT_NS}`, {});
  }

  /** A destroyed tree's nodes can no longer be pasted. */
  forget(): void {
    if (clipboard?.inst === this.tree) clipboard = null;
  }

  private fill(mode: 'move_node' | 'copy_node', obj?: NodeRef | NodeRef[]): false | void {
    const refs: NodeRef[] = obj === undefined || obj === null ? this.tree.get_selected() : Array.isArray(obj) ? obj : [obj];
    const nodes = refs
      .map((ref) => this.node(ref))
      .filter((node): node is TreeNode => node !== null && node.id !== '#');
    if (!nodes.length) return false;
    markCut(false);
    clipboard = { mode, nodes, inst: this.tree };
    markCut(true);
    // jstree's payload is the nodes as given; `ids` is what earlier releases sent.
    this.tree.emit(`${mode === 'move_node' ? 'cut' : 'copy'}.${EVENT_NS}`, { node: refs, ids: nodes.map((n) => n.id) });
  }

  /** `get_node` without the DOM form, which this never asks for. */
  private node(ref: NodeRef): TreeNode | null {
    const found = this.tree.get_node(ref);
    return found === false ? null : (found as TreeNode);
  }
}
