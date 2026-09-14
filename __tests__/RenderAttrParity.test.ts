import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Node markup parity with jstree 3.3.16's `redraw_node`: `li_attr.class` is
 * added to the `<li>` and `a_attr.class` to the anchor; a disabled node is
 * marked on its anchor; and the anchor's id defaults to `<node id>_anchor`,
 * which jstree records in `a_attr.id`.
 */
describe('li_attr / a_attr rendering parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const build = (data: TreeNodeData[]) => new MDFolderTree(container, { core: { data, check_callback: true } });
  const li = (id: string) => container.querySelector(`li#${CSS.escape(id)}`) as HTMLElement;
  const anchor = (id: string) => li(id).querySelector(':scope > .md-tree-anchor') as HTMLElement;

  it('should add li_attr classes to the node element', () => {
    build([{ id: 'a', text: 'A', li_attr: { class: 'mine other' } }]);

    expect(li('a').classList.contains('mine')).toBe(true);
    expect(li('a').classList.contains('other')).toBe(true);
    expect(li('a').classList.contains('md-tree-node')).toBe(true);
  });

  it('should add a_attr classes to the anchor', () => {
    build([{ id: 'a', text: 'A', a_attr: { class: 'theirs' } }]);

    expect(anchor('a').classList.contains('theirs')).toBe(true);
    expect(anchor('a').classList.contains('md-tree-anchor')).toBe(true);
  });

  it('should keep the classes when a state change redraws the node', () => {
    const tree = build([{ id: 'a', text: 'A', li_attr: { class: 'mine' }, a_attr: { class: 'theirs' } }]);

    tree.select_node('a');

    expect(li('a').classList.contains('mine')).toBe(true);
    expect(anchor('a').classList.contains('theirs')).toBe(true);
    expect(anchor('a').classList.contains('md-tree-clicked')).toBe(true);
  });

  it('should mark a disabled node on its anchor', () => {
    build([{ id: 'a', text: 'A', state: { disabled: true } }]);

    expect(anchor('a').classList.contains('md-tree-disabled')).toBe(true);
    expect(li('a').classList.contains('md-tree-disabled')).toBe(false);
  });

  it('should give the anchor the id <node id>_anchor unless a_attr sets one', () => {
    const tree = build([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B', a_attr: { id: 'custom' } },
    ]);

    expect(anchor('a').id).toBe('a_anchor');
    expect(anchor('b').id).toBe('custom');
    expect((tree.get_node('a') as TreeNode).a_attr.id).toBe('a_anchor');
  });

  it('should give a copied node its own anchor id', () => {
    const tree = build([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ]);

    tree.copy_node('a', 'b');
    tree.open_node('b');

    const copy = (tree.get_node('b') as TreeNode).children[0];
    expect(copy).not.toBe('a');
    expect((tree.get_node(copy) as TreeNode).a_attr.id).toBe(`${copy}_anchor`);
    expect(anchor(copy).id).toBe(`${copy}_anchor`);
  });
});
