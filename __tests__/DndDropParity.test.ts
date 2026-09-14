import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Drop parity with jstree 3.3.16's dnd plugin. Over an anchor, the pointer's
 * third picks an order of preference — top: before, inside, after; bottom:
 * after, inside, before; middle: inside first — and the first position that
 * passes `check` (with `{ dnd, ref, pos, origin, is_multi, is_foreign }`,
 * unless check_while_dragging is off) wins. `inside_pos` places an inside
 * drop; ctrl / meta copies (with `copy`, the default), or always with
 * `always_copy`. Over blank space the drop goes last at the root, with
 * blank_space_drop or in an empty tree; `large_drop_target` accepts the whole
 * node. Hovering inside a closed node opens it after `open_timeout`. A
 * refused drop is reported through core.error.
 */
describe('dnd drop parity', () => {
  let container: HTMLElement;
  const realElementFromPoint = document.elementFromPoint;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    document.elementFromPoint = realElementFromPoint;
    document.getElementById('vakata-dnd')?.remove();
    jest.useRealTimers();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'p', text: 'P', state: { opened: true }, children: [{ id: 'k', text: 'K' }] },
    { id: 'shut', text: 'Shut', children: [{ id: 's1', text: 'S1' }] },
  ];

  const build = (dnd: Record<string, unknown> = {}, core: Record<string, unknown> = {}, nodes: TreeNodeData[] = data()) =>
    new MDFolderTree(container, {
      core: { data: nodes, check_callback: true, ...core },
      plugins: ['dnd'],
      dnd,
    } as never);

  const anchor = (id: string) => container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;

  /** Give an anchor a 30px-high box at y = 100. */
  const place = (el: HTMLElement) => {
    el.getBoundingClientRect = () =>
      ({ top: 100, bottom: 130, height: 30, left: 20, right: 120, width: 100, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect;
  };

  /** Drag `from` and hover the pointer over `over` at y, then drop. */
  const drag = (from: string, over: Element, y: number, init: PointerEventInit = {}, drop = true) => {
    if (over instanceof HTMLElement && over.classList.contains('md-tree-anchor')) place(over);
    anchor(from).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
    document.elementFromPoint = () => over;
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: y, ...init }));
    if (drop) document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 40, clientY: y, ...init }));
  };

  const roots = (tree: MDFolderTree) => (tree.get_json() as TreeNodeData[]).map((n) => n.id);
  const kids = (tree: MDFolderTree, id: string) => (tree.get_node(id) as TreeNode).children;

  describe('position within the anchor', () => {
    it('should drop before a node from the top third', () => {
      const tree = build();

      drag('shut', anchor('b'), 105);

      expect(roots(tree)).toEqual(['a', 'shut', 'b', 'p']);
    });

    it('should drop after a node from the bottom third', () => {
      const tree = build();

      drag('a', anchor('b'), 125);

      expect(roots(tree)).toEqual(['b', 'a', 'p', 'shut']);
    });

    it('should drop inside a node from the middle', () => {
      const tree = build();

      drag('a', anchor('p'), 114);

      expect(kids(tree, 'p')).toEqual(['a', 'k']);
    });

    it('should fall back along the order when check refuses a position', () => {
      const tree = build({}, {
        check_callback: (_op: string, _n: unknown, _p: unknown, _pos: unknown, more: { dnd?: boolean; pos?: string }) =>
          !more?.dnd || more.pos !== 'b',
      });

      drag('a', anchor('p'), 105);

      expect(kids(tree, 'p')).toEqual(['a', 'k']);
    });

    it('should hand check the dnd context', () => {
      const seen: Array<Record<string, unknown>> = [];
      const tree = build({}, {
        check_callback: (_op: string, _n: unknown, _p: unknown, _pos: unknown, more: Record<string, unknown>) => {
          if (more?.dnd) seen.push(more);
          return true;
        },
      });

      drag('a', anchor('p'), 114, {}, false);

      expect(seen[0]).toEqual(
        expect.objectContaining({ dnd: true, pos: 'i', origin: tree, is_multi: false, is_foreign: false }),
      );
      expect((seen[0].ref as TreeNode).id).toBe('p');
    });

    it('should not check while dragging with check_while_dragging off', () => {
      const tree = build({ check_while_dragging: false }, {
        check_callback: (_op: string, _n: unknown, _p: unknown, _pos: unknown, more: { dnd?: boolean }) => !more?.dnd,
      });

      drag('a', anchor('p'), 114);

      expect(kids(tree, 'p')).toEqual(['a', 'k']);
    });

    it('should place an inside drop by inside_pos', () => {
      const tree = build({ inside_pos: 'last' });

      drag('a', anchor('p'), 114);

      expect(kids(tree, 'p')).toEqual(['k', 'a']);
    });
  });

  describe('what is dropped', () => {
    it('should drop every dragged node, one after another', () => {
      const tree = build();
      tree.select_node(['a', 'b']);

      drag('a', anchor('p'), 114);

      expect(kids(tree, 'p')).toEqual(['a', 'b', 'k']);
    });

    it('should copy with ctrl held', () => {
      const tree = build();

      drag('a', anchor('p'), 114, { ctrlKey: true });

      expect(tree.get_node('a')).not.toBe(false);
      expect(kids(tree, 'p')).toHaveLength(2);
      expect(tree.get_text(kids(tree, 'p')[0])).toBe('A');
    });

    it('should move despite ctrl with copy off', () => {
      const tree = build({ copy: false });

      drag('a', anchor('p'), 114, { ctrlKey: true });

      expect(kids(tree, 'p')).toEqual(['a', 'k']);
    });

    it('should always copy with always_copy', () => {
      const tree = build({ always_copy: true });

      drag('a', anchor('p'), 114);

      expect(tree.get_node('a')).not.toBe(false);
      expect(kids(tree, 'p')).toHaveLength(2);
    });
  });

  describe('feedback', () => {
    const status = () => document.querySelector('#md-tree-dnd > .md-tree-icon') as HTMLElement;
    const marker = () => document.getElementById('md-tree-marker') as HTMLElement;

    it('should mark the helper ok over a valid target, with the marker placed', () => {
      build();

      drag('a', anchor('b'), 105, {}, false);

      expect(status().classList.contains('md-tree-ok')).toBe(true);
      expect(marker().classList.contains('md-tree-below')).toBe(true);
      expect(marker().style.display).not.toBe('none');
    });

    it('should mark the parent the drop goes into', () => {
      build();

      drag('a', anchor('k'), 105, {}, false);

      expect(container.querySelector('#p')!.classList.contains('md-tree-dnd-parent')).toBe(true);
    });

    it('should mark the helper as an error where nothing may be dropped', () => {
      build({}, { check_callback: (_op: string, _n: unknown, _p: unknown, _pos: unknown, more: { dnd?: boolean }) => !more?.dnd });

      drag('a', anchor('b'), 105, {}, false);

      expect(status().classList.contains('md-tree-er')).toBe(true);
      expect(marker().style.display).toBe('none');
    });

    it('should show the copy sign while copying', () => {
      build();

      drag('a', anchor('b'), 105, { ctrlKey: true }, false);

      expect((document.querySelector('#md-tree-dnd .md-tree-copy') as HTMLElement).style.display).not.toBe('none');
    });

    it('should report a refused drop through core.error', () => {
      const errors: Array<{ id: string }> = [];
      const tree = build({}, {
        check_callback: (_op: string, _n: unknown, _p: unknown, _pos: unknown, more: { dnd?: boolean }) => !more?.dnd,
        error: (e: unknown) => errors.push(e as { id: string }),
      });

      drag('a', anchor('b'), 105);

      expect(roots(tree)).toEqual(['a', 'b', 'p', 'shut']);
      expect(errors.map((e) => e.id)).toContain('core_03');
    });
  });

  describe('drop targets', () => {
    it('should drop last at the root over blank space with blank_space_drop', () => {
      const tree = build({ blank_space_drop: true });

      drag('k', container, 300);

      expect(roots(tree)).toEqual(['a', 'b', 'p', 'shut', 'k']);
    });

    it('should not drop over blank space without blank_space_drop', () => {
      const tree = build();

      drag('k', container, 300);

      expect(kids(tree, 'p')).toEqual(['k']);
    });

    it('should accept the whole node with large_drop_target', () => {
      const tree = build({ large_drop_target: true });
      place(anchor('p'));
      const icon = container.querySelector('#p > .md-tree-ocl') as HTMLElement;

      drag('a', icon, 114);

      expect(kids(tree, 'p')).toEqual(['a', 'k']);
    });

    it('should open a closed node hovered inside after open_timeout', () => {
      jest.useFakeTimers();
      const tree = build({ open_timeout: 300 });

      drag('a', anchor('shut'), 114, {}, false);
      jest.advanceTimersByTime(299);
      expect(tree.is_open('shut')).toBe(false);
      jest.advanceTimersByTime(1);

      expect(tree.is_open('shut')).toBe(true);
    });
  });
});
