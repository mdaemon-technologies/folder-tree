import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('ConditionalSelectPlugin', () => {
  let container: HTMLElement;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Selectable' },
    { id: 'n2', text: 'Not Selectable' },
    { id: 'n3', text: 'Selectable Too' },
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

  it('should allow selection when callback returns true', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['conditionalselect'],
      conditionalselect: () => true,
    });

    tree.select_node('n1');
    expect(tree.get_selected()).toContain('n1');
  });

  it('should prevent selection when callback returns false for all', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['conditionalselect'],
      conditionalselect: () => false,
    });

    // Direct API call still works (conditionalselect only blocks UI activation)
    // Simulate click on anchor to test the hook
    const anchor = container.querySelector('#n2 .md-tree-anchor') as HTMLElement;
    if (anchor) {
      anchor.click();
    }
    expect(tree.get_selected()).not.toContain('n2');
  });

  it('should conditionally block based on node properties', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['conditionalselect'],
      conditionalselect: (node) => node.text !== 'Not Selectable',
    });

    // Simulate click on selectable node
    const anchor1 = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    if (anchor1) anchor1.click();
    expect(tree.get_selected()).toContain('n1');

    // Simulate click on non-selectable node
    const anchor2 = container.querySelector('#n2 .md-tree-anchor') as HTMLElement;
    if (anchor2) anchor2.click();
    expect(tree.get_selected()).not.toContain('n2');
  });

  it('should work without a callback configured (allows all)', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['conditionalselect'],
      // No conditionalselect callback provided
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    if (anchor) anchor.click();
    expect(tree.get_selected()).toContain('n1');
  });
});
