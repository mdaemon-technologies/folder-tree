import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * conditionalselect parity with jstree 3.3.16: the callback wraps
 * `activate_node` and is called with the tree as `this` and the node object,
 * so a callback may consult the tree (`this.get_node`, `this.get_type`) to
 * decide.
 */
describe('conditionalselect parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A', type: 'file' },
    { id: 'b', text: 'B', type: 'folder' },
  ];
  const click = (id: string) =>
    (container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

  it('should call the callback with the tree as `this`', () => {
    const seen: unknown[] = [];
    new MDFolderTree(container, {
      core: { data: data() },
      plugins: ['conditionalselect'],
      conditionalselect: function (this: MDFolderTree, node: TreeNode) {
        seen.push(this);
        return this.get_type(node) === 'file';
      },
    } as never);

    click('a');

    expect(seen[0]).toBe(MDFolderTree.getInstance(container));
  });

  it('should let a callback decide through the tree', () => {
    const tree = new MDFolderTree(container, {
      core: { data: data() },
      plugins: ['conditionalselect'],
      conditionalselect: function (this: MDFolderTree, node: TreeNode) {
        return this.get_type(node) === 'file';
      },
    } as never);

    click('a');
    click('b');

    expect(tree.get_selected()).toEqual(['a']);
  });

  it('should receive the node object', () => {
    const nodes: TreeNode[] = [];
    new MDFolderTree(container, {
      core: { data: data() },
      plugins: ['conditionalselect'],
      conditionalselect: function (this: MDFolderTree, node: TreeNode) {
        nodes.push(node);
        return true;
      },
    } as never);

    click('b');

    expect(nodes[0].id).toBe('b');
    expect(nodes[0].text).toBe('B');
  });
});
