import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Event payloads, as jstree 3.3.16 sends them: `move_node` and `copy_node`
 * carry where the node came from and which instances were involved — a move
 * between trees is still a `move_node` — `redraw` carries the nodes it drew,
 * `set_text` puts the node under `obj`, and deleting a selected node is
 * followed by `changed`.
 */
describe('event payload parity', () => {
  let left: HTMLElement;
  let right: HTMLElement;

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
    { id: 'a', text: 'A', state: { opened: true }, children: [{ id: 'a1', text: 'A1' }] },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ];
  const build = (el: HTMLElement, nodes = data()) =>
    new MDFolderTree(el, { core: { data: nodes, check_callback: true } });
  const listen = (tree: MDFolderTree, event: string) => {
    const seen = jest.fn();
    tree.on(`${event}.MDFolderTree`, (e) => seen((e as CustomEvent).detail));
    return seen;
  };

  describe('move_node', () => {
    it('should carry jstree\'s fields for a move within one tree', () => {
      const tree = build(left);
      const moved = listen(tree, 'move_node');

      tree.move_node('b', 'a', 0);

      const detail = moved.mock.calls[0][0];
      expect(detail.node.id).toBe('b');
      expect(detail.parent).toBe('a');
      expect(detail.position).toBe(0);
      expect(detail.old_parent).toBe('#');
      expect(detail.old_position).toBe(1);
      expect(detail.is_multi).toBe(false);
      expect(detail.is_foreign).toBe(false);
      expect(detail.old_instance).toBe(tree);
      expect(detail.new_instance).toBe(tree);
    });

    it('should stay a move_node when the node comes from another tree', () => {
      const source = build(left);
      const target = build(right, [{ id: 'p', text: 'P' }]);
      const moved = listen(target, 'move_node');

      target.move_node(source.get_node('b') as TreeNode, 'p', 0, undefined, false, false, source);

      expect(moved).toHaveBeenCalledTimes(1);
      const detail = moved.mock.calls[0][0];
      expect(detail.parent).toBe('p');
      expect(detail.old_parent).toBe('#');
      expect(detail.old_position).toBe(1);
      expect(detail.is_multi).toBe(true);
      expect(detail.is_foreign).toBe(false);
      expect(detail.old_instance).toBe(source);
      expect(detail.new_instance).toBe(target);
      expect(source.get_node('b')).toBe(false);
    });
  });

  describe('copy_node', () => {
    it('should carry jstree\'s fields for a copy within one tree', () => {
      const tree = build(left);
      const copied = listen(tree, 'copy_node');

      tree.copy_node('b', 'a', 0);

      const detail = copied.mock.calls[0][0];
      expect(detail.original.id).toBe('b');
      expect(detail.parent).toBe('a');
      expect(detail.position).toBe(0);
      expect(detail.old_parent).toBe('#');
      expect(detail.old_position).toBe(1);
      expect(detail.is_multi).toBe(false);
      expect(detail.is_foreign).toBe(false);
      expect(detail.old_instance).toBe(tree);
      expect(detail.new_instance).toBe(tree);
    });

    it('should mark a copy taken from another tree', () => {
      const source = build(left);
      const target = build(right, [{ id: 'p', text: 'P' }]);
      const copied = listen(target, 'copy_node');

      target.copy_node(source.get_node('b') as TreeNode, 'p', 0, undefined, false, false, source);

      const detail = copied.mock.calls[0][0];
      expect(detail.is_multi).toBe(true);
      expect(detail.old_parent).toBe('#');
      expect(detail.old_position).toBe(1);
      expect(detail.old_instance).toBe(source);
      expect(detail.new_instance).toBe(target);
      expect(source.get_node('b')).not.toBe(false);
    });
  });

  describe('redraw', () => {
    it('should carry the nodes it drew', () => {
      const tree = build(left);
      const drawn = listen(tree, 'redraw');

      tree.redraw();

      const nodes = drawn.mock.calls[0][0].nodes as HTMLElement[];
      expect(nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['a', 'a1', 'b', 'c']));
    });
  });

  describe('set_text', () => {
    it('should put the node under obj, as jstree does', () => {
      const tree = build(left);
      const texted = listen(tree, 'set_text');

      tree.set_text('b', 'B2');

      const detail = texted.mock.calls[0][0];
      expect(detail.obj.id).toBe('b');
      expect(detail.text).toBe('B2');
      // Kept from earlier releases, alongside jstree's field.
      expect(detail.node.id).toBe('b');
    });
  });

  describe('delete_node', () => {
    it('should follow a deleted selection with changed', () => {
      const tree = build(left);
      tree.select_node('b');
      const changed = listen(tree, 'changed');

      tree.delete_node('b');

      expect(changed).toHaveBeenCalledTimes(1);
      const detail = changed.mock.calls[0][0];
      expect(detail.action).toBe('delete_node');
      expect(detail.node.id).toBe('b');
      expect(detail.parent).toBe('#');
      expect(detail.selected).toEqual([]);
    });

    it('should stay silent when nothing selected was deleted', () => {
      const tree = build(left);
      tree.select_node('b');
      const changed = listen(tree, 'changed');

      tree.delete_node('c');

      expect(changed).not.toHaveBeenCalled();
    });
  });
});
