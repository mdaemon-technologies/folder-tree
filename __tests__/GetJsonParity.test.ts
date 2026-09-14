import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * get_json parity with jstree 3.3.16, and the JSON ingest that makes its
 * output load back as the same tree.
 *
 * jstree emits, for every node, `id`, `text`, `icon`, `li_attr`, `a_attr`,
 * the whole `state`, `data` (`{}` when there is none, `false` under
 * `no_data`) and `children` — plus `type` when the types plugin is active.
 * `flat` lists nodes in pre-order with `parent` instead of `children`.
 * On ingest, a node's `state` is layered over `data.jstree`, over the
 * defaults; `li_attr.id` defaults to the node id (and stands in for a
 * missing one), and `a_attr.href` to '#'.
 */
describe('get_json parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const build = (data: TreeNodeData[], rest: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, check_callback: true }, ...rest });

  const baseState = { opened: false, selected: false, disabled: false, loaded: true, loading: false, checked: false };

  describe('output shape', () => {
    it('should emit every field for each node', () => {
      const tree = build([{ id: 'a', text: 'A', children: [{ id: 'b', text: 'B' }] }]);

      expect(tree.get_json('a')).toEqual({
        id: 'a',
        text: 'A',
        icon: true,
        li_attr: { id: 'a' },
        a_attr: { href: '#', id: 'a_anchor' },
        state: baseState,
        data: {},
        children: [
          {
            id: 'b',
            text: 'B',
            icon: true,
            li_attr: { id: 'b' },
            a_attr: { href: '#', id: 'b_anchor' },
            state: baseState,
            data: {},
            children: [],
          },
        ],
      });
    });

    it('should report the root children for no argument or #', () => {
      const tree = build([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);

      const all = tree.get_json() as TreeNodeData[];

      expect(all.map((n) => n.id)).toEqual(['a', 'b']);
      expect(tree.get_json('#')).toEqual(all);
    });

    it('should accept a node object', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      expect((tree.get_json(tree.get_node('a') as TreeNode) as TreeNodeData).id).toBe('a');
    });

    it('should list nodes in pre-order with their parent when flat', () => {
      const tree = build([
        { id: 'a', text: 'A', children: [{ id: 'b', text: 'B' }] },
        { id: 'c', text: 'C' },
      ]);

      const flat = tree.get_json('#', { flat: true }) as TreeNodeData[];

      expect(flat.map((n) => [n.id, n.parent])).toEqual([
        ['a', '#'],
        ['b', 'a'],
        ['c', '#'],
      ]);
      expect(flat.every((n) => n.children === undefined)).toBe(true);
    });
  });

  describe('options', () => {
    it('should drop ids, including li_attr and a_attr ids, throughout with no_id', () => {
      const tree = build([{ id: 'a', text: 'A', children: [{ id: 'b', text: 'B' }] }]);

      const json = tree.get_json('a', { no_id: true }) as TreeNodeData;
      const child = (json.children as TreeNodeData[])[0];

      expect('id' in json).toBe(false);
      expect(json.li_attr).toEqual({});
      expect(json.a_attr).toEqual({ href: '#' });
      expect('id' in child).toBe(false);
    });

    it('should drop li_attr and a_attr with no_li_attr and no_a_attr', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      const json = tree.get_json('a', { no_li_attr: true, no_a_attr: true }) as TreeNodeData;

      expect('li_attr' in json).toBe(false);
      expect('a_attr' in json).toBe(false);
    });

    it('should keep an empty children array with no_children', () => {
      const tree = build([{ id: 'a', text: 'A', children: [{ id: 'b', text: 'B' }] }]);

      expect((tree.get_json('a', { no_children: true }) as TreeNodeData).children).toEqual([]);
    });
  });

  describe('type', () => {
    it('should be absent without the types plugin', () => {
      const tree = build([{ id: 'a', text: 'A', type: 'folder' }]);

      expect('type' in (tree.get_json('a') as TreeNodeData)).toBe(false);
    });

    it('should be reported for every node with the types plugin', () => {
      const tree = build(
        [{ id: 'a', text: 'A', type: 'folder', children: [{ id: 'b', text: 'B' }] }],
        { types: { folder: {} } },
      );

      const json = tree.get_json('a') as TreeNodeData;

      expect(json.type).toBe('folder');
      expect((json.children as TreeNodeData[])[0].type).toBe('default');
    });
  });

  describe('ingest', () => {
    it('should load get_json output back as the same tree, keeping a lazy node unloaded', () => {
      const lazy = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
            callback(node.id === '#' ? [{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData] : []),
        },
      } as never);
      const json = lazy.get_json() as TreeNodeData[];
      lazy.destroy();

      const tree = build(json);

      expect(tree.is_loaded('lz')).toBe(false);
      expect(tree.get_json()).toEqual(json);
    });

    it('should let a node state override data.jstree', () => {
      const tree = build([
        {
          id: 'p',
          text: 'P',
          state: { opened: false },
          data: { jstree: { opened: true } },
          children: [{ id: 'k', text: 'K' }],
        },
      ]);

      expect(tree.is_open('p')).toBe(false);
    });

    it('should take a missing node id from li_attr.id', () => {
      const tree = build([{ text: 'X', li_attr: { id: 'from-li' } } as unknown as TreeNodeData]);

      expect(tree.get_node('from-li')).not.toBe(false);
    });

    it('should keep li_attr.id in step with set_id', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      tree.set_id('a', 'z');

      expect((tree.get_node('z') as TreeNode).li_attr.id).toBe('z');
    });

    it('should give a copied node its own li_attr id', () => {
      const tree = build([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);

      tree.copy_node('a', 'b');

      const copy = (tree.get_node('b') as TreeNode).children[0];
      expect((tree.get_node(copy) as TreeNode).li_attr.id).toBe(copy);
    });
  });
});
