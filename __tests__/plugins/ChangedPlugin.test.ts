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

  it('should report deselected nodes when deselecting', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['changed'],
    });

    // Unsuppressed, so it emits `changed` and enters the diff baseline. As in
    // jstree's changed plugin, diffs are relative to the last *emitted*
    // selection: a suppressed select never enters the baseline, and a later
    // deselect would then correctly report nothing deselected.
    tree.select_node('n1');

    let detail: { changed: { selected: string[]; deselected: string[] } } | null = null;
    container.addEventListener('changed.MDFolderTree', ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);

    tree.deselect_node('n1');

    expect(detail!.changed.deselected).toContain('n1');
    expect(detail!.changed.selected).toEqual([]);
  });

  it('should report both selected and deselected in single-select mode', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, multiple: false },
      plugins: ['changed'],
    });
    // Single-select is enforced on activation, as in jstree.
    const click = (id: string, init: MouseEventInit = {}) =>
      (container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));

    click('n1');
    let detail: { changed: { selected: string[]; deselected: string[] } } | null = null;
    container.addEventListener('changed.MDFolderTree', ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);
    click('n2');

    expect(detail!.changed.selected).toContain('n2');
    expect(detail!.changed.deselected).toContain('n1');
  });
});
