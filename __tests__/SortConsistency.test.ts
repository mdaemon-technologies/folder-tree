import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * The sort plugin reacted to `create_node` / `rename_node` / `move_node`,
 * which are emitted *after* the render. It reordered the model and never
 * redrew, so the DOM and `node.children` disagreed.
 */
describe('Sort consistency', () => {
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

  const data: TreeNodeData[] = [
    {
      id: 'p',
      text: 'P',
      state: { opened: true },
      children: [
        { id: 'zebra', text: 'Zebra' },
        { id: 'mango', text: 'Mango' },
      ],
    },
  ];

  const build = () => new MDFolderTree(container, { core: { data, check_callback: true }, plugins: ['sort'] });
  const childDom = () =>
    Array.from(container.querySelectorAll('#p > .md-tree-children > .md-tree-node')).map((e) => e.id);

  it('should sort children on initial render', () => {
    const tree = build();

    expect(childDom()).toEqual(['mango', 'zebra']);
    expect(tree.getNode('p')!.children).toEqual(['mango', 'zebra']);
  });

  it('should keep DOM and model in agreement after creating a child', () => {
    const tree = build();

    tree.createNode('p', { id: 'apple', text: 'Apple' });

    expect(tree.getNode('p')!.children).toEqual(['apple', 'mango', 'zebra']);
    expect(childDom()).toEqual(tree.getNode('p')!.children);
  });

  it('should re-sort the DOM after renaming a child', () => {
    const tree = build();

    tree.renameNode('zebra', 'Aardvark');

    expect(childDom()).toEqual(['zebra', 'mango']);
    expect(tree.getNode('p')!.children).toEqual(childDom());
  });

  it('should keep DOM and model in agreement after a move', () => {
    const tree = new MDFolderTree(container, {
      core: {
        data: [
          { id: 'p', text: 'P', state: { opened: true }, children: [{ id: 'zebra', text: 'Zebra' }] },
          { id: 'q', text: 'Q', state: { opened: true }, children: [{ id: 'mango', text: 'Mango' }] },
        ],
        check_callback: true,
      },
      plugins: ['sort'],
    });

    tree.moveNode('mango', 'p', 0);

    expect(tree.getNode('p')!.children).toEqual(['mango', 'zebra']);
    expect(childDom()).toEqual(['mango', 'zebra']);
  });

  it('should sort root nodes too', () => {
    const tree = new MDFolderTree(container, {
      core: { data: [{ id: 'z', text: 'Zed' }, { id: 'a', text: 'Ann' }] },
      plugins: ['sort'],
    });

    expect(tree.getRootNodeIds()).toEqual(['a', 'z']);
  });

  it('should honor a custom comparator at every level', () => {
    const tree = new MDFolderTree(container, {
      core: { data },
      plugins: ['sort'],
      // jstree passes node ids, with the tree as `this`. Reverse order.
      sort: function (this: MDFolderTree, a: string, b: string) {
        return (this.get_text(b) as string).localeCompare(this.get_text(a) as string);
      },
    });

    expect(tree.getNode('p')!.children).toEqual(['zebra', 'mango']);
    expect(childDom()).toEqual(['zebra', 'mango']);
  });
});
