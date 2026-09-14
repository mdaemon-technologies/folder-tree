import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Types plugin rules, as jstree 3.3.16 applies them: `get_rules` reports a
 * node's type merged with its rules and jstree's `-1` defaults; those rules
 * join `check`, refusing with `types_01` (max_children), `types_02`
 * (valid_children) and `types_03` (max_depth); a type's `li_attr` / `a_attr`
 * reach its nodes; and the root takes the `'#'` type, so `types: { '#': ... }`
 * governs the top level.
 */
describe('types rules parity', () => {
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
    {
      id: 'r1',
      text: 'R1',
      type: 'folder',
      state: { opened: true },
      children: [
        { id: 'f1', text: 'F1', type: 'file' },
        { id: 'f2', text: 'F2', type: 'file' },
      ],
    },
    { id: 'r2', text: 'R2', type: 'folder' },
    { id: 'loose', text: 'L', type: 'file' },
  ];

  const build = (types: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data: data(), check_callback: true }, plugins: ['types'], types } as never);
  const err = (tree: MDFolderTree) => tree.last_error() as { id?: string; plugin?: string };

  describe('get_rules', () => {
    it('should report the merged rules with jstree\'s -1 defaults', () => {
      const tree = build({ default: { icon: 'def' }, folder: { max_children: 2 } });

      expect(tree.get_rules('r1')).toEqual({
        type: 'folder',
        icon: 'def',
        max_children: 2,
        max_depth: -1,
        valid_children: -1,
      });
    });

    it('should be false for an unknown node', () => {
      const tree = build({});

      expect(tree.get_rules('nope')).toBe(false);
    });

    it('should report the root under the # type', () => {
      const tree = build({ '#': { max_children: 3 } });

      expect(tree.get_rules('#')).toEqual({ type: '#', max_children: 3, max_depth: -1, valid_children: -1 });
    });
  });

  describe('max_children — types_01', () => {
    it('should refuse a child beyond the limit', () => {
      const tree = build({ folder: { max_children: 2 }, file: {} });

      expect(tree.create_node('r1', { text: 'X' })).toBe(false);
      expect(err(tree).id).toBe('types_01');
      expect(err(tree).plugin).toBe('types');
    });

    it('should allow a reorder within the parent', () => {
      const tree = build({ folder: { max_children: 2 }, file: {} });

      expect(tree.move_node('f2', 'r1', 0)).toBe('f2');
    });

    it('should refuse a copy into a full parent', () => {
      const tree = build({ folder: { max_children: 2 }, file: {} });

      expect(tree.copy_node('f1', 'r1', 0)).toBe(false);
      expect(err(tree).id).toBe('types_01');
    });

    it('should limit the top level through the # type', () => {
      const tree = build({ '#': { max_children: 3 }, folder: {}, file: {} });

      expect(tree.create_node('#', { text: 'X' })).toBe(false);
      expect(err(tree).id).toBe('types_01');
    });
  });

  describe('valid_children — types_02', () => {
    it('should refuse a type that is not listed', () => {
      const tree = build({ folder: { valid_children: ['file'] }, file: {} });

      expect(tree.move_node('r2', 'r1', 0)).toBe(false);
      expect(err(tree).id).toBe('types_02');
    });

    it('should allow a listed type', () => {
      const tree = build({ folder: { valid_children: ['file'] }, file: {} });

      expect(tree.move_node('loose', 'r1', 0)).toBe('loose');
    });
  });

  describe('max_depth — types_03', () => {
    it('should refuse a subtree that would reach too deep', () => {
      const tree = build({ folder: { max_depth: 1 }, file: {} });

      expect(tree.move_node('r1', 'r2', 0)).toBe(false);
      expect(err(tree).id).toBe('types_03');
    });

    it('should allow a leaf at the permitted depth', () => {
      const tree = build({ folder: { max_depth: 1 }, file: {} });

      expect(tree.move_node('loose', 'r2', 0)).toBe('loose');
    });

    it('should treat -1 as unlimited', () => {
      const tree = build({ folder: { max_depth: -1 }, file: {} });

      expect(tree.move_node('r1', 'r2', 0)).toBe('r1');
    });
  });

  describe('type attributes', () => {
    it('should apply a type\'s li_attr and a_attr to its nodes', () => {
      const tree = build({
        file: { li_attr: { class: 'is-file', 'data-kind': 'file' }, a_attr: { class: 'file-anchor', title: 'A file' } },
        folder: {},
      });

      const node = tree.get_node('f1') as TreeNode;
      expect(node.li_attr['data-kind']).toBe('file');
      expect(node.a_attr.title).toBe('A file');
      expect(container.querySelector('#f1')!.classList.contains('is-file')).toBe(true);
      expect(container.querySelector('#f1 > .md-tree-anchor')!.classList.contains('file-anchor')).toBe(true);
    });

    it('should keep a node\'s own attributes, prepending the type\'s class', () => {
      const tree = build({ file: { li_attr: { class: 'is-file' }, a_attr: { title: 'from type' } }, folder: {} });

      tree.create_node('r1', {
        id: 'own',
        text: 'Own',
        type: 'file',
        li_attr: { class: 'mine' },
        a_attr: { title: 'mine' },
      } as TreeNodeData);

      const node = tree.get_node('own') as TreeNode;
      expect(node.li_attr.class).toBe('is-file mine');
      expect(node.a_attr.title).toBe('mine');
    });

    it('should never take the type\'s id', () => {
      const tree = build({ file: { li_attr: { id: 'nope' }, a_attr: { id: 'nope_anchor' } }, folder: {} });

      const node = tree.get_node('f1') as TreeNode;
      expect(node.li_attr.id).toBe('f1');
      expect(node.a_attr.id).toBe('f1_anchor');
    });
  });
});
