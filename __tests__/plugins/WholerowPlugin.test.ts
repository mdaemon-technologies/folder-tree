import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('WholerowPlugin', () => {
  let container: HTMLElement;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Node 1', children: [{ id: 'n1-1', text: 'Child 1' }] },
    { id: 'n2', text: 'Node 2' },
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

  it('should add md-tree-wholerow-ul class to container', () => {
    new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['wholerow'],
    });

    expect(container.classList.contains('md-tree-wholerow-ul')).toBe(true);
  });

  it('should insert wholerow div into each node', () => {
    new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['wholerow'],
    });

    const nodes = container.querySelectorAll('.md-tree-node');
    nodes.forEach((node) => {
      const wholerow = node.querySelector(':scope > .md-tree-wholerow');
      expect(wholerow).not.toBeNull();
    });
  });

  it('should not duplicate wholerow divs on re-render', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['wholerow'],
    });

    // Trigger re-render
    tree.open_node('n1');
    tree.close_node('n1');

    const node1 = container.querySelector('#n1');
    const wholerows = node1?.querySelectorAll(':scope > .md-tree-wholerow');
    expect(wholerows?.length).toBe(1);
  });

  it('should remove class on destroy', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['wholerow'],
    });

    tree.destroy();
    expect(container.classList.contains('md-tree-wholerow-ul')).toBe(false);
  });
});
