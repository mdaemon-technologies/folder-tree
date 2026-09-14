import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Root-level nodes previously had no ordered container: `store.get('#')`
 * returns null, so inserts against the root parent were skipped while
 * `moveNode` still reported success.
 */
describe('Root ordering', () => {
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
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C', children: [{ id: 'c1', text: 'C1' }] },
  ];

  const build = () => new MDFolderTree(container, { core: { data, check_callback: true } });
  const domOrder = () =>
    Array.from(container.querySelectorAll('.md-tree-container-ul > .md-tree-node')).map((el) => el.id);

  describe('moveNode against the root', () => {
    it('should reorder a root node to the front', () => {
      const tree = build();

      expect(tree.moveNode('c', '#', 0)).toBe(true);
      expect(tree.getRootNodeIds()).toEqual(['c', 'a', 'b']);
    });

    it('should reorder a root node to the middle', () => {
      const tree = build();

      tree.moveNode('c', '#', 1);

      expect(tree.getRootNodeIds()).toEqual(['a', 'c', 'b']);
    });

    it('should reflect the new root order in the DOM', () => {
      const tree = build();

      tree.moveNode('c', '#', 0);

      expect(domOrder()).toEqual(['c', 'a', 'b']);
    });

    it('should preserve root order across a redraw', () => {
      const tree = build();

      tree.moveNode('c', '#', 0);
      tree.redraw();

      expect(domOrder()).toEqual(['c', 'a', 'b']);
    });

    it('should promote a nested node to the root at a given position', () => {
      const tree = build();

      expect(tree.moveNode('c1', '#', 1)).toBe(true);
      expect(tree.getRootNodeIds()).toEqual(['a', 'c1', 'b', 'c']);
      expect(tree.getNode('c1')!.parent).toBe('#');
      expect(tree.getNode('c')!.children).toEqual([]);
    });

    it('should move a root node into a regular parent', () => {
      const tree = build();

      expect(tree.moveNode('a', 'c', 0)).toBe(true);
      expect(tree.getRootNodeIds()).toEqual(['b', 'c']);
      expect(tree.getNode('c')!.children).toEqual(['a', 'c1']);
    });

    it('should refuse a move to a parent that does not exist', () => {
      const tree = build();

      expect(tree.moveNode('a', 'no-such-parent', 0)).toBe(false);
      expect(tree.getNode('a')!.parent).toBe('#');
      expect(tree.getRootNodeIds()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('createNode against the root', () => {
    it('should insert a new root node at the requested position', () => {
      const tree = build();

      tree.createNode('#', { id: 'fresh', text: 'Fresh' }, 1);

      expect(tree.getRootNodeIds()).toEqual(['a', 'fresh', 'b', 'c']);
    });

    it('should append a new root node when no position is given', () => {
      const tree = build();

      tree.createNode('#', { id: 'fresh', text: 'Fresh' });

      expect(tree.getRootNodeIds()).toEqual(['a', 'b', 'c', 'fresh']);
    });
  });

  describe('deleteNode against the root', () => {
    it('should remove a deleted root node from the root order', () => {
      const tree = build();

      tree.deleteNode('b');

      expect(tree.getRootNodeIds()).toEqual(['a', 'c']);
      expect(domOrder()).toEqual(['a', 'c']);
    });
  });

  describe('reorderChildren against the root', () => {
    it('should apply an explicit root ordering', () => {
      const tree = build();

      tree.reorderChildren('#', ['c', 'b', 'a']);

      expect(tree.getRootNodeIds()).toEqual(['c', 'b', 'a']);
      expect(domOrder()).toEqual(['c', 'b', 'a']);
    });
  });

  describe('root order after refresh', () => {
    it('should rebuild root order from the source data', () => {
      const tree = build();

      tree.moveNode('c', '#', 0);
      tree.refresh();

      expect(tree.getRootNodeIds()).toEqual(['a', 'b', 'c']);
    });
  });
});

describe('Root ordering — copyNode', () => {
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
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ];

  it('should place a copy made at the root into the root order', () => {
    const tree = new MDFolderTree(container, { core: { data, check_callback: true } });

    const newId = tree.copyNode('a', '#', 0) as string;

    expect(newId).not.toBe(false);
    expect(tree.getRootNodeIds()).toEqual([newId, 'a', 'b']);
  });

  it('should render a copy made at the root', () => {
    const tree = new MDFolderTree(container, { core: { data, check_callback: true } });

    const newId = tree.copyNode('a', '#', 1) as string;

    const rendered = Array.from(
      container.querySelectorAll('.md-tree-container-ul > .md-tree-node'),
    ).map((el) => el.id);
    expect(rendered).toEqual(['a', newId, 'b']);
  });
});

describe('moveNode validation order', () => {
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

  it('should not invoke check_callback for a move to a missing parent', () => {
    const calls: string[] = [];
    const tree = new MDFolderTree(container, {
      core: {
        data: [{ id: 'a', text: 'A' }],
        check_callback: (operation) => {
          calls.push(operation);
          return true;
        },
      },
    });

    expect(tree.moveNode('a', 'no-such-parent', 0)).toBe(false);
    expect(calls).toEqual([]);
  });
});
