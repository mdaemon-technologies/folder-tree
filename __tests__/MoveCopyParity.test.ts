import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * move_node / copy_node argument parity with jstree 3.3.16:
 * `(obj, par, pos, callback, is_loaded)`. `pos` defaults to 0 and takes the
 * same forms as create_node's; an index is read against the children as they
 * are before the move. Arrays are placed one after another. An unloaded
 * parent is loaded first. The callback receives the node, the new parent and
 * the position; move_node returns the node's id and copy_node the copy's.
 */
describe('move_node / copy_node parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const build = () =>
    new MDFolderTree(container, {
      core: {
        check_callback: true,
        data: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
          { id: 'p', text: 'P', children: [{ id: 'k', text: 'K' }] },
        ],
      },
    });

  const roots = (tree: MDFolderTree) => (tree.get_json() as TreeNodeData[]).map((n) => n.id);
  const kids = (tree: MDFolderTree, id: string) => (tree.get_node(id) as TreeNode).children;

  const lazyTree = () =>
    new MDFolderTree(container, {
      core: {
        check_callback: true,
        data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
          callback(
            node.id === '#'
              ? [{ id: 'a', text: 'A' }, { id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData]
              : [{ id: 'k', text: 'K' }],
          ),
      },
    } as never);

  describe('move_node', () => {
    it('should return the moved node id', () => {
      const tree = build();

      expect(tree.move_node('a', 'p', 0)).toBe('a');
    });

    it('should read an index against the children before the move', () => {
      const tree = build();

      tree.move_node('a', '#', 2);

      expect(roots(tree)).toEqual(['b', 'a', 'c', 'p']);
    });

    it('should place after, last, first and before as jstree does', () => {
      const tree = build();

      tree.move_node('a', 'c', 'after');
      expect(roots(tree)).toEqual(['b', 'c', 'a', 'p']);

      tree.move_node('b', '#', 'last');
      expect(roots(tree)).toEqual(['c', 'a', 'p', 'b']);

      tree.move_node('b', '#', 'first');
      expect(roots(tree)).toEqual(['b', 'c', 'a', 'p']);

      tree.move_node('p', 'c', 'before');
      expect(roots(tree)).toEqual(['b', 'p', 'c', 'a']);
    });

    it('should place before or after a node in another parent beside it', () => {
      const tree = build();

      tree.move_node('a', 'k', 'before');

      expect(kids(tree, 'p')).toEqual(['a', 'k']);
    });

    it('should default to the first position', () => {
      const tree = build();

      tree.move_node('c', 'p');

      expect(kids(tree, 'p')).toEqual(['c', 'k']);
    });

    it('should place an array of nodes one after another', () => {
      const tree = build();

      tree.move_node(['a', 'b'], 'p', 0);

      expect(kids(tree, 'p')).toEqual(['a', 'b', 'k']);
    });

    it('should call back with the node, the new parent and the position', () => {
      const tree = build();
      const callback = jest.fn();

      tree.move_node('a', 'p', 'last', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a' }),
        expect.objectContaining({ id: 'p' }),
        1,
      );
    });

    it('should load an unloaded parent before moving into it', () => {
      const tree = lazyTree();

      tree.move_node('a', 'lz');

      expect(kids(tree, 'lz')).toEqual(['a', 'k']);
    });
  });

  describe('copy_node', () => {
    it('should place a copy after a node', () => {
      const tree = build();

      const copy = tree.copy_node('a', 'b', 'after') as string;

      expect(roots(tree)).toEqual(['a', 'b', copy, 'c', 'p']);
    });

    it('should place an array of copies one after another', () => {
      const tree = build();

      tree.copy_node(['a', 'b'], 'p', 'last');

      const [k, first, second] = kids(tree, 'p');
      expect(k).toBe('k');
      expect(tree.get_text(first)).toBe('A');
      expect(tree.get_text(second)).toBe('B');
    });

    it('should call back with the copy, the new parent and the position', () => {
      const tree = build();
      const callback = jest.fn();

      const copy = tree.copy_node('a', 'p', 'first', callback) as string;

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: copy }),
        expect.objectContaining({ id: 'p' }),
        0,
      );
    });

    it('should load an unloaded parent before copying into it', () => {
      const tree = lazyTree();

      const copy = tree.copy_node('a', 'lz', 'last') as unknown;

      expect(copy).toBe(true);
      const [k, copied] = kids(tree, 'lz');
      expect(k).toBe('k');
      expect(tree.get_text(copied)).toBe('A');
    });
  });
});
