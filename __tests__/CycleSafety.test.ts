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

      expect(tree.last_error()).toMatchObject({
        error: 'check',
        plugin: 'core',
        id: 'core_01',
        reason: 'Moving parent inside child',
      });
    });

    it('should still allow a legitimate move to an unrelated parent', () => {
      const tree = new MDFolderTree(container, { core: { data: nested, check_callback: true } });

      expect(tree.moveNode('k', 'other', 0)).toBe(true);
      expect(tree.getNode('k')!.parent).toBe('other');
    });
  });

  describe('copyNode', () => {
    // jstree refuses copying a node into itself or its own descendant (check()
    // error core_01), even though the copy itself would get fresh ids.
    it('should refuse copying a node into its own descendant, as jstree does', () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      expect(tree.copyNode('p', 'k', 0)).toBe(false);
      expect(tree.getNode('k')!.children).toEqual(['g']);
    });
  });
});
