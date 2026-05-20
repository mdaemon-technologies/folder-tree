import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Flat array with parent references (jstree-style)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-tree';
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  const flatData: TreeNodeData[] = [
    { id: 'root-1', text: 'Root 1', parent: '#' },
    { id: 'root-2', text: 'Root 2', parent: '#' },
    { id: 'child-1', text: 'Child 1', parent: 'root-1' },
    { id: 'child-2', text: 'Child 2', parent: 'root-1' },
    { id: 'grandchild-1', text: 'Grandchild 1', parent: 'child-1' },
  ];

  it('should build tree from flat array with parent references', () => {
    const tree = new MDFolderTree(container, {
      core: { data: flatData },
    });

    const root1 = tree.get_node('root-1');
    expect(root1).toBeTruthy();
    expect(root1!.parent).toBe('#');
    expect(root1!.children).toContain('child-1');
    expect(root1!.children).toContain('child-2');
  });

  it('should set correct parent on child nodes', () => {
    const tree = new MDFolderTree(container, {
      core: { data: flatData },
    });

    const child1 = tree.get_node('child-1');
    expect(child1).toBeTruthy();
    expect(child1!.parent).toBe('root-1');
  });

  it('should build parent chain correctly', () => {
    const tree = new MDFolderTree(container, {
      core: { data: flatData },
    });

    const grandchild = tree.get_node('grandchild-1');
    expect(grandchild).toBeTruthy();
    expect(grandchild!.parent).toBe('child-1');
    expect(grandchild!.parents).toContain('child-1');
    expect(grandchild!.parents).toContain('root-1');
    expect(grandchild!.parents).toContain('#');
  });

  it('should wire up children_d on parent nodes', () => {
    const tree = new MDFolderTree(container, {
      core: { data: flatData },
    });

    const root1 = tree.get_node('root-1');
    expect(root1!.children_d).toContain('child-1');
    expect(root1!.children_d).toContain('child-2');

    const child1 = tree.get_node('child-1');
    expect(child1!.children_d).toContain('grandchild-1');
  });

  it('should handle multiple root nodes', () => {
    const tree = new MDFolderTree(container, {
      core: { data: flatData },
    });

    const root2 = tree.get_node('root-2');
    expect(root2).toBeTruthy();
    expect(root2!.parent).toBe('#');
    expect(root2!.children).toHaveLength(0);
  });

  it('should handle selection on flat array nodes', () => {
    const selectedData: TreeNodeData[] = [
      { id: 'r1', text: 'Root', parent: '#' },
      { id: 'c1', text: 'Child', parent: 'r1', state: { selected: true } },
    ];

    const tree = new MDFolderTree(container, {
      core: { data: selectedData },
    });

    const selected = tree.get_selected();
    expect(selected).toContain('c1');
  });

  it('should preserve node types from flat array', () => {
    const typedData: TreeNodeData[] = [
      { id: 'f1', text: 'Folder', parent: '#', type: 'folder' },
      { id: 'd1', text: 'Document', parent: 'f1', type: 'document' },
    ];

    const tree = new MDFolderTree(container, {
      core: { data: typedData },
    });

    const folder = tree.get_node('f1');
    const doc = tree.get_node('d1');
    expect(folder!.type).toBe('folder');
    expect(doc!.type).toBe('document');
  });

  it('should still support nested children arrays', () => {
    const nestedData: TreeNodeData[] = [
      {
        id: 'n1',
        text: 'Parent',
        children: [{ id: 'n2', text: 'Child' }],
      },
    ];

    const tree = new MDFolderTree(container, {
      core: { data: nestedData },
    });

    const parent = tree.get_node('n1');
    expect(parent!.children).toContain('n2');

    const child = tree.get_node('n2');
    expect(child!.parent).toBe('n1');
  });

  it('should handle flat array where all nodes have parent=#', () => {
    const allRoots: TreeNodeData[] = [
      { id: 'a', text: 'A', parent: '#' },
      { id: 'b', text: 'B', parent: '#' },
      { id: 'c', text: 'C', parent: '#' },
    ];

    const tree = new MDFolderTree(container, {
      core: { data: allRoots },
    });

    expect(tree.get_node('a')!.parent).toBe('#');
    expect(tree.get_node('b')!.parent).toBe('#');
    expect(tree.get_node('c')!.parent).toBe('#');
  });

  it('should handle nodes listed before their parent in the array', () => {
    const outOfOrder: TreeNodeData[] = [
      { id: 'leaf', text: 'Leaf', parent: 'mid' },
      { id: 'mid', text: 'Middle', parent: 'top' },
      { id: 'top', text: 'Top', parent: '#' },
    ];

    const tree = new MDFolderTree(container, {
      core: { data: outOfOrder },
    });

    const top = tree.get_node('top');
    expect(top!.children).toContain('mid');

    const mid = tree.get_node('mid');
    expect(mid!.children).toContain('leaf');
    expect(mid!.parent).toBe('top');

    const leaf = tree.get_node('leaf');
    expect(leaf!.parent).toBe('mid');
    expect(leaf!.parents).toContain('mid');
    expect(leaf!.parents).toContain('top');
    expect(leaf!.parents).toContain('#');
  });
});
