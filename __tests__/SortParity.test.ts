import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Sort plugin parity with jstree 3.3.16.
 *
 * jstree sorts each `node.children` array — an array of ids — with
 * `settings.sort` bound to the tree, so a comparator receives two ids and
 * calls back into the tree (`this.get_text(a)`). Its default comparator is
 * `this.get_text(a) > this.get_text(b) ? 1 : -1`: a plain, case-sensitive
 * string comparison. The plugin also exposes `sort(obj, deep)`.
 */
describe('Sort parity', () => {
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

  const roots = () =>
    Array.from(container.querySelectorAll('.md-tree-container-ul > .md-tree-node')).map((e) => e.id);

  it('should call a custom comparator with node ids and the tree as this', () => {
    const calls: unknown[][] = [];
    let receivedThis: unknown = null;
    const tree = new MDFolderTree(container, {
      core: { data: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }] },
      plugins: ['sort'],
      sort: function (this: unknown, a: unknown, b: unknown) {
        receivedThis = this;
        calls.push([a, b]);
        return 0;
      } as never,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([a, b]) => typeof a === 'string' && typeof b === 'string')).toBe(true);
    expect(receivedThis).toBe(tree);
  });

  it('should let a comparator call back into the tree, as jstree comparators do', () => {
    new MDFolderTree(container, {
      core: { data: [{ id: 'p', text: 'Pear' }, { id: 'f', text: 'Fig' }, { id: 'k', text: 'Kiwi' }] },
      plugins: ['sort'],
      sort: function (this: MDFolderTree, a: string, b: string) {
        return (this.get_text(a) as string) < (this.get_text(b) as string) ? 1 : -1;
      } as never,
    });

    expect(roots()).toEqual(['p', 'k', 'f']);
  });

  it('should sort case-sensitively by default, as jstree does', () => {
    const data: TreeNodeData[] = [
      { id: 'banana', text: 'banana' },
      { id: 'cherry', text: 'Cherry' },
      { id: 'apple', text: 'apple' },
    ];

    new MDFolderTree(container, { core: { data }, plugins: ['sort'] });

    // Uppercase sorts before lowercase in a plain string comparison.
    expect(roots()).toEqual(['cherry', 'apple', 'banana']);
  });

  it('should expose sort(obj, deep)', () => {
    const tree = new MDFolderTree(container, {
      core: {
        data: [
          { id: 'p', text: 'P', children: [{ id: 'z', text: 'Z' }, { id: 'm', text: 'M' }] },
        ],
      },
      plugins: ['sort'],
    });

    expect(() => tree.sort('#', true)).not.toThrow();
    expect(tree.getNode('p')!.children).toEqual(['m', 'z']);
  });
});
