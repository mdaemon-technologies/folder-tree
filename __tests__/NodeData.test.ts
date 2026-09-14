import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * `node.data` parity with jstree 3.3.16.
 *
 * jstree nodes carry the `data` supplied in their JSON (null when there is
 * none) — consumers routinely read `data.node.data` in event handlers. A
 * `data.jstree` object overrides state and icon, and `data.functions` lets a
 * node permit or forbid individual operations regardless of check_callback
 * (the parent's for move / copy / create, the node's own otherwise).
 */
describe('Node data', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    container.remove();
  });

  const build = (data: TreeNodeData[], core: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, check_callback: true, ...core } });

  const node = (tree: MDFolderTree, id: string) => tree.get_node(id) as TreeNode;

  describe('node.data', () => {
    it('should expose the data supplied in the node JSON', () => {
      const tree = build([{ id: 'a', text: 'A', data: { owner: 'ops', size: 3 } }]);

      expect(node(tree, 'a').data).toEqual({ owner: 'ops', size: 3 });
    });

    it('should be null for a node supplied without data, as in jstree', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      expect(node(tree, 'a').data).toBeNull();
    });

    it('should expose data on a node made with create_node', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      tree.create_node('#', { id: 'fresh', text: 'Fresh', data: { tag: 'new' } });

      expect(node(tree, 'fresh').data).toEqual({ tag: 'new' });
    });

    it('should expose data on a lazily loaded node', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (n, callback) => {
            if (n.id === '#') {
              callback([{ id: 'lazy', text: 'Lazy', children: true } as TreeNodeData]);
              return;
            }
            callback([{ id: 'kid', text: 'Kid', data: { depth: 1 } }]);
          },
        },
      });

      tree.load_node('lazy');

      expect(node(tree, 'kid').data).toEqual({ depth: 1 });
    });

    it('should copy data onto a copied node without sharing it', () => {
      const tree = build([
        { id: 'src', text: 'Src', data: { nested: { v: 1 } } },
        { id: 'dest', text: 'Dest' },
      ]);

      const copyId = tree.copy_node('src', 'dest', 0) as string;
      const copy = node(tree, copyId);

      expect(copy.data).toEqual({ nested: { v: 1 } });
      expect(copy.data).not.toBe(node(tree, 'src').data);
    });

    it('should apply state from data.jstree', () => {
      const tree = build([
        {
          id: 'p',
          text: 'P',
          data: { jstree: { opened: true, disabled: true } },
          children: [{ id: 'k', text: 'K' }],
        },
      ]);

      expect(tree.is_open('p')).toBe(true);
      expect(tree.is_disabled('p')).toBe(true);
    });

    it('should apply an icon from data.jstree', () => {
      const tree = build([{ id: 'a', text: 'A', data: { jstree: { icon: 'from-data' } } }]);

      expect(tree.get_icon('a')).toBe('from-data');
    });
  });

  describe('data.functions', () => {
    it('should refuse an operation the node forbids, as core_02', () => {
      const tree = build([{ id: 'a', text: 'A', data: { functions: { rename_node: false } } }]);

      expect(tree.rename_node('a', 'X')).toBe(false);
      expect(tree.last_error()).toMatchObject({
        error: 'check',
        plugin: 'core',
        id: 'core_02',
        reason: 'Node data prevents function: rename_node',
      });
    });

    it('should permit an operation the node allows even when check_callback forbids it', () => {
      const tree = build(
        [{ id: 'a', text: 'A', data: { functions: { rename_node: true } } }],
        { check_callback: false },
      );

      expect(tree.rename_node('a', 'Renamed')).toBe(true);
      expect(tree.get_text('a')).toBe('Renamed');
    });

    it('should consult the parent for create_node', () => {
      const tree = build([
        { id: 'locked', text: 'Locked', data: { functions: { create_node: false } } },
        { id: 'open', text: 'Open' },
      ]);

      expect(tree.create_node('locked', { id: 'x', text: 'X' })).toBe(false);
      expect(tree.create_node('open', { id: 'y', text: 'Y' })).not.toBe(false);
    });

    it('should consult the destination parent for move_node', () => {
      const tree = build([
        { id: 'a', text: 'A' },
        { id: 'locked', text: 'Locked', data: { functions: { move_node: false } } },
      ]);

      expect(tree.move_node('a', 'locked', 0)).toBe(false);
    });
  });

  describe('get_json', () => {
    it('should include node data', () => {
      const tree = build([{ id: 'a', text: 'A', data: { owner: 'ops' } }]);

      expect((tree.get_json('a') as TreeNodeData).data).toEqual({ owner: 'ops' });
    });

    it('should report data as false with no_data, as jstree does', () => {
      const tree = build([{ id: 'a', text: 'A', data: { owner: 'ops' } }]);

      expect((tree.get_json('a', { no_data: true }) as TreeNodeData).data).toBe(false);
    });
  });
});
