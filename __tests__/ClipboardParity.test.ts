import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Clipboard parity with jstree 3.3.16: one buffer serves every tree on the
 * page — `get_buffer()` is `{ mode: 'move_node' | 'copy_node' | false, node,
 * inst }` — filled by cut / copy (the selection when given nothing) and
 * pasted through move_node / copy_node with the buffer's tree as the origin,
 * so the nodes keep their order and may land in another tree. `cut`, `copy`
 * and `paste` carry jstree's payloads, and paste empties the buffer without
 * `clear_buffer`.
 */
describe('clipboard parity', () => {
  let left: HTMLElement;
  let right: HTMLElement;

  interface Buffer {
    mode: string | false;
    node: TreeNode[] | false;
    inst: MDFolderTree | false;
  }

  beforeEach(() => {
    left = document.createElement('div');
    right = document.createElement('div');
    document.body.append(left, right);
  });

  afterEach(() => {
    MDFolderTree.getInstance(left)?.destroy();
    MDFolderTree.getInstance(right)?.destroy();
    left.remove();
    right.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'f', text: 'F', state: { opened: true }, children: [{ id: 'x', text: 'X' }] },
  ];
  const build = (el: HTMLElement, nodes = data()) => new MDFolderTree(el, { core: { data: nodes, check_callback: true } });
  const buffer = (tree: MDFolderTree) => tree.get_buffer() as unknown as Buffer;
  const ids = (nodes: TreeNode[] | false) => (nodes || []).map((n) => n.id);
  const kids = (tree: MDFolderTree, id: string) => (tree.get_node(id) as TreeNode).children;

  describe('the buffer', () => {
    it('should hold the cut nodes, the mode and the tree', () => {
      const tree = build(left);

      tree.cut(['a', 'b']);

      expect(buffer(tree).mode).toBe('move_node');
      expect(ids(buffer(tree).node)).toEqual(['a', 'b']);
      expect(buffer(tree).inst).toBe(tree);
    });

    it('should hold copied nodes in copy_node mode', () => {
      const tree = build(left);

      tree.copy('a');

      expect(buffer(tree).mode).toBe('copy_node');
      expect(ids(buffer(tree).node)).toEqual(['a']);
    });

    it('should report an empty buffer as jstree does', () => {
      const tree = build(left);

      expect(buffer(tree)).toEqual(expect.objectContaining({ mode: false, node: false, inst: false }));
      expect(tree.can_paste()).toBe(false);
    });

    it('should take the selection when given nothing', () => {
      const tree = build(left);
      tree.select_node(['a', 'b']);

      (tree.copy as (obj?: unknown) => unknown)();

      expect(ids(buffer(tree).node)).toEqual(['a', 'b']);
    });

    it('should refuse to cut nothing or the root', () => {
      const tree = build(left);

      expect(tree.cut([])).toBe(false);
      expect(tree.cut('#')).toBe(false);
      expect(tree.can_paste()).toBe(false);
    });

    it('should be shared by every tree', () => {
      const source = build(left);
      const target = build(right, [{ id: 'p', text: 'P' }]);

      source.cut('a');

      expect(target.can_paste()).toBe(true);
      expect(buffer(target).inst).toBe(source);
    });

    it('should forget a destroyed tree\'s nodes', () => {
      const source = build(left);
      const target = build(right, [{ id: 'p', text: 'P' }]);
      source.cut('a');

      source.destroy();

      expect(target.can_paste()).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit cut and copy with the nodes given', () => {
      const tree = build(left);
      const cut = jest.fn();
      const copy = jest.fn();
      tree.on('cut.MDFolderTree', (e) => cut((e as CustomEvent).detail));
      tree.on('copy.MDFolderTree', (e) => copy((e as CustomEvent).detail));

      tree.cut('a');
      tree.copy(['a', 'b']);

      expect(cut.mock.calls[0][0].node).toEqual(['a']);
      expect(copy.mock.calls[0][0].node).toEqual(['a', 'b']);
    });

    it('should emit paste with the parent, the nodes and the mode', () => {
      const tree = build(left);
      const paste = jest.fn();
      tree.on('paste.MDFolderTree', (e) => paste((e as CustomEvent).detail));
      tree.cut(['a', 'b']);

      tree.paste('f');

      const detail = paste.mock.calls[0][0];
      expect(detail.parent).toBe('f');
      expect(detail.mode).toBe('move_node');
      expect(ids(detail.node)).toEqual(['a', 'b']);
    });

    it('should empty the buffer on paste without clear_buffer', () => {
      const tree = build(left);
      const cleared = jest.fn();
      tree.on('clear_buffer.MDFolderTree', cleared);
      tree.cut('a');

      tree.paste('f');

      expect(tree.can_paste()).toBe(false);
      expect(cleared).not.toHaveBeenCalled();
    });
  });

  describe('pasting', () => {
    it('should move several nodes, keeping their order', () => {
      const tree = build(left);
      tree.cut(['a', 'b']);

      tree.paste('f');

      expect(kids(tree, 'f')).toEqual(['a', 'b', 'x']);
    });

    it('should copy several nodes, keeping their order', () => {
      const tree = build(left);
      tree.copy(['a', 'b']);

      tree.paste('f');

      expect(kids(tree, 'f').map((id) => tree.get_text(id))).toEqual(['A', 'B', 'X']);
      expect(tree.get_node('a')).not.toBe(false);
    });

    it('should paste at a position', () => {
      const tree = build(left);
      tree.cut('a');

      tree.paste('f', 'last' as never);

      expect(kids(tree, 'f')).toEqual(['x', 'a']);
    });

    it('should paste into another tree', () => {
      const source = build(left);
      const target = build(right, [{ id: 'p', text: 'P' }]);
      source.cut('a');

      target.paste('p');

      expect(source.get_node('a')).toBe(false);
      expect(kids(target, 'p').map((id) => target.get_text(id))).toEqual(['A']);
    });
  });
});
