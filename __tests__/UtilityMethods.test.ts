import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Additional Utility Methods', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'parent',
      text: 'Parent',
      state: { opened: true },
      children: [
        { id: 'child-1', text: 'Child 1' },
        { id: 'child-2', text: 'Child 2' },
      ],
    },
    { id: 'solo', text: 'Solo' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, { core: { data: sampleData, check_callback: true } });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  describe('get_children_dom', () => {
    test('returns child DOM elements of a node', () => {
      const children = tree.get_children_dom('parent');
      expect(children.length).toBe(2);
      expect(children[0].id).toBe('child-1');
      expect(children[1].id).toBe('child-2');
    });

    test('returns empty array for leaf node', () => {
      const children = tree.get_children_dom('solo');
      expect(children.length).toBe(0);
    });

    test('returns root nodes when id is #', () => {
      const children = tree.get_children_dom('#');
      expect(children.length).toBe(2);
    });
  });

  describe('is_loading', () => {
    test('returns false for a loaded node', () => {
      expect(tree.is_loading('parent')).toBe(false);
    });

    test('returns false for unknown node', () => {
      expect(tree.is_loading('nonexistent')).toBe(false);
    });
  });

  describe('last_error', () => {
    test('returns null when no error has occurred', () => {
      expect(tree.last_error()).toBeNull();
    });

    test('returns error details after a failed operation', () => {
      const errTree = new MDFolderTree(document.createElement('div'), {
        core: { data: sampleData, check_callback: false },
      });
      errTree.move_node('child-1', 'solo', 0);
      const err = errTree.last_error() as any;
      expect(err).not.toBeNull();
      expect(err.error).toBe('check_callback');
      expect(err.operation).toBe('move_node');
      errTree.destroy();
    });

    test('core.error callback is invoked on failure', () => {
      const errorCb = jest.fn();
      const div = document.createElement('div');
      document.body.appendChild(div);
      const errTree = new MDFolderTree(div, {
        core: { data: sampleData, check_callback: false, error: errorCb },
      });
      errTree.delete_node('child-1');
      expect(errorCb).toHaveBeenCalled();
      expect(errorCb.mock.calls[0][0].operation).toBe('delete_node');
      errTree.destroy();
      document.body.removeChild(div);
    });
  });
});
