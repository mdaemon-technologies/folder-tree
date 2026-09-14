import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Unique plugin parity with jstree 3.3.16. The plugin joins `check`: after
 * the core rules pass — even when a node's data.functions permits the
 * operation — it refuses a name a sibling already has, with jstree's errors
 * (`unique_01` rename, `unique_02` copy, `unique_03` move, `unique_04`
 * create). A node created without text is named `get_string('New node')`,
 * made unique through `unique.duplicate(name, counter)`.
 */
describe('Unique plugin parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'p', text: 'P', children: [{ id: 'pa', text: 'A' }, { id: 'pk', text: 'K' }] },
  ];

  const build = (unique: Record<string, unknown> = {}, nodes: TreeNodeData[] = data(), core: Record<string, unknown> = {}) =>
    new MDFolderTree(container, {
      core: { data: nodes, check_callback: true, ...core },
      plugins: ['unique'],
      unique,
    } as never);

  const errorOf = (tree: MDFolderTree) => tree.last_error() as { plugin: string; id: string; reason: string; data: string };

  describe('rename_node', () => {
    it('should refuse a name a sibling has, as unique_01', () => {
      const tree = build();

      expect(tree.rename_node('a', 'b')).toBe(false);

      expect(tree.get_text('a')).toBe('A');
      expect(errorOf(tree)).toEqual({
        error: 'check',
        plugin: 'unique',
        id: 'unique_01',
        reason: 'Child with name b already exists. Preventing: rename_node',
        data: JSON.stringify({ chk: 'rename_node', pos: 'b', obj: 'a', par: '#' }),
      });
    });

    it('should allow renaming a node to its own name in another case', () => {
      const tree = build();

      expect(tree.rename_node('a', 'a')).toBe(true);
      expect(tree.get_text('a')).toBe('a');
    });

    it('should compare case-sensitively with case_sensitive', () => {
      const tree = build({ case_sensitive: true });

      expect(tree.rename_node('a', 'b')).toBe(true);
    });

    it('should ignore surrounding whitespace with trim_whitespace', () => {
      expect(build({ trim_whitespace: true }).rename_node('a', ' B ')).toBe(false);
    });

    it('should compare whitespace as is without trim_whitespace', () => {
      expect(build().rename_node('a', ' B ')).toBe(true);
    });

    it('should apply after data.functions permits the operation', () => {
      const tree = build({}, [
        { id: 'a', text: 'A', data: { functions: { rename_node: true } } },
        { id: 'b', text: 'B' },
      ]);

      expect(tree.rename_node('a', 'B')).toBe(false);
      expect(errorOf(tree).id).toBe('unique_01');
    });

    it('should pass the error to core.error', () => {
      const errors: unknown[] = [];
      const tree = build({}, data(), { error: (e: unknown) => errors.push(e) });

      tree.rename_node('a', 'B');

      expect(errors).toContainEqual(expect.objectContaining({ plugin: 'unique', id: 'unique_01' }));
    });
  });

  describe('create_node', () => {
    it('should refuse a name a sibling has, as unique_04', () => {
      const tree = build();

      expect(tree.create_node('#', { text: 'a' } as TreeNodeData)).toBe(false);
      expect(errorOf(tree).id).toBe('unique_04');
    });

    it('should name nodes created without text New node, New node (2), New node (3)', () => {
      const tree = build();

      const ids = [tree.create_node('#'), tree.create_node('#'), tree.create_node('#', {} as TreeNodeData)];

      expect(ids.map((id) => tree.get_text(id as string))).toEqual(['New node', 'New node (2)', 'New node (3)']);
    });

    it('should call unique.duplicate with the name and counter, and the tree as this', () => {
      const calls: Array<[unknown, string, number]> = [];
      const tree = build({
        duplicate: function (this: unknown, name: string, counter: number) {
          calls.push([this, name, counter]);
          return `${name} #${counter}`;
        },
      });

      tree.create_node('#');
      const second = tree.create_node('#') as string;

      expect(tree.get_text(second)).toBe('New node #2');
      expect(calls).toEqual([[tree, 'New node', 2]]);
    });
  });

  describe('move_node / copy_node', () => {
    it('should refuse moving into a parent with a same-named child, as unique_03', () => {
      const tree = build();

      expect(tree.move_node('a', 'p')).toBe(false);
      expect(errorOf(tree).id).toBe('unique_03');
    });

    it('should allow reordering within the same parent', () => {
      const tree = build();

      expect(tree.move_node('a', '#', 'last')).toBe('a');
    });

    it('should refuse copying beside a same-named node, even within the parent, as unique_02', () => {
      const tree = build();

      expect(tree.copy_node('b', '#', 'last')).toBe(false);
      expect(errorOf(tree).id).toBe('unique_02');
    });

    it('should allow copying where the name is free', () => {
      const tree = build();

      expect(typeof tree.copy_node('b', 'p', 'last')).toBe('string');
      expect((tree.get_node('p') as TreeNode).children).toHaveLength(3);
    });
  });

  it('should not affect delete_node', () => {
    const tree = build();

    expect(tree.delete_node('a')).toBe(true);
  });
});
