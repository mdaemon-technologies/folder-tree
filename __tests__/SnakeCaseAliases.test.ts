import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Snake_case CRUD Aliases', () => {
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
    { id: 'other', text: 'Other' },
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

  test('get_container returns the container element', () => {
    expect(tree.get_container()).toBe(container);
  });

  test('move_node moves a node to another parent', () => {
    const result = tree.move_node('child-1', 'other', 0);
    expect(result).toBe(true);
    const node = tree.get_node('child-1');
    expect(node).not.toBeNull();
    if (node && 'parent' in node) {
      expect((node as any).parent).toBe('other');
    }
  });

  test('copy_node copies a node', () => {
    const newId = tree.copy_node('child-1', 'other', 0);
    expect(newId).not.toBe(false);
    expect(typeof newId).toBe('string');
  });

  test('create_node creates a node', () => {
    const result = tree.create_node('parent', { id: 'new-1', text: 'New Node' });
    expect(result).not.toBe(false);
    expect(tree.get_node('new-1')).not.toBeNull();
  });

  test('rename_node renames a node', () => {
    const result = tree.rename_node('child-1', 'Renamed');
    expect(result).toBe(true);
    expect(tree.get_text('child-1')).toBe('Renamed');
  });

  test('delete_node deletes a node', () => {
    const result = tree.delete_node('child-2');
    expect(result).toBe(true);
    expect(tree.get_node('child-2')).toBeNull();
  });
});
