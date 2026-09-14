import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Dragging between trees, and drag auto-scroll, as jstree 3.3.16 does them.
 *
 * move_node / copy_node take jstree's `origin` argument: a node from another
 * tree is copied in from its JSON — checked with `is_multi` — and a move then
 * deletes it from its own tree. A drag onto another tree with the dnd plugin
 * drops there that way. Near the edge of a scrollable ancestor, a drag scrolls
 * it every 100ms, emitting dnd_scroll and forgetting the drop target.
 */
describe('dnd between trees and auto-scroll', () => {
  let left: HTMLElement;
  let right: HTMLElement;
  const realElementFromPoint = document.elementFromPoint;

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
    document.elementFromPoint = realElementFromPoint;
    document.getElementById('vakata-dnd')?.remove();
    jest.useRealTimers();
  });

  const leftData = (): TreeNodeData[] => [
    { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1' }] },
    { id: 'b', text: 'B' },
  ];
  const rightData = (): TreeNodeData[] => [
    { id: 'p', text: 'P', state: { opened: true }, children: [{ id: 'k', text: 'K' }] },
  ];

  const build = (el: HTMLElement, data: TreeNodeData[], rest: Record<string, unknown> = {}, dnd = true) =>
    new MDFolderTree(el, {
      core: { data, check_callback: true },
      plugins: dnd ? ['dnd'] : [],
      ...rest,
    } as never);

  const anchorIn = (el: HTMLElement, id: string) => el.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
  const place = (el: HTMLElement) => {
    el.getBoundingClientRect = () =>
      ({ top: 100, bottom: 130, height: 30, left: 20, right: 120, width: 100, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect;
  };
  const drag = (from: HTMLElement, over: HTMLElement, y: number, init: PointerEventInit = {}) => {
    place(over);
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
    document.elementFromPoint = () => over;
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: y, ...init }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 40, clientY: y, ...init }));
  };
  const kids = (tree: MDFolderTree, id: string) => (tree.get_node(id) as TreeNode).children;

  describe('move_node / copy_node with an origin', () => {
    it('should move a node in from another tree, deleting it there', () => {
      const source = build(left, leftData(), {}, false);
      const target = build(right, rightData(), {}, false);

      const id = target.move_node(source.get_node('a') as TreeNode, 'p', 0, undefined, false, false, source) as string;

      expect(source.get_node('a')).toBe(false);
      expect(kids(target, 'p')[0]).toBe(id);
      expect(target.get_text(id)).toBe('A');
      expect(target.get_text(kids(target, id)[0])).toBe('A1');
    });

    it('should copy a node in from another tree, keeping it there', () => {
      const source = build(left, leftData(), {}, false);
      const target = build(right, rightData(), {}, false);

      target.copy_node('b', 'p', 'last', undefined, false, false, source);

      expect(source.get_node('b')).not.toBe(false);
      expect(target.get_text(kids(target, 'p')[1])).toBe('B');
    });

    it('should check the move as is_multi, with the origin', () => {
      const seen: Array<{ is_multi?: boolean; origin?: unknown }> = [];
      const source = build(left, leftData(), {}, false);
      const target = build(right, rightData(), {
        core: {
          data: rightData(),
          check_callback: (_op: string, _n: unknown, _p: unknown, _pos: unknown, more: { is_multi?: boolean; origin?: unknown }) => {
            seen.push(more);
            return true;
          },
        },
      }, false);

      target.move_node('b', 'p', 0, undefined, false, false, source);

      expect(seen[0]).toEqual(expect.objectContaining({ is_multi: true, origin: source }));
    });
  });

  describe('dragging', () => {
    it('should drop a node onto another tree, moving it', () => {
      const source = build(left, leftData());
      const target = build(right, rightData());

      drag(anchorIn(left, 'b'), anchorIn(right, 'p'), 114);

      expect(source.get_node('b')).toBe(false);
      expect(target.get_text(kids(target, 'p')[0])).toBe('B');
    });

    it('should copy onto another tree with ctrl held', () => {
      const source = build(left, leftData());
      const target = build(right, rightData());

      drag(anchorIn(left, 'b'), anchorIn(right, 'p'), 114, { ctrlKey: true });

      expect(source.get_node('b')).not.toBe(false);
      expect(kids(target, 'p')).toHaveLength(2);
    });

    it('should not drop onto a tree without the dnd plugin', () => {
      const source = build(left, leftData());
      const target = build(right, rightData(), {}, false);

      drag(anchorIn(left, 'b'), anchorIn(right, 'p'), 114);

      expect(source.get_node('b')).not.toBe(false);
      expect(kids(target, 'p')).toEqual(['k']);
    });
  });

  describe('auto-scroll', () => {
    /** A 100px-high scroller around the left tree, holding 1000px of content. */
    const scroller = () => {
      const box = document.createElement('div');
      box.style.overflow = 'auto';
      let top = 0;
      Object.defineProperty(box, 'scrollHeight', { value: 1000 });
      Object.defineProperty(box, 'offsetHeight', { value: 100 });
      Object.defineProperty(box, 'scrollTop', { get: () => top, set: (v: number) => { top = Math.max(0, v); } });
      box.getBoundingClientRect = () =>
        ({ top: 0, bottom: 100, height: 100, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      document.body.appendChild(box);
      box.appendChild(left);
      return box;
    };

    const hover = (over: HTMLElement, y: number) => {
      document.elementFromPoint = () => over;
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: y }));
    };

    it('should scroll a scrollable ancestor near its edge, every 100ms', () => {
      jest.useFakeTimers();
      const box = scroller();
      build(left, leftData());
      anchorIn(left, 'a').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));

      hover(anchorIn(left, 'b'), 95);
      jest.advanceTimersByTime(100);
      expect(box.scrollTop).toBe(10);
      jest.advanceTimersByTime(100);
      expect(box.scrollTop).toBe(20);

      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      jest.advanceTimersByTime(300);
      expect(box.scrollTop).toBe(20);
      box.remove();
    });

    it('should emit dnd_scroll and forget the drop target when it scrolls', () => {
      jest.useFakeTimers();
      const box = scroller();
      const tree = build(left, leftData());
      const scrolled = jest.fn();
      tree.on('dnd_scroll.MDFolderTree', scrolled);
      anchorIn(left, 'b').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
      place(anchorIn(left, 'a'));

      hover(anchorIn(left, 'a'), 95);
      jest.advanceTimersByTime(100);
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

      expect(scrolled).toHaveBeenCalled();
      expect(kids(tree, 'a')).toEqual(['a1']);
      box.remove();
    });
  });
});
