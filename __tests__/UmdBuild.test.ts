import { MDFolderTree, mdTree } from '../src/umd';
import type { TreeNodeData } from '../src/types';

describe('UMD entry point', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'umd-test-tree';
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  const sampleData: TreeNodeData[] = [
    {
      id: 'umd-1',
      text: 'Folder A',
      type: 'folder',
      children: [
        { id: 'umd-1-1', text: 'File 1', type: 'file' },
        { id: 'umd-1-2', text: 'File 2', type: 'file' },
      ],
    },
    {
      id: 'umd-2',
      text: 'Folder B',
      type: 'folder',
    },
  ];

  describe('MDFolderTree export', () => {
    it('should be exported and constructible', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      expect(tree).toBeDefined();
      expect(container.classList.contains('md-tree')).toBe(true);
    });

    it('should render nodes from JSON data', () => {
      new MDFolderTree(container, {
        core: { data: sampleData },
      });

      expect(container.querySelector('#umd-1')).not.toBeNull();
      expect(container.querySelector('#umd-2')).not.toBeNull();
    });

    it('should support getInstance lookup', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      expect(MDFolderTree.getInstance(container)).toBe(tree);
    });
  });

  describe('mdTree bridge export', () => {
    it('should be exported as a function', () => {
      expect(typeof mdTree).toBe('function');
    });

    it('should create a tree instance via the bridge', () => {
      const instance = mdTree(container, {
        core: { data: sampleData },
      });

      expect(instance).toBeDefined();
      expect(container.classList.contains('md-tree')).toBe(true);
    });

    it('should return the same API surface as direct construction', () => {
      const instance = mdTree(container, {
        core: { data: sampleData },
      });

      // Verify key API methods are present
      expect(typeof instance.get_node).toBe('function');
      expect(typeof instance.open_node).toBe('function');
      expect(typeof instance.close_node).toBe('function');
      expect(typeof instance.select_node).toBe('function');
      expect(typeof instance.deselect_node).toBe('function');
      expect(typeof instance.destroy).toBe('function');
    });
  });

  describe('UMD parity with main exports', () => {
    it('should open and close nodes', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      tree.open_node('umd-1');
      expect(tree.get_node('umd-1')!.state.opened).toBe(true);

      tree.close_node('umd-1');
      expect(tree.get_node('umd-1')!.state.opened).toBe(false);
    });

    it('should select and deselect nodes', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      tree.select_node('umd-2');
      expect(tree.get_selected()).toContain('umd-2');

      tree.deselect_node('umd-2');
      expect(tree.get_selected()).not.toContain('umd-2');
    });

    it('should get_node by id', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      const node = tree.get_node('umd-1');
      expect(node).toBeDefined();
      expect(node?.text).toBe('Folder A');
    });

    it('should destroy cleanly', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      tree.destroy();
      expect(MDFolderTree.getInstance(container)).toBeNull();
      expect(container.classList.contains('md-tree')).toBe(false);
    });
  });
});
