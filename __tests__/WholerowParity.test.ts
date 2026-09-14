import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Wholerow parity with jstree 3.3.16: the strip behind each node is what the
 * pointer actually meets, so a click, double-click, right-click or hover
 * anywhere on a row acts on that node's anchor. The strip carries
 * `md-tree-wholerow-clicked` while the node is selected and
 * `md-tree-wholerow-hovered` while it is hovered, and the theme's dots are
 * hidden while the plugin is on.
 */
describe('wholerow parity', () => {
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

  const data = (): TreeNodeData[] => [
    { id: 'p', text: 'P', children: [{ id: 'c1', text: 'C1' }] },
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'd', text: 'D', state: { disabled: true } },
  ];
  const build = (plugins: string[] = ['wholerow']) =>
    new MDFolderTree(container, { core: { data: data(), check_callback: true }, plugins } as never);
  const strip = (id: string) => container.querySelector(`#${id} > .md-tree-wholerow`) as HTMLElement;
  const anchor = (id: string) => container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
  const fire = (el: Element, type: string, init: MouseEventInit = {}) =>
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));

  describe('acting on the row', () => {
    it('should select the node whose strip is clicked', () => {
      const tree = build();

      fire(strip('a'), 'click');

      expect(tree.get_selected()).toEqual(['a']);
    });

    it('should extend the selection with ctrl held', () => {
      const tree = build();
      fire(strip('a'), 'click');

      fire(strip('b'), 'click', { ctrlKey: true });

      expect([...tree.get_selected()].sort()).toEqual(['a', 'b']);
    });

    it('should toggle a parent when its strip is double-clicked', () => {
      const tree = build();

      fire(strip('p'), 'dblclick');

      expect(tree.is_open('p')).toBe(true);
    });

    it('should select through a leaf\'s open/close icon', () => {
      const tree = build();

      fire(container.querySelector('#a > .md-tree-ocl') as HTMLElement, 'click');

      expect(tree.get_selected()).toEqual(['a']);
    });

    it('should refuse a disabled node', () => {
      const tree = build();

      fire(strip('d'), 'click');

      expect(tree.get_selected()).toEqual([]);
    });

    it('should open the context menu from the strip', () => {
      build(['wholerow', 'contextmenu']);

      fire(strip('a'), 'contextmenu', { clientX: 5, clientY: 5 });

      expect(document.querySelector('.vakata-context')).not.toBeNull();
      expect(anchor('a').classList.contains('md-tree-context')).toBe(true);
    });
  });

  describe('marking the row', () => {
    it('should mark the selected node\'s strip', () => {
      const tree = build();

      tree.select_node('a');

      expect(strip('a').classList.contains('md-tree-wholerow-clicked')).toBe(true);
      expect(strip('b').classList.contains('md-tree-wholerow-clicked')).toBe(false);
    });

    it('should move the mark with the selection', () => {
      build();
      fire(strip('a'), 'click');

      fire(strip('b'), 'click');

      expect(strip('a').classList.contains('md-tree-wholerow-clicked')).toBe(false);
      expect(strip('b').classList.contains('md-tree-wholerow-clicked')).toBe(true);
    });

    it('should keep the mark through a redraw', () => {
      const tree = build();
      tree.select_node('a');

      tree.redraw();

      expect(strip('a').classList.contains('md-tree-wholerow-clicked')).toBe(true);
    });

    it('should hover the node when the strip is hovered', () => {
      build();

      fire(strip('a'), 'mouseover');

      expect(anchor('a').classList.contains('md-tree-hovered')).toBe(true);
      expect(strip('a').classList.contains('md-tree-wholerow-hovered')).toBe(true);
    });

    it('should not hover a disabled node', () => {
      build();

      fire(strip('d'), 'mouseover');

      expect(anchor('d').classList.contains('md-tree-hovered')).toBe(false);
    });

    it('should dehover when the pointer leaves the node', () => {
      build();
      fire(strip('a'), 'mouseover');

      (container.querySelector('#a') as HTMLElement).dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));

      expect(anchor('a').classList.contains('md-tree-hovered')).toBe(false);
      expect(strip('a').classList.contains('md-tree-wholerow-hovered')).toBe(false);
    });
  });

  describe('the theme', () => {
    it('should hide the dots while the plugin is on', () => {
      build();

      expect(container.classList.contains('md-tree-no-dots')).toBe(true);
    });

    it('should leave the dots alone without the plugin', () => {
      new MDFolderTree(container, { core: { data: data() } });

      expect(container.classList.contains('md-tree-no-dots')).toBe(false);
    });
  });
});
