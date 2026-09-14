import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Redrawing one node replaced its element outright, which threw away the
 * marks nothing re-applies: the focus ring, the cut marking and the hover.
 * Search is not among them, being re-applied by the plugin's onNodeRender,
 * and the dnd marker sits on the body rather than inside a node.
 *
 * These are reachable without asking for a redraw at all: a checkbox toggle
 * redraws its node, so checking the focused node lost its focus ring.
 */
describe('redraw persistence', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    document.querySelector('.vakata-context')?.remove();
  });

  const data: TreeNodeData[] = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ];

  const build = (plugins: string[] = []) =>
    new MDFolderTree(container, { core: { data, check_callback: true }, plugins } as never);
  const anchor = (id: string) => container.querySelector('#' + id + ' > .md-tree-anchor') as HTMLElement;
  const li = (id: string) => container.querySelector('#' + id) as HTMLElement;

  it('should keep the focus ring on a node it redraws', () => {
    const tree = build();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(anchor('a').classList.contains('md-tree-focused')).toBe(true);

    tree.redraw_node('a');

    expect(anchor('a').classList.contains('md-tree-focused')).toBe(true);
  });

  it('should keep the cut marking on a node it redraws', () => {
    const tree = build();
    tree.cut('a');
    expect(li('a').classList.contains('md-tree-cut')).toBe(true);

    tree.redraw_node('a');

    expect(li('a').classList.contains('md-tree-cut')).toBe(true);
  });

  it('should keep the hover on a node it redraws', () => {
    const tree = build();
    tree.hover_node('a');
    expect(anchor('a').classList.contains('md-tree-hovered')).toBe(true);

    tree.redraw_node('a');

    expect(anchor('a').classList.contains('md-tree-hovered')).toBe(true);
  });

  it('should not leave a stuck context highlight behind', () => {
    const tree = build(['contextmenu']);
    anchor('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(anchor('a').classList.contains('md-tree-context')).toBe(true);

    // The default menu items mutate before the menu closes, so the node is
    // redrawn while the menu still holds the anchor it marked.
    tree.redraw_node('a');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(anchor('a').classList.contains('md-tree-context')).toBe(false);
  });

  it('should keep the focus ring when a checkbox toggle redraws the node', () => {
    const tree = build(['checkbox']);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(anchor('a').classList.contains('md-tree-focused')).toBe(true);

    tree.check_node('a');

    expect(anchor('a').classList.contains('md-tree-focused')).toBe(true);
  });
});
