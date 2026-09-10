import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Guards against cyclic parent references, which previously caused
 * `buildParentChain` to loop until the ancestor array exceeded the maximum
 * array length (a multi-second hang followed by `RangeError`).
 */
describe('Cycle safety', () => {
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

  const nested: TreeNodeData[] = [
    { id: 'p', text: 'P', children: [{ id: 'k', text: 'K', children: [{ id: 'g', text: 'G' }] }] },
    { id: 'other', text: 'Other' },
  ];

  describe('cyclic input data', () => {
    it('should not hang or throw when flat data contains a parent cycle', () => {
      const data = [
        { id: 'x', text: 'X', parent: 'y' },
        { id: 'y', text: 'Y', parent: 'x' },
      ] as TreeNodeData[];

      expect(() => new MDFolderTree(container, { core: { data } })).not.toThrow();
    });

    it('should produce a bounded ancestor chain for cyclic data', () => {
      const data = [
        { id: 'x', text: 'X', parent: 'y' },
        { id: 'y', text: 'Y', parent: 'x' },
      ] as TreeNodeData[];

      const tree = new MDFolderTree(container, { core: { data } });

      // Each id may appear at most once, and the chain always terminates at '#'.
      const chain = tree.getNode('x')!.parents;
      expect(chain.length).toBeLessThanOrEqual(3);
      expect(new Set(chain).size).toBe(chain.length);
      expect(chain[chain.length - 1]).toBe('#');
    });

    it('should not hang when a node declares itself as its own parent', () => {
      const data = [{ id: 'self', text: 'Self', parent: 'self' }] as TreeNodeData[];

      expect(() => new MDFolderTree(container, { core: { data } })).not.toThrow();
    });
  });

  describe('moveNode cycle prevention', () => {
    it('should refuse to move a node into itself', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      expect(tree.moveNode('k', 'k', 0)).toBe(false);
    });

    it('should refuse to move a node into its own child', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      expect(tree.moveNode('p', 'k', 0)).toBe(false);
    });

    it('should refuse to move a node into a deeper descendant', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      expect(tree.moveNode('p', 'g', 0)).toBe(false);
    });

    it('should leave the tree unchanged after a refused move', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      tree.moveNode('p', 'g', 0);

      expect(tree.getNode('p')!.parent).toBe('#');
      expect(tree.getNode('p')!.children).toEqual(['k']);
      expect(tree.getNode('k')!.children).toEqual(['g']);
      expect(tree.getNode('g')!.parents).toEqual(['k', 'p', '#']);
    });

    it('should record a refused move in last_error()', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      tree.moveNode('p', 'k', 0);

      expect(tree.last_error()).toMatchObject({ error: 'cycle', operation: 'move_node', id: 'p' });
    });

    it('should still allow a legitimate move to an unrelated parent', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      expect(tree.moveNode('k', 'other', 0)).toBe(true);
      expect(tree.getNode('k')!.parent).toBe('other');
    });
  });

  describe('copyNode', () => {
    // A copy always receives a fresh id, so placing one inside the source
    // subtree is legal and cannot create a cycle.
    it('should allow copying a node into its own descendant', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      const newId = tree.copyNode('p', 'k', 0);

      expect(newId).not.toBe(false);
      expect(tree.getNode(newId as string)!.parent).toBe('k');
    });
  });
});
