import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('MDFolderTree - Core Operations', () => {
  let container: HTMLElement;

  const sampleData: TreeNodeData[] = [
    {
      id: 'folder-1', text: 'Folder 1', children: [
        { id: 'file-a', text: 'File A' },
        { id: 'file-b', text: 'File B' },
      ],
    },
    {
      id: 'folder-2', text: 'Folder 2', children: [
        { id: 'file-c', text: 'File C' },
      ],
    },
    { id: 'file-d', text: 'File D' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  describe('moveNode', () => {
    it('should move a node to a new parent', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      const result = tree.moveNode('file-a', 'folder-2', 0);
      expect(result).toBe(true);

      const movedNode = tree.getNode('file-a');
      expect(movedNode!.parent).toBe('folder-2');

      const oldParent = tree.getNode('folder-1');
      expect(oldParent!.children).not.toContain('file-a');

      const newParent = tree.getNode('folder-2');
      expect(newParent!.children).toContain('file-a');
    });

    it('should fail when check_callback is false', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: false },
      });

      const result = tree.moveNode('file-a', 'folder-2', 0);
      expect(result).toBe(false);
    });

    it('should emit move_node event', (done) => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      container.addEventListener('move_node.MDFolderTree', ((e: CustomEvent) => {
        expect(e.detail.node.id).toBe('file-a');
        expect(e.detail.parent).toBe('folder-2');
        done();
      }) as EventListener);

      tree.moveNode('file-a', 'folder-2', 0);
    });

    it('should respect position parameter', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      tree.moveNode('file-d', 'folder-1', 1); // Insert at position 1

      const parent = tree.getNode('folder-1');
      expect(parent!.children[1]).toBe('file-d');
    });
  });

  describe('copyNode', () => {
    it('should create a copy in the target parent', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      const newId = tree.copyNode('file-a', 'folder-2', 0);
      expect(newId).not.toBe(false);

      // Original should still exist in folder-1
      const original = tree.getNode('file-a');
      expect(original!.parent).toBe('folder-1');

      // Copy should be in folder-2
      const copy = tree.getNode(newId as string);
      expect(copy).not.toBeNull();
      expect(copy!.parent).toBe('folder-2');
      expect(copy!.text).toBe('File A');
    });

    it('should emit copy_node event', (done) => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      container.addEventListener('copy_node.MDFolderTree', ((e: CustomEvent) => {
        expect(e.detail.original.id).toBe('file-a');
        expect(e.detail.parent).toBe('folder-2');
        done();
      }) as EventListener);

      tree.copyNode('file-a', 'folder-2', 0);
    });
  });

  describe('deleteNode', () => {
    it('should remove a node and its descendants', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      const result = tree.deleteNode('folder-1');
      expect(result).toBe(true);

      expect(tree.getNode('folder-1')).toBeNull();
      expect(tree.getNode('file-a')).toBeNull();
      expect(tree.getNode('file-b')).toBeNull();
    });

    it('should remove from parent children array', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      tree.deleteNode('file-a');

      const parent = tree.getNode('folder-1');
      expect(parent!.children).not.toContain('file-a');
    });

    it('should emit delete_node event', (done) => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      container.addEventListener('delete_node.MDFolderTree', ((e: CustomEvent) => {
        expect(e.detail.node.id).toBe('file-d');
        done();
      }) as EventListener);

      tree.deleteNode('file-d');
    });

    it('should deselect deleted nodes', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      tree.select_node('file-a');
      expect(tree.get_selected()).toContain('file-a');

      tree.deleteNode('file-a');
      expect(tree.get_selected()).not.toContain('file-a');
    });
  });

  describe('createNode', () => {
    it('should create a new node under a parent', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      const result = tree.createNode('folder-2', { id: 'new-file', text: 'New File' });
      expect(result).not.toBe(false);

      const newNode = tree.getNode('new-file');
      expect(newNode).not.toBeNull();
      expect(newNode!.text).toBe('New File');
      expect(newNode!.parent).toBe('folder-2');

      const parent = tree.getNode('folder-2');
      expect(parent!.children).toContain('new-file');
    });

    it('should place node at specified position', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      tree.createNode('folder-1', { id: 'inserted', text: 'Inserted' }, 1);

      const parent = tree.getNode('folder-1');
      expect(parent!.children[1]).toBe('inserted');
    });

    it('should emit create_node event', (done) => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      container.addEventListener('create_node.MDFolderTree', ((e: CustomEvent) => {
        expect(e.detail.node.id).toBe('created');
        expect(e.detail.parent).toBe('folder-1');
        done();
      }) as EventListener);

      tree.createNode('folder-1', { id: 'created', text: 'Created Node' });
    });

    it('should generate an ID if none provided', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      const result = tree.createNode('folder-1', { id: '', text: 'Auto ID' });
      expect(result).not.toBe(false);
      expect((result as any).id).toMatch(/^new_/);
    });
  });

  describe('renameNode', () => {
    it('should rename a node', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      const result = tree.renameNode('file-a', 'Renamed File');
      expect(result).toBe(true);

      const node = tree.getNode('file-a');
      expect(node!.text).toBe('Renamed File');
    });

    it('should emit rename_node event with old text', (done) => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: true },
      });

      container.addEventListener('rename_node.MDFolderTree', ((e: CustomEvent) => {
        expect(e.detail.node.id).toBe('file-a');
        expect(e.detail.text).toBe('New Name');
        expect(e.detail.old).toBe('File A');
        done();
      }) as EventListener);

      tree.renameNode('file-a', 'New Name');
    });
  });

  describe('getAllNodes', () => {
    it('should return all nodes in the tree', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      const all = tree.getAllNodes();
      expect(all.length).toBe(6); // folder-1, file-a, file-b, folder-2, file-c, file-d
    });
  });

  describe('getNodeChildren', () => {
    it('should return direct children of a node', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      const children = tree.getNodeChildren('folder-1');
      expect(children.length).toBe(2);
      expect(children.map((c) => c.id)).toEqual(['file-a', 'file-b']);
    });

    it('should return empty for leaf nodes', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      const children = tree.getNodeChildren('file-d');
      expect(children).toEqual([]);
    });
  });

  describe('getOpenedIds', () => {
    it('should return IDs of opened nodes', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      tree.open_node('folder-1');
      tree.open_node('folder-2');

      const opened = tree.getOpenedIds();
      expect(opened).toContain('folder-1');
      expect(opened).toContain('folder-2');
    });
  });

  describe('reorderChildren', () => {
    it('should reorder children of a node', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
      });

      tree.reorderChildren('folder-1', ['file-b', 'file-a']);

      const parent = tree.getNode('folder-1');
      expect(parent!.children).toEqual(['file-b', 'file-a']);
    });
  });

  describe('check_callback', () => {
    it('should call custom check_callback function', () => {
      const checkFn = jest.fn().mockReturnValue(true);
      const tree = new MDFolderTree(container, {
        core: { data: sampleData, check_callback: checkFn },
      });

      tree.moveNode('file-a', 'folder-2', 0);
      expect(checkFn).toHaveBeenCalledWith('move_node', expect.anything(), expect.anything(), 0, {});
    });

    it('should block operation when check_callback returns false', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: sampleData,
          check_callback: (op) => op !== 'delete_node',
        },
      });

      const moveResult = tree.moveNode('file-a', 'folder-2', 0);
      expect(moveResult).toBe(true);

      const deleteResult = tree.deleteNode('file-d');
      expect(deleteResult).toBe(false);
      expect(tree.getNode('file-d')).not.toBeNull();
    });
  });
});
