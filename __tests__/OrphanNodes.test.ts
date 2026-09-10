import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * A flat array may name a parent that is not in the payload. Such nodes were
 * stored but attached to nothing, so they never rendered and vanished without
 * explanation.
 */
describe('Orphan nodes', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    container.remove();
  });

  const orphanData = [
    { id: 'a', text: 'A', parent: '#' },
    { id: 'orphan', text: 'Orphan', parent: 'does-not-exist' },
  ] as TreeNodeData[];

  it('should attach an orphan to the root so it renders', () => {
    const tree = new MDFolderTree(container, { core: { data: orphanData } });

    expect(tree.getRootNodeIds()).toContain('orphan');
    expect(container.querySelector('#orphan')).not.toBeNull();
  });

  it('should reparent the orphan to the root sentinel', () => {
    const tree = new MDFolderTree(container, { core: { data: orphanData } });

    expect(tree.getNode('orphan')!.parent).toBe('#');
    expect(tree.getNode('orphan')!.parents).toEqual(['#']);
  });

  it('should report the missing parent', () => {
    const errors: unknown[] = [];

    new MDFolderTree(container, { core: { data: orphanData, error: (e) => errors.push(e) } });

    expect(errors).toContainEqual(
      expect.objectContaining({
        error: 'missing_parent',
        operation: 'load',
        id: 'orphan',
        parent: 'does-not-exist',
      }),
    );
  });

  it('should keep well-formed siblings unaffected', () => {
    const tree = new MDFolderTree(container, { core: { data: orphanData } });

    expect(tree.getNode('a')!.parent).toBe('#');
    expect(tree.getRootNodeIds()).toEqual(['a', 'orphan']);
  });

  it('should still render children that reference the rescued orphan', () => {
    const data = [
      { id: 'orphan', text: 'Orphan', parent: 'missing' },
      { id: 'child', text: 'Child', parent: 'orphan' },
    ] as TreeNodeData[];

    const tree = new MDFolderTree(container, { core: { data } });

    expect(tree.getNode('orphan')!.children).toEqual(['child']);
    expect(tree.getNode('child')!.parents).toEqual(['orphan', '#']);
    expect(container.querySelector('#child')).not.toBeNull();
  });
});
