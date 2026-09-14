import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Context menu parity with jstree 3.3.16's contextmenu plugin and its
 * $.vakata.context menu.
 *
 * Right-click activates the node (select_node) and shows the menu — at the
 * node (show_at_node, the default) or the pointer — built from `items`, an
 * object or `items(node, callback)` called with the tree as `this`. An item's
 * action gets `{ item, reference, element, position }`, `reference` being the
 * node's anchor; a disabled item does nothing, and an action returning false
 * keeps the menu open. jstree's default items create, rename, delete and cut
 * / copy / paste. The menu is `ul.vakata-context`, navigable by keyboard, and
 * `context_show` / `context_hide` fire on the document.
 */
describe('Context menu parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    document.querySelectorAll('.vakata-context').forEach((el) => el.remove());
    jest.useRealTimers();
  });

  const data = (): TreeNodeData[] => [
    { id: 'n1', text: 'Node 1', state: { opened: true }, children: [{ id: 'n1-1', text: 'Child 1' }] },
    { id: 'n2', text: 'Node 2' },
  ];

  const build = (contextmenu: Record<string, unknown> = {}, core: Record<string, unknown> = {}) =>
    new MDFolderTree(container, {
      core: { data: data(), check_callback: true, ...core },
      plugins: ['contextmenu'],
      contextmenu,
    } as never);

  const anchor = (id: string) => container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
  const rightClick = (id: string, init: MouseEventInit = {}) =>
    anchor(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 50, ...init }));
  const menu = () => document.querySelector('ul.vakata-context') as HTMLElement | null;
  // trim() drops the spacer (U+00A0) jstree puts before the label.
  const labelOf = (li: Element) => (li.querySelector(':scope > a')?.textContent ?? '').trim();
  const itemNamed = (label: string) =>
    Array.from(menu()!.querySelectorAll('li')).find((li) => labelOf(li).startsWith(label)) as HTMLElement;
  const click = (label: string) =>
    itemNamed(label).querySelector(':scope > a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (el: Element, k: string, keyCode = 0) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, keyCode, bubbles: true, cancelable: true }));

  describe('items and actions', () => {
    it('should hand an action the item, the node anchor as reference, the menu and the position', () => {
      const action = jest.fn();
      const tree = build({ items: { go: { label: 'Go', action } } });

      rightClick('n1');
      const shown = menu();
      click('Go');

      const arg = action.mock.calls[0][0];
      expect(arg.reference).toBe(anchor('n1'));
      expect((tree.get_node(arg.reference) as TreeNode).id).toBe('n1');
      expect(arg.element).toBe(shown);
      expect(arg.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
      expect(arg.item.label).toBe('Go');
    });

    it('should call items with the node and the tree as this', () => {
      const calls: Array<[unknown, string]> = [];
      const tree = build({
        items: function (this: unknown, node: TreeNode) {
          calls.push([this, node.id]);
          return { a: { label: 'A', action: () => undefined } };
        },
      });

      rightClick('n2');

      expect(calls).toEqual([[tree, 'n2']]);
    });

    it('should show items that the function hands to its callback later', async () => {
      build({
        items: (_node: TreeNode, callback: (items: Record<string, unknown>) => void) => {
          setTimeout(() => callback({ later: { label: 'Later', action: () => undefined } }), 0);
        },
      });

      rightClick('n1');
      expect(menu()).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(itemNamed('Later')).toBeDefined();
    });

    it('should do nothing for a disabled item, and keep the menu open', () => {
      const action = jest.fn();
      build({ items: { off: { label: 'Off', _disabled: true, action } } });

      rightClick('n1');
      click('Off');

      expect(action).not.toHaveBeenCalled();
      expect(itemNamed('Off').classList.contains('vakata-contextmenu-disabled')).toBe(true);
      expect(menu()).not.toBeNull();
    });

    it('should keep the menu open when an action returns false', () => {
      build({ items: { stay: { label: 'Stay', action: () => false } } });

      rightClick('n1');
      click('Stay');

      expect(menu()).not.toBeNull();
    });

    it('should close the menu after an action', () => {
      build({ items: { go: { label: 'Go', action: () => undefined } } });

      rightClick('n1');
      click('Go');

      expect(menu()).toBeNull();
    });

    it('should draw separators, _class, shortcuts and icons', () => {
      build({
        items: {
          one: { label: 'One', separator_after: true, _class: 'mine', icon: 'fa fa-x', shortcut: 113, shortcut_label: 'F2' },
          two: { label: 'Two', separator_before: true },
        },
      });

      rightClick('n1');

      const lis = Array.from(menu()!.children);
      expect(lis.map((li) => li.classList.contains('vakata-context-separator'))).toEqual([false, true, false]);
      expect(lis[0].classList.contains('mine')).toBe(true);
      expect(lis[0].getAttribute('data-shortcut')).toBe('113');
      expect(lis[0].querySelector('.vakata-contextmenu-shortcut-113')!.textContent).toBe('F2');
      expect(lis[0].querySelector('i')!.classList.contains('fa-x')).toBe(true);
    });
  });

  describe('default items', () => {
    it("should offer jstree's Create, Rename, Delete and Edit, with Paste off until something is cut or copied", () => {
      build();

      rightClick('n1');

      expect(['Create', 'Rename', 'Delete', 'Edit'].every((l) => itemNamed(l))).toBe(true);
      expect(['Cut', 'Copy', 'Paste'].every((l) => itemNamed(l))).toBe(true);
      expect(itemNamed('Paste').classList.contains('vakata-contextmenu-disabled')).toBe(true);
    });

    it('should create a child and start editing it', () => {
      const tree = build();

      rightClick('n1');
      click('Create');

      const children = (tree.get_node('n1') as TreeNode).children;
      expect(children).toHaveLength(2);
      expect(tree.get_text(children[1])).toBe('New node');
      expect(container.querySelector('.md-tree-rename-input')).not.toBeNull();
    });

    it('should start editing on Rename', () => {
      build();

      rightClick('n2');
      click('Rename');

      expect(container.querySelector('.md-tree-rename-input')).not.toBeNull();
    });

    it('should delete the selection when the node is selected', () => {
      const tree = build({}, { multiple: true });
      tree.select_node(['n1', 'n2']);

      rightClick('n2');
      click('Delete');

      expect(tree.get_node('n1')).toBe(false);
      expect(tree.get_node('n2')).toBe(false);
    });

    it('should copy then paste through the Edit submenu', () => {
      const tree = build();

      rightClick('n2');
      click('Copy');
      rightClick('n1');
      click('Paste');

      expect((tree.get_node('n1') as TreeNode).children).toHaveLength(2);
    });
  });

  describe('showing and hiding', () => {
    it('should mark the node while its menu shows', () => {
      build();

      rightClick('n1');
      expect(anchor('n1').classList.contains('md-tree-context')).toBe(true);

      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(anchor('n1').classList.contains('md-tree-context')).toBe(false);
    });

    it('should hide when a node is clicked', () => {
      build();

      rightClick('n1');
      anchor('n2').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(menu()).toBeNull();
    });

    it('should fire context_show and context_hide on the document', () => {
      build();
      const seen: Array<[string, unknown]> = [];
      const record = (e: Event) => seen.push([e.type, (e as CustomEvent).detail?.reference]);
      document.addEventListener('context_show.vakata', record);
      document.addEventListener('context_hide.vakata', record);

      rightClick('n1');
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      document.removeEventListener('context_show.vakata', record);
      document.removeEventListener('context_hide.vakata', record);
      expect(seen).toEqual([
        ['context_show.vakata', anchor('n1')],
        ['context_hide.vakata', anchor('n1')],
      ]);
    });

    it('should open at the pointer with show_at_node off', () => {
      build({ show_at_node: false });

      rightClick('n1', { clientX: 140, clientY: 70 });

      expect(menu()!.style.left).toBe('140px');
      expect(menu()!.style.top).toBe('70px');
    });

    it('should not open for a node that is loading', () => {
      const tree = build();
      (tree.get_node('n2') as TreeNode).state.loading = true;

      rightClick('n2');

      expect(menu()).toBeNull();
    });

    it('should open on a long touch press', () => {
      jest.useFakeTimers();
      build();

      anchor('n1').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10 }),
      );
      jest.advanceTimersByTime(749);
      expect(menu()).toBeNull();
      jest.advanceTimersByTime(1);

      expect(menu()).not.toBeNull();
    });
  });

  describe('keyboard', () => {
    it('should move between items, open a submenu, run an item on Enter and close on Escape', () => {
      const run = jest.fn();
      build({
        items: {
          one: { label: 'One', action: () => undefined },
          two: { label: 'Two', action: () => undefined, submenu: { deep: { label: 'Deep', action: run } } },
        },
      });

      rightClick('n1');
      const hovered = () => Array.from(menu()!.querySelectorAll('.vakata-context-hover')).map(labelOf);
      expect(hovered()).toEqual(['One']);

      key(menu()!.querySelector('a')!, 'ArrowDown', 40);
      expect(hovered()[0]).toContain('Two');

      key(menu()!.querySelector('a')!, 'ArrowRight', 39);
      expect(hovered()).toContain('Deep');

      key(itemNamed('Deep').querySelector('a')!, 'Enter', 13);
      expect(run).toHaveBeenCalled();
      expect(menu()).toBeNull();
    });

    it('should close on Escape', () => {
      build();

      rightClick('n1');
      key(menu()!.querySelector('a')!, 'Escape', 27);

      expect(menu()).toBeNull();
    });
  });
});
