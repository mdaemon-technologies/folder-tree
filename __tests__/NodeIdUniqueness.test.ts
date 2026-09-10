import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Node ids are the store's primary key and are used for DOM lookups, so a
 * collision previously replaced an existing node and orphaned its subtree.
 */
describe('Node id uniqueness', () => {
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

  describe('input data', () => {
    it('should keep the first node when input contains duplicate ids', () => {
      const data: TreeNodeData[] = [
        { id: 'dup', text: 'One' },
        { id: 'dup', text: 'Two' },
      ];

      const tree = new MDFolderTree(container, { core: { data } });

      expect(tree.getAllNodes()).toHaveLength(1);
      expect(tree.getNode('dup')!.text).toBe('One');
    });

    it('should report an error for a duplicate id in input data', () => {
      const errors: unknown[] = [];
      const data: TreeNodeData[] = [
        { id: 'dup', text: 'One' },
        { id: 'dup', text: 'Two' },
      ];

      new MDFolderTree(container, { core: { data, error: (e) => errors.push(e) } });

      expect(errors).toContainEqual(expect.objectContaining({ error: 'duplicate_id', id: 'dup' }));
    });

    it('should not attach a rejected duplicate to its parent', () => {
      const data: TreeNodeData[] = [
        { id: 'a', text: 'A', children: [{ id: 'shared', text: 'From A' }] },
        { id: 'b', text: 'B', children: [{ id: 'shared', text: 'From B' }] },
      ];

      const tree = new MDFolderTree(container, { core: { data } });

      expect(tree.getNode('a')!.children).toEqual(['shared']);
      expect(tree.getNode('b')!.children).toEqual([]);
      expect(tree.getNode('shared')!.parent).toBe('a');
    });
  });

  describe('createNode', () => {
    const base: TreeNodeData[] = [
      { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1' }] },
      { id: 'b', text: 'B' },
    ];

    it('should refuse to create a node with an existing id', () => {
      const tree = new MDFolderTree(container, { core: { data: base } });

      expect(tree.createNode('b', { id: 'a', text: 'Hijacked' })).toBe(false);
    });

    it('should leave the existing node intact when a duplicate create is refused', () => {
      const tree = new MDFolderTree(container, { core: { data: base } });

      tree.createNode('b', { id: 'a', text: 'Hijacked' });

      expect(tree.getNode('a')!.text).toBe('A');
      expect(tree.getNode('a')!.children).toEqual(['a1']);
      expect(tree.getNode('a')!.parent).toBe('#');
      expect(tree.getNode('b')!.children).toEqual([]);
    });

    it('should report an error when refusing a duplicate create', () => {
      const errors: unknown[] = [];
      const tree = new MDFolderTree(container, { core: { data: base, error: (e) => errors.push(e) } });

      tree.createNode('b', { id: 'a', text: 'Hijacked' });

      expect(errors).toContainEqual(
        expect.objectContaining({ error: 'duplicate_id', operation: 'create_node', id: 'a' }),
      );
      expect(tree.last_error()).toMatchObject({ error: 'duplicate_id' });
    });

    it('should generate distinct ids for successive nodes created without one', () => {
      const tree = new MDFolderTree(container, { core: { data: base } });

      const first = tree.createNode('b', { text: 'First' } as TreeNodeData);
      const second = tree.createNode('b', { text: 'Second' } as TreeNodeData);

      expect(first).not.toBe(false);
      expect(second).not.toBe(false);
      expect((first as { id: string }).id).not.toBe((second as { id: string }).id);
      expect(tree.getNode('b')!.children).toHaveLength(2);
    });

    it('should not generate an id that collides with an existing node', () => {
      const tree = new MDFolderTree(container, { core: { data: base } });

      // Occupy the id the generator would otherwise mint first.
      tree.createNode('b', { id: 'new_1', text: 'Squatter' });
      const generated = tree.createNode('b', { text: 'Generated' } as TreeNodeData);

      expect(generated).not.toBe(false);
      expect((generated as { id: string }).id).not.toBe('new_1');
      expect(tree.getNode('new_1')!.text).toBe('Squatter');
    });
  });

  describe('copyNode', () => {
    it('should generate distinct ids for successive copies of the same node', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'src', text: 'Source' }, { id: 'dest', text: 'Dest' }] },
      });

      const first = tree.copyNode('src', 'dest', 0);
      const second = tree.copyNode('src', 'dest', 0);

      expect(first).not.toBe(false);
      expect(second).not.toBe(false);
      expect(first).not.toBe(second);
      expect(tree.getNode('dest')!.children).toHaveLength(2);
    });
  });
});
