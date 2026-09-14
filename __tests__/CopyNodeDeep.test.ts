import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * `copyNode` previously produced a childless copy that shared its `li_attr`,
 * `a_attr` and `original` objects with the source node.
 */
describe('copyNode deep copy', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  const data: TreeNodeData[] = [
    {
      id: 'src',
      text: 'Source',
      type: 'folder',
      icon: 'src-icon',
      li_attr: { 'data-tag': 'original' },
      a_attr: { title: 'Source node' },
      children: [
        { id: 'child', text: 'Child', children: [{ id: 'grandchild', text: 'Grandchild' }] },
        { id: 'sibling', text: 'Sibling' },
      ],
    },
    { id: 'dest', text: 'Destination' },
  ];

  const build = () => new MDFolderTree(container, { core: { data, check_callback: true } });

  describe('subtree structure', () => {
    it('should copy descendants rather than producing a childless node', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(tree.getNode(newId)!.children).toHaveLength(2);
    });

    it('should copy the full depth of the subtree', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;
      const copiedChildId = tree.getNode(newId)!.children[0];
      const copiedGrandchildId = tree.getNode(copiedChildId)!.children[0];

      expect(tree.getNode(copiedGrandchildId)!.text).toBe('Grandchild');
    });

    it('should give every copied descendant a fresh id', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;
      const copiedChildId = tree.getNode(newId)!.children[0];
      const copiedGrandchildId = tree.getNode(copiedChildId)!.children[0];

      expect(newId).not.toBe('src');
      expect(copiedChildId).not.toBe('child');
      expect(copiedGrandchildId).not.toBe('grandchild');
      // Originals must survive untouched.
      expect(tree.getNode('child')!.parent).toBe('src');
      expect(tree.getNode('grandchild')!.parent).toBe('child');
    });

    it('should register every copied descendant in the store', () => {
      const tree = build();
      const before = tree.getAllNodes().length;

      tree.copyNode('src', 'dest', 0);

      // src + child + grandchild + sibling
      expect(tree.getAllNodes().length).toBe(before + 4);
    });

    it('should set parent and parents on copied descendants', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;
      const copiedChildId = tree.getNode(newId)!.children[0];
      const copiedGrandchildId = tree.getNode(copiedChildId)!.children[0];

      expect(tree.getNode(newId)!.parent).toBe('dest');
      expect(tree.getNode(copiedChildId)!.parent).toBe(newId);
      expect(tree.getNode(copiedGrandchildId)!.parents).toEqual([copiedChildId, newId, 'dest', '#']);
    });

    it('should record deep descendants in children_d of the copied subtree', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;
      const copiedChildId = tree.getNode(newId)!.children[0];
      const copiedGrandchildId = tree.getNode(copiedChildId)!.children[0];

      expect(tree.getNode(newId)!.children_d).toEqual(
        expect.arrayContaining([copiedChildId, copiedGrandchildId]),
      );
    });

    it('should preserve text, type and icon of copied nodes', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(tree.getNode(newId)!.text).toBe('Source');
      expect(tree.getNode(newId)!.type).toBe('folder');
      expect(tree.getNode(newId)!.icon).toBe('src-icon');
    });
  });

  describe('detachment from the source', () => {
    it('should not share the li_attr object with the source', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(tree.getNode(newId)!.li_attr).not.toBe(tree.getNode('src')!.li_attr);
      // As in jstree, the copy's li_attr.id is its own id.
      expect(tree.getNode(newId)!.li_attr).toEqual({ 'data-tag': 'original', id: newId });
    });

    it('should not share the a_attr or state objects with the source', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(tree.getNode(newId)!.a_attr).not.toBe(tree.getNode('src')!.a_attr);
      expect(tree.getNode(newId)!.state).not.toBe(tree.getNode('src')!.state);
    });

    it('should isolate the source from mutations of the copy', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;
      tree.getNode(newId)!.li_attr['data-tag'] = 'mutated';

      expect(tree.getNode('src')!.li_attr['data-tag']).toBe('original');
    });

    it('should not share the original data object with the source', () => {
      const tree = build();

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(tree.getNode(newId)!.original).not.toBe(tree.getNode('src')!.original);
    });
  });

  describe('state of copies', () => {
    it('should create copies that are neither selected nor checked', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            { id: 'src', text: 'Source', state: { selected: true, checked: true } },
            { id: 'dest', text: 'Destination' },
          ],
          check_callback: true,
        },
        plugins: ['checkbox'],
      });

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(tree.getNode(newId)!.state.selected).toBe(false);
      expect(tree.getNode(newId)!.state.checked).toBe(false);
      expect(tree.get_selected()).not.toContain(newId);
    });
  });

  describe('events', () => {
    it('should emit copy_node once for the subtree root', () => {
      const tree = build();
      const seen: string[] = [];
      tree.on('copy_node.MDFolderTree', (e) => {
        seen.push((e.detail as { node: { id: string } }).node.id);
      });

      const newId = tree.copyNode('src', 'dest', 0) as string;

      expect(seen).toEqual([newId]);
    });
  });
});
