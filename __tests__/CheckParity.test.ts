import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * `check()` parity with jstree 3.3.16.
 *
 * jstree validates every structural operation through a public `check()`:
 * structural rules first (a node may not be moved or copied into itself or
 * its own descendant, nor moved to the position it already occupies), then
 * `core.check_callback` — which may be a boolean, a function, or a map of
 * operation names to booleans. Refusals set `last_error()` to jstree's error
 * shape. The callback receives operation-specific arguments: the new node's
 * data for create_node, the new text for rename_node, the index for
 * delete_node, and core metadata for move_node / copy_node.
 */
describe('check() parity', () => {
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

  const data: TreeNodeData[] = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    {
      id: 'folder',
      text: 'Folder',
      state: { opened: true },
      children: [{ id: 'deep', text: 'Deep' }],
    },
  ];

  type Recorded = { op: string; node: TreeNode; parent: TreeNode; position: unknown; more: unknown };

  const build = (checkCallback: unknown = true) =>
    new MDFolderTree(container, {
      core: { data, check_callback: checkCallback as never },
    });

  const recording = () => {
    const calls: Recorded[] = [];
    const tree = build((op: string, node: TreeNode, parent: TreeNode, position: unknown, more: unknown) => {
      calls.push({ op, node, parent, position, more });
      return true;
    });
    return { tree, calls };
  };

  describe('check()', () => {
    it('should allow an operation check_callback permits', () => {
      const tree = build(true);

      expect(tree.check('delete_node', 'a', '#')).toBe(true);
    });

    it('should refuse an operation when check_callback is false', () => {
      const tree = build(false);

      expect(tree.check('rename_node', 'a', '#', 'X')).toBe(false);
    });

    it('should consult a check_callback map per operation', () => {
      const tree = build({ delete_node: false });

      expect(tree.check('delete_node', 'a', '#')).toBe(false);
      expect(tree.check('rename_node', 'a', '#', 'X')).toBe(true);
    });

    it('should refuse moving a node into its own descendant', () => {
      const tree = build(true);

      expect(tree.check('move_node', 'folder', 'deep', 0)).toBe(false);
    });

    it('should refuse copying a node into itself', () => {
      const tree = build(true);

      expect(tree.check('copy_node', 'folder', 'folder', 0)).toBe(false);
    });
  });

  describe('structural rules', () => {
    it('should refuse to copy a node into its own descendant, as jstree does', () => {
      const tree = build(true);

      expect(tree.copy_node('folder', 'deep', 0)).toBe(false);
      expect((tree.get_node('deep') as TreeNode).children).toEqual([]);
    });

    it('should refuse to move a node to its current position', () => {
      const tree = build(true);
      let moved = 0;
      tree.on('move_node.MDFolderTree', () => { moved++; });

      expect(tree.move_node('a', '#', 0)).toBe(false);
      expect(moved).toBe(0);
    });

    it('should still move a node to another position under the same parent', () => {
      const tree = build(true);

      expect(tree.move_node('a', '#', 2)).toBe('a');
    });
  });

  describe('check_callback map', () => {
    it('should block only the operations mapped to false', () => {
      const tree = build({ delete_node: false });

      expect(tree.delete_node('a')).toBe(false);
      expect(tree.rename_node('a', 'Renamed')).toBe(true);
    });
  });

  describe('check_callback arguments', () => {
    it('should pass the new node data for create_node', () => {
      const { tree, calls } = recording();

      tree.create_node('#', { id: 'fresh', text: 'Fresh' });

      const call = calls.find((c) => c.op === 'create_node')!;
      expect(call.node).toMatchObject({ id: 'fresh', text: 'Fresh' });
      expect(call.parent.id).toBe('#');
      expect(call.position).toBe(3);
    });

    it('should pass the new text as the position for rename_node', () => {
      const { tree, calls } = recording();

      tree.rename_node('a', 'New name');

      const call = calls.find((c) => c.op === 'rename_node')!;
      expect(call.node.id).toBe('a');
      expect(call.parent.id).toBe('#');
      expect(call.position).toBe('New name');
    });

    it('should pass the index within the parent for delete_node', () => {
      const { tree, calls } = recording();

      tree.delete_node('b');

      expect(calls.find((c) => c.op === 'delete_node')!.position).toBe(1);
    });

    it('should pass core metadata for move_node', () => {
      const { tree, calls } = recording();

      tree.move_node('a', 'folder', 0);

      expect(calls.find((c) => c.op === 'move_node')!.more).toMatchObject({
        core: true,
        is_multi: false,
        is_foreign: false,
      });
    });

    it('should check edit before starting an inline rename', () => {
      const ops: string[] = [];
      const tree = build((op: string) => {
        ops.push(op);
        return op !== 'edit';
      });

      tree.edit('a');

      expect(ops).toContain('edit');
      expect(container.querySelector('.md-tree-rename-input')).toBeNull();
    });
  });

  describe('last_error shape', () => {
    const parsed = (tree: MDFolderTree) => {
      const err = tree.last_error() as { data: string };
      return JSON.parse(err.data) as Record<string, unknown>;
    };

    it('should report a move into a descendant as core_01', () => {
      const tree = build(true);

      tree.move_node('folder', 'deep', 0);

      expect(tree.last_error()).toMatchObject({
        error: 'check',
        plugin: 'core',
        id: 'core_01',
        reason: 'Moving parent inside child',
      });
      expect(parsed(tree)).toMatchObject({ chk: 'move_node', obj: 'folder', par: 'deep' });
    });

    it('should report a move to the current position as core_08', () => {
      const tree = build(true);

      tree.move_node('a', '#', 0);

      expect(tree.last_error()).toMatchObject({
        error: 'check',
        plugin: 'core',
        id: 'core_08',
        reason: 'Moving node to its current position',
      });
    });

    it('should report a check_callback refusal as core_03', () => {
      const tree = build(false);

      tree.rename_node('a', 'X');

      expect(tree.last_error()).toMatchObject({
        error: 'check',
        plugin: 'core',
        id: 'core_03',
        reason: 'User config for core.check_callback prevents function: rename_node',
      });
    });

    it('should hand the same error to core.error', () => {
      const errors: unknown[] = [];
      const tree = new MDFolderTree(container, {
        core: { data, check_callback: false, error: (e) => errors.push(e) },
      });

      tree.rename_node('a', 'X');

      expect(errors).toEqual([tree.last_error()]);
    });
  });
});
