import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('SortPlugin', () => {
  let container: HTMLElement;

  const unsortedData: TreeNodeData[] = [
    { id: 'banana', text: 'Banana' },
    { id: 'apple', text: 'Apple' },
    { id: 'cherry', text: 'Cherry' },
    {
      id: 'parent', text: 'Parent', children: [
        { id: 'zebra', text: 'Zebra' },
        { id: 'ant', text: 'Ant' },
        { id: 'mouse', text: 'Mouse' },
      ],
    },
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

  it('should sort root nodes alphabetically by default', () => {
    const tree = new MDFolderTree(container, {
      core: { data: unsortedData },
      plugins: ['sort'],
    });

    const rootNodes = container.querySelectorAll(':scope .md-tree-container-ul > .md-tree-node');
    const texts = Array.from(rootNodes).map((n) => n.querySelector('.md-tree-anchor')?.textContent);
    expect(texts).toEqual(['Apple', 'Banana', 'Cherry', 'Parent']);
  });

  it('should sort child nodes alphabetically by default', () => {
    const tree = new MDFolderTree(container, {
      core: { data: unsortedData },
      plugins: ['sort'],
    });

    tree.open_node('parent');
    const parent = tree.getNode('parent');
    expect(parent).not.toBeNull();

    // Children should be sorted in the data model
    const childNodes = parent!.children.map((id) => tree.getNode(id)!.text);
    expect(childNodes).toEqual(['Ant', 'Mouse', 'Zebra']);
  });

  it('should accept a custom comparator', () => {
    const tree = new MDFolderTree(container, {
      core: { data: unsortedData },
      plugins: ['sort'],
      sort: (a, b) => b.text.localeCompare(a.text), // Reverse order
    });

    const parent = tree.getNode('parent');
    const childNodes = parent!.children.map((id) => tree.getNode(id)!.text);
    expect(childNodes).toEqual(['Zebra', 'Mouse', 'Ant']);
  });

  it('should re-sort after creating a node', () => {
    const tree = new MDFolderTree(container, {
      core: { data: unsortedData, check_callback: true },
      plugins: ['sort'],
    });

    tree.createNode('parent', { id: 'dog', text: 'Dog' });

    const parent = tree.getNode('parent');
    const childNodes = parent!.children.map((id) => tree.getNode(id)!.text);
    expect(childNodes).toEqual(['Ant', 'Dog', 'Mouse', 'Zebra']);
  });

  it('should re-sort after renaming a node', () => {
    const tree = new MDFolderTree(container, {
      core: { data: unsortedData, check_callback: true },
      plugins: ['sort'],
    });

    // Rename 'Zebra' to 'Aardvark' so it should now be first
    tree.renameNode('zebra', 'Aardvark');

    const parent = tree.getNode('parent');
    const childNodes = parent!.children.map((id) => tree.getNode(id)!.text);
    expect(childNodes).toEqual(['Aardvark', 'Ant', 'Mouse']);
  });
});
