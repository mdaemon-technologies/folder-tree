import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * `parents` and `children_d` are derived data. They were patched by hand at
 * each mutation site and drifted: descendants kept stale ancestry after a
 * move, and `children_d` only ever held direct children.
 */
describe('Ancestry reindexing', () => {
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
    {
      id: 'p',
      text: 'P',
      children: [{ id: 'k', text: 'K', children: [{ id: 'g', text: 'G' }] }],
    },
    { id: 'other', text: 'Other' },
  ];

  const build = () => new MDFolderTree(container, { core: { data, check_callback: true } });

  describe('children_d holds deep descendants', () => {
    it('should include grandchildren after load', () => {
      const tree = build();

      expect(tree.getNode('p')!.children_d).toEqual(expect.arrayContaining(['k', 'g']));
    });

    it('should include a newly created deep node in every ancestor', () => {
      const tree = build();

      tree.createNode('g', { id: 'deep', text: 'Deep' });

      expect(tree.getNode('p')!.children_d).toContain('deep');
      expect(tree.getNode('k')!.children_d).toContain('deep');
    });

    it('should drop a deleted subtree from ancestors', () => {
      const tree = build();

      tree.deleteNode('k');

      expect(tree.getNode('p')!.children_d).not.toContain('k');
      expect(tree.getNode('p')!.children_d).not.toContain('g');
    });
  });

  describe('parents after a move', () => {
    it('should update descendants of the moved node', () => {
      const tree = build();

      tree.moveNode('k', 'other', 0);

      expect(tree.getNode('k')!.parents).toEqual(['other', '#']);
      expect(tree.getNode('g')!.parents).toEqual(['k', 'other', '#']);
    });

    it('should update descendants when promoting to the root', () => {
      const tree = build();

      tree.moveNode('k', '#', 0);

      expect(tree.getNode('g')!.parents).toEqual(['k', '#']);
    });

    it('should remove the moved subtree from the old ancestor children_d', () => {
      const tree = build();

      tree.moveNode('k', 'other', 0);

      expect(tree.getNode('p')!.children_d).not.toContain('k');
      expect(tree.getNode('p')!.children_d).not.toContain('g');
    });

    it('should add the moved subtree to the new ancestor children_d', () => {
      const tree = build();

      tree.moveNode('k', 'other', 0);

      expect(tree.getNode('other')!.children_d).toEqual(expect.arrayContaining(['k', 'g']));
    });
  });

  describe('parents after set_id', () => {
    it('should update deep descendants, not just direct children', () => {
      const tree = build();

      tree.set_id('p', 'p-renamed');

      expect(tree.getNode('k')!.parents).toEqual(['p-renamed', '#']);
      expect(tree.getNode('g')!.parents).toEqual(['k', 'p-renamed', '#']);
    });
  });

  describe('consumers of ancestry', () => {
    it('should compute get_top_selected correctly after a move', () => {
      const tree = build();

      tree.moveNode('k', 'other', 0);
      tree.selectNode('other');
      tree.selectNode('g');

      // 'g' now sits under 'other', so 'other' is the only topmost selection.
      expect(tree.get_top_selected()).toEqual(['other']);
    });

    it('should refuse an ancestor move that only stale ancestry would allow', () => {
      const tree = build();

      tree.moveNode('k', 'other', 0);

      // 'g' is a descendant of 'other' now; moving 'other' under it is a cycle.
      expect(tree.moveNode('other', 'g', 0)).toBe(false);
    });
  });
});
