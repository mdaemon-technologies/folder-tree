import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * create_node parity with jstree 3.3.16: `create_node(par, node, pos,
 * callback, is_loaded)` returns the new node's id. `node` may be a string
 * (its text) or omitted (`get_string('New node')`), and is copied, not
 * modified; nested `children` create a whole subtree. `pos` defaults to
 * 'last' and may be 'first' / 'inside', 'last', 'before' / 'after' (a sibling
 * of `par`; first / last at the root) or an index. An unloaded parent is
 * loaded first.
 */
describe('create_node parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const build = (data: TreeNodeData[], core: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, check_callback: true, ...core } });

  const roots = (tree: MDFolderTree) => (tree.get_json() as TreeNodeData[]).map((n) => n.id);
  const kids = (tree: MDFolderTree, id: string) => (tree.get_node(id) as TreeNode).children;

  describe('return value and node forms', () => {
    it('should return the new node id', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      expect(tree.create_node('a', { id: 'n', text: 'N' })).toBe('n');
    });

    it('should take a string as the new node text', () => {
      const tree = build([]);

      const id = tree.create_node('#', 'Plain') as string;

      expect(tree.get_text(id)).toBe('Plain');
    });

    it('should name a node without text through get_string', () => {
      const tree = build([], { strings: { 'New node': 'Nouveau' } });

      const bare = tree.create_node('#') as string;
      const textless = tree.create_node('#', { id: 'x' } as TreeNodeData) as string;

      expect(tree.get_text(bare)).toBe('Nouveau');
      expect(tree.get_text(textless)).toBe('Nouveau');
    });

    it('should create a whole subtree from nested children', () => {
      const tree = build([]);

      tree.create_node('#', {
        id: 's',
        text: 'S',
        children: [{ id: 's1', text: 'S1', children: [{ id: 's2', text: 'S2' }] }],
      });

      expect(kids(tree, 's')).toEqual(['s1']);
      expect((tree.get_node('s2') as TreeNode).parent).toBe('s1');
      expect((tree.get_node('s') as TreeNode).children_d).toEqual(['s1', 's2']);
    });

    it('should not modify the node object it is given', () => {
      const tree = build([]);
      const input = { id: 'n', text: 'N', children: [{ id: 'k', text: 'K' }] };
      const snapshot = JSON.parse(JSON.stringify(input));

      tree.create_node('#', input);

      expect(input).toEqual(snapshot);
    });

    it('should call back with the new node', () => {
      const tree = build([]);
      const callback = jest.fn();

      tree.create_node('#', { id: 'n', text: 'N' }, 'last', callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'n' }));
    });
  });

  describe('positions', () => {
    const siblings = () =>
      build([
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'p', text: 'P', children: [{ id: 'k', text: 'K' }] },
      ]);

    it('should default to the last position', () => {
      const tree = siblings();

      tree.create_node('#', { id: 'n', text: 'N' });

      expect(roots(tree)).toEqual(['a', 'b', 'p', 'n']);
    });

    it('should place first and inside at the start', () => {
      const tree = siblings();

      tree.create_node('p', { id: 'f', text: 'F' }, 'first');
      tree.create_node('p', { id: 'i', text: 'I' }, 'inside');

      expect(kids(tree, 'p')).toEqual(['i', 'f', 'k']);
    });

    it('should place before and after as a sibling of par', () => {
      const tree = siblings();

      tree.create_node('b', { id: 'x', text: 'X' }, 'before');
      tree.create_node('a', { id: 'y', text: 'Y' }, 'after');

      expect(roots(tree)).toEqual(['a', 'y', 'x', 'b', 'p']);
    });

    it('should treat before and after the root as first and last', () => {
      const tree = siblings();

      tree.create_node('#', { id: 'f', text: 'F' }, 'before');
      tree.create_node('#', { id: 'l', text: 'L' }, 'after');

      expect(roots(tree)).toEqual(['f', 'a', 'b', 'p', 'l']);
    });

    it('should clamp an index past the end', () => {
      const tree = siblings();

      tree.create_node('#', { id: 'z', text: 'Z' }, 99);

      expect(roots(tree)).toEqual(['a', 'b', 'p', 'z']);
    });
  });

  describe('lazy parents', () => {
    it('should load an unloaded parent before creating inside it', () => {
      const tree = new MDFolderTree(container, {
        core: {
          check_callback: true,
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
            callback(
              node.id === '#'
                ? [{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData]
                : [{ id: 'k', text: 'K' }],
            ),
        },
      } as never);

      tree.create_node('lz', { id: 'n', text: 'N' });

      expect(kids(tree, 'lz')).toEqual(['k', 'n']);
    });
  });
});
