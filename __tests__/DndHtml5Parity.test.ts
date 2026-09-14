import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * dnd.use_html5 parity with jstree 3.3.16: nodes drag with the browser's
 * native drag and drop. Anchors (whole nodes, with large_drag_target) are
 * `draggable`; dragstart starts the drag — with no helper, as the browser
 * draws its own — dragover finds the drop on the same rules as the pointer
 * backend, and drop drops, into this tree or another.
 *
 * jsdom has no DragEvent, so these tests dispatch MouseEvents carrying a
 * dataTransfer.
 */
describe('dnd.use_html5 parity', () => {
  let left: HTMLElement;
  let right: HTMLElement;

  beforeEach(() => {
    left = document.createElement('div');
    right = document.createElement('div');
    document.body.append(left, right);
  });

  afterEach(() => {
    MDFolderTree.getInstance(left)?.destroy();
    MDFolderTree.getInstance(right)?.destroy();
    left.remove();
    right.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B', children: [{ id: 'b1', text: 'B1' }] },
    { id: 'c', text: 'C' },
  ];

  const build = (el: HTMLElement, dnd: Record<string, unknown> = {}, core: Record<string, unknown> = {}) =>
    new MDFolderTree(el, {
      core: { data: data(), check_callback: true, ...core },
      plugins: ['dnd'],
      dnd: { use_html5: true, ...dnd },
    } as never);

  const anchor = (el: HTMLElement, id: string) => el.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
  const place = (el: HTMLElement) => {
    el.getBoundingClientRect = () =>
      ({ top: 100, bottom: 130, height: 30, left: 20, right: 120, width: 100, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect;
  };
  const fire = (target: EventTarget, type: string, init: MouseEventInit = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    const dataTransfer = { dropEffect: 'none', effectAllowed: 'all', setData: jest.fn(), getData: () => '' };
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    target.dispatchEvent(event);
    return { event, dataTransfer };
  };
  /** Drag `from` over `over` at clientY `y`, drop there, and end the drag; returns the dragover. */
  const dragDrop = (from: HTMLElement, over: HTMLElement, y: number, init: MouseEventInit = {}) => {
    place(over);
    fire(from, 'dragstart');
    const dragover = fire(over, 'dragover', { clientX: 40, clientY: y, ...init });
    fire(over, 'drop', { clientX: 40, clientY: y, ...init });
    fire(from, 'dragend');
    return dragover;
  };
  const roots = (tree: MDFolderTree) => (tree.get_node('#') as TreeNode).children;

  describe('draggable nodes', () => {
    it('should make every anchor draggable', () => {
      build(left);

      const anchors = Array.from(left.querySelectorAll('.md-tree-anchor'));
      expect(anchors.length).toBeGreaterThan(0);
      expect(anchors.every((a) => a.getAttribute('draggable') === 'true')).toBe(true);
      expect(left.querySelector('li[draggable]')).toBeNull();
    });

    it('should make whole nodes draggable with large_drag_target', () => {
      build(left, { large_drag_target: true });

      expect(left.querySelector('#a')!.getAttribute('draggable')).toBe('true');
      expect(anchor(left, 'a').hasAttribute('draggable')).toBe(false);
    });

    it('should keep nodes draggable when redrawn', () => {
      const tree = build(left);

      tree.open_node('b', undefined, 0);
      tree.rename_node('a', 'A2');

      expect(anchor(left, 'b1').getAttribute('draggable')).toBe('true');
      expect(anchor(left, 'a').getAttribute('draggable')).toBe('true');
    });

    it('should make nothing draggable without use_html5', () => {
      build(left, { use_html5: false });

      expect(left.querySelector('[draggable]')).toBeNull();
    });
  });

  describe('starting a drag', () => {
    it('should start on dragstart with jstree\'s payload and no helper', () => {
      const tree = build(left);
      const start = jest.fn();
      tree.on('dnd_start.MDFolderTree', (e) => start((e as CustomEvent).detail));

      fire(anchor(left, 'a'), 'dragstart');

      expect(start).toHaveBeenCalledTimes(1);
      expect(start.mock.calls[0][0].data).toEqual(expect.objectContaining({ jstree: true, origin: tree, nodes: ['a'] }));
      expect(document.getElementById('vakata-dnd')).toBeNull();
      expect(document.getElementById('md-tree-marker')).not.toBeNull();
    });

    it('should not drag with pointer events', () => {
      const tree = build(left);
      const start = jest.fn();
      tree.on('dnd_start.MDFolderTree', start);

      anchor(left, 'a').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: 50 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 50, clientY: 50 }));

      expect(start).not.toHaveBeenCalled();
    });

    it('should honor is_draggable', () => {
      const tree = build(left, { is_draggable: () => false });
      const start = jest.fn();
      tree.on('dnd_start.MDFolderTree', start);

      fire(anchor(left, 'a'), 'dragstart');

      expect(start).not.toHaveBeenCalled();
      expect(document.getElementById('md-tree-marker')).toBeNull();
    });
  });

  describe('dropping', () => {
    it('should move a node dropped after another', () => {
      const tree = build(left);
      const stop = jest.fn();
      tree.on('dnd_stop.MDFolderTree', stop);

      dragDrop(anchor(left, 'a'), anchor(left, 'c'), 129);

      expect(roots(tree)).toEqual(['b', 'c', 'a']);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(document.getElementById('md-tree-marker')).toBeNull();
    });

    it('should accept a valid dragover, with the move effect', () => {
      build(left);

      const { event, dataTransfer } = dragDrop(anchor(left, 'a'), anchor(left, 'c'), 129);

      expect(event.defaultPrevented).toBe(true);
      expect(dataTransfer.dropEffect).toBe('move');
    });

    it('should drop inside a node over the middle of its anchor', () => {
      const tree = build(left);

      dragDrop(anchor(left, 'a'), anchor(left, 'b'), 113);

      expect((tree.get_node('b') as TreeNode).children).toEqual(['a', 'b1']);
    });

    it('should copy with ctrl held', () => {
      const tree = build(left);

      const { dataTransfer } = dragDrop(anchor(left, 'a'), anchor(left, 'c'), 129, { ctrlKey: true });

      expect(dataTransfer.dropEffect).toBe('copy');
      expect(roots(tree)).toHaveLength(4);
      expect(roots(tree).slice(0, 3)).toEqual(['a', 'b', 'c']);
      expect(tree.get_text(roots(tree)[3])).toBe('A');
    });

    it('should drop into another tree', () => {
      const source = build(left);
      const target = build(right);

      dragDrop(anchor(left, 'a'), anchor(right, 'c'), 113);

      expect(source.get_node('a')).toBe(false);
      const [id] = (target.get_node('c') as TreeNode).children;
      expect(target.get_text(id)).toBe('A');
    });

    it('should report a refused drop through core.error', () => {
      const error = jest.fn();
      const tree = build(left, {}, { check_callback: (op: string) => op !== 'move_node', error });

      dragDrop(anchor(left, 'a'), anchor(left, 'c'), 129);

      expect(roots(tree)).toEqual(['a', 'b', 'c']);
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ error: 'check' }));
    });

    it('should end an abandoned drag without dropping', () => {
      const tree = build(left);
      const stop = jest.fn();
      tree.on('dnd_stop.MDFolderTree', stop);
      place(anchor(left, 'c'));

      fire(anchor(left, 'a'), 'dragstart');
      fire(anchor(left, 'c'), 'dragover', { clientX: 40, clientY: 129 });
      fire(anchor(left, 'a'), 'dragend');

      expect(roots(tree)).toEqual(['a', 'b', 'c']);
      expect(stop).not.toHaveBeenCalled();
      expect(document.getElementById('md-tree-marker')).toBeNull();
    });

    it('should drop nothing once the tree is destroyed mid-drag', () => {
      const tree = build(left);
      const target = build(right);
      place(anchor(right, 'c'));

      fire(anchor(left, 'a'), 'dragstart');
      tree.destroy();
      fire(anchor(right, 'c'), 'dragover', { clientX: 40, clientY: 113 });
      fire(anchor(right, 'c'), 'drop', { clientX: 40, clientY: 113 });

      expect((target.get_node('c') as TreeNode).children).toEqual([]);
      expect(document.getElementById('md-tree-marker')).toBeNull();
    });
  });
});
