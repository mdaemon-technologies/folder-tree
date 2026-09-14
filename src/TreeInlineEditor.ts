import type { MDFolderTree } from './MDFolderTree';
import type { NodeRef, TreeNode } from './types';
import { EVENT_NS } from './events/namespace';

/** Told how the edit ended: committed, dismissed, or cancelled outright. */
export type EditCallback = (node: TreeNode, status: boolean, cancel: boolean) => void;

/**
 * Renaming a node in place: the text is swapped for an input carrying it,
 * which commits on Enter or blur and abandons on Escape. The rename itself
 * goes through `rename_node`, so the unique plugin and `check_callback` have
 * their say exactly as they would for any other rename.
 *
 * It reaches its tree through the public API alone.
 */
export class TreeInlineEditor {
  constructor(private readonly tree: MDFolderTree) {}

  edit(obj: NodeRef, defaultText?: string, callback?: EditCallback): void {
    // As jstree does, a node that is not in the store -- the root among them
    // -- is not editable, and is refused before `check` is troubled.
    const found = this.tree.get_node(obj);
    if (found === false) return;
    const node = this.tree.getNode((found as TreeNode).id);
    if (!node) return;
    if (!this.tree.check('edit', node, node.parent)) return;

    const element = this.tree.getContainer().querySelector(`#${CSS.escape(node.id)}`) as HTMLElement | null;
    const anchor = element?.querySelector(':scope > .md-tree-anchor') as HTMLElement | null;
    const textSpan = anchor?.querySelector('span') as HTMLElement | null;
    if (!anchor || !textSpan) return;

    const originalText = node.text;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'md-tree-rename-input';
    input.value = defaultText ?? originalText;

    textSpan.style.display = 'none';
    anchor.appendChild(input);
    input.focus();
    input.select();

    this.tree.emit(`edit.${EVENT_NS}`, { node });

    const cleanup = (): void => {
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      input.parentElement?.removeChild(input);
      textSpan.style.display = '';
    };

    const commit = (): void => {
      const text = input.value.trim();
      cleanup();
      // An empty or unchanged name is dismissed rather than cancelled: the
      // editor closed of its own accord, which is not the same as Escape.
      const renamed = Boolean(text) && text !== originalText;
      if (renamed) this.tree.renameNode(node.id, text);
      callback?.(node, renamed, false);
    };

    const cancel = (): void => {
      cleanup();
      callback?.(node, false, true);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    const onBlur = (): void => commit();

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
  }
}
