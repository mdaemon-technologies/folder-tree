import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('ChangedPlugin', () => {
  let container: HTMLElement;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Node 1' },
    { id: 'n2', text: 'Node 2' },
    { id: 'n3', text: 'Node 3' },
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

  it('should include changed.selected and changed.deselected in event data', (done) => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['changed'],
    });

    container.addEventListener('changed.MDFolderTree', ((e: CustomEvent) => {
      expect(e.detail.changed).toBeDefined();
      expect(e.detail.changed.selected).toContain('n1');
      expect(e.detail.changed.deselected).toEqual([]);
      done();
    }) as EventListener);

    tree.select_node('n1');
  });

  it('should report deselected nodes when deselecting', (done) => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['changed'],
    });

    tree.select_node('n1', true);

    container.addEventListener('changed.MDFolderTree', ((e: CustomEvent) => {
      expect(e.detail.changed.deselected).toContain('n1');
      expect(e.detail.changed.selected).toEqual([]);
      done();
    }) as EventListener);

    tree.deselect_node('n1');
  });

  it('should report both selected and deselected in single-select mode', (done) => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData, multiple: false },
      plugins: ['changed'],
    });

    tree.select_node('n1', true);

    container.addEventListener('changed.MDFolderTree', ((e: CustomEvent) => {
      expect(e.detail.changed.selected).toContain('n2');
      expect(e.detail.changed.deselected).toContain('n1');
      done();
    }) as EventListener);

    tree.select_node('n2');
  });
});
