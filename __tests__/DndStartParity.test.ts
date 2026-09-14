import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Drag start parity with jstree 3.3.16's dnd plugin. Dragging a selected node
 * drags the top selected nodes (with drag_selection, the default), the helper
 * naming how many; `is_draggable(nodes, e)` gets node objects and the tree as
 * `this`; `touch` (true, false or 'selected') governs touch drags, which need
 * a larger 10px move to start; with large_drag_target a drag starts anywhere
 * on the node. The click that ends a drag is swallowed, and Escape cancels.
 */
describe('dnd drag start parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    document.getElementById('vakata-dnd')?.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'p', text: 'P', state: { opened: true }, children: [{ id: 'k', text: 'K' }] },
  ];

  const build = (dnd: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data: data(), check_callback: true }, plugins: ['dnd'], dnd } as never);

  const anchor = (id: string) => container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
  const down = (target: HTMLElement, init: PointerEventInit = {}) =>
    target.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 50, button: 0, pointerType: 'mouse', ...init }),
    );
  const move = (x: number, y: number) =>
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
  const up = (target: EventTarget = document) =>
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  const helper = () => document.getElementById('vakata-dnd');

  const startDetails = (tree: MDFolderTree) => {
    const seen: Array<{ data: { jstree: boolean; origin: unknown; nodes: string[] } }> = [];
    tree.on('dnd_start.MDFolderTree', (e) => seen.push(e.detail as (typeof seen)[number]));
    return seen;
  };

  describe('what is dragged', () => {
    it('should drag the top selected nodes when a selected node is dragged, naming the count', () => {
      const tree = build();
      tree.select_node(['a', 'b']);
      const seen = startDetails(tree);

      down(anchor('a'));
      move(120, 70);

      expect(seen).toHaveLength(1);
      expect(seen[0].data.nodes).toEqual(['a', 'b']);
      expect(seen[0].data.jstree).toBe(true);
      expect(seen[0].data.origin).toBe(tree);
      expect(helper()!.textContent).toContain('2 nodes');
      up();
    });

    it('should drag only the node without drag_selection', () => {
      const tree = build({ drag_selection: false });
      tree.select_node(['a', 'b']);
      const seen = startDetails(tree);

      down(anchor('a'));
      move(120, 70);

      expect(seen[0].data.nodes).toEqual(['a']);
      expect(helper()!.textContent).toContain('A');
      up();
    });

    it('should drag an unselected node on its own', () => {
      const tree = build();
      tree.select_node('b');
      const seen = startDetails(tree);

      down(anchor('a'));
      move(120, 70);

      expect(seen[0].data.nodes).toEqual(['a']);
      up();
    });

    it('should call is_draggable with the node objects and the event, the tree as this', () => {
      const calls: Array<[unknown, string[], string]> = [];
      const tree = build({
        is_draggable: function (this: unknown, nodes: TreeNode[], e: Event) {
          calls.push([this, nodes.map((n) => n.id), e.type]);
          return true;
        },
      });

      down(anchor('a'));

      expect(calls).toEqual([[tree, ['a'], 'pointerdown']]);
      up();
    });
  });

  describe('touch', () => {
    it('should not start a touch drag with touch false', () => {
      build({ touch: false });

      down(anchor('a'), { pointerType: 'touch' });
      move(130, 80);

      expect(helper()).toBeNull();
      up();
    });

    it("should start a touch drag only on a selected node with touch 'selected'", () => {
      const tree = build({ touch: 'selected' });

      down(anchor('a'), { pointerType: 'touch' });
      move(130, 80);
      expect(helper()).toBeNull();
      up();

      tree.select_node('a');
      down(anchor('a'), { pointerType: 'touch' });
      move(130, 80);
      expect(helper()).not.toBeNull();
      up();
    });

    it('should need a 10px move to start a touch drag', () => {
      build();

      down(anchor('a'), { pointerType: 'touch' });
      move(107, 57);
      expect(helper()).toBeNull();
      move(112, 62);
      expect(helper()).not.toBeNull();
      up();
    });
  });

  describe('large_drag_target', () => {
    const icon = (id: string) => container.querySelector(`#${id} > .md-tree-ocl`) as HTMLElement;

    it('should start a drag from anywhere on the node', () => {
      build({ large_drag_target: true });

      down(icon('a'));
      move(120, 70);

      expect(helper()).not.toBeNull();
      up();
    });

    it('should start only from the anchor without it', () => {
      build();

      down(icon('a'));
      move(120, 70);

      expect(helper()).toBeNull();
      up();
    });
  });

  describe('ending a drag', () => {
    it('should swallow the click that ends a drag', () => {
      const tree = build();

      down(anchor('a'));
      move(120, 70);
      up(anchor('a'));
      anchor('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(tree.is_selected('a')).toBe(false);
    });

    it('should let later clicks through', () => {
      const tree = build();
      down(anchor('a'));
      move(120, 70);
      up(anchor('a'));
      anchor('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      anchor('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(tree.is_selected('a')).toBe(true);
    });

    it('should cancel the drag on Escape', () => {
      const tree = build();
      const stopped = jest.fn();
      tree.on('dnd_stop.MDFolderTree', stopped);

      down(anchor('a'));
      move(120, 70);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));

      expect(helper()).toBeNull();
      up();
      expect(stopped).not.toHaveBeenCalled();
    });
  });
});
