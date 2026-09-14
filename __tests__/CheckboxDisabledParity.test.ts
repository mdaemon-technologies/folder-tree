import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * disable_checkbox parity with jstree 3.3.16: the flag lives in the model as
 * `state.checkbox_disabled`, so a redraw keeps it; disable / enable emit only
 * when the state changes; and a click on a disabled checkbox does nothing.
 */
describe('disable_checkbox parity', () => {
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
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ];
  const build = (nodes: TreeNodeData[] = data()) =>
    new MDFolderTree(container, { core: { data: nodes }, plugins: ['checkbox'] });
  const box = (id: string) => container.querySelector(`#${id} > .md-tree-anchor > .md-tree-checkbox`) as HTMLElement;
  const isDisabledBox = (id: string) => box(id).classList.contains('md-tree-checkbox-disabled');

  it('should record the flag on the node and keep it across a redraw', () => {
    const tree = build();

    tree.disable_checkbox('a');
    tree.redraw();

    expect((tree.get_node('a') as TreeNode).state.checkbox_disabled).toBe(true);
    expect(isDisabledBox('a')).toBe(true);
  });

  it('should emit only when the state changes', () => {
    const tree = build();
    const seen: string[] = [];
    tree.on('disable_checkbox.MDFolderTree', () => seen.push('disable'));
    tree.on('enable_checkbox.MDFolderTree', () => seen.push('enable'));

    tree.disable_checkbox('a');
    tree.disable_checkbox('a');
    tree.enable_checkbox('a');
    tree.enable_checkbox('a');

    expect(seen).toEqual(['disable', 'enable']);
    expect(isDisabledBox('a')).toBe(false);
  });

  it('should return false for a missing node and true for an array', () => {
    const tree = build();

    expect(tree.disable_checkbox('missing')).toBe(false);
    expect(tree.disable_checkbox(['a', 'b'])).toBe(true);
    expect(isDisabledBox('b')).toBe(true);
  });

  it('should ignore a click on a disabled checkbox', () => {
    const tree = build();
    tree.disable_checkbox('a');

    box('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(tree.is_checked('a')).toBe(false);
    expect(tree.is_selected('a')).toBe(false);
  });

  it('should render a checkbox disabled from the node data', () => {
    build([{ id: 'a', text: 'A', state: { checkbox_disabled: true } }]);

    expect(isDisabledBox('a')).toBe(true);
  });
});
