import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Config parity with jstree 3.3.16: options jstree honors that were declared
 * here but never applied.
 */
describe('Config parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  /** Let the deferred loaded / ready events fire. */
  const settle = () => Promise.resolve();

  const nested: TreeNodeData[] = [
    {
      id: 'p',
      text: 'P',
      children: [{ id: 'q', text: 'Q', children: [{ id: 'k', text: 'K', state: { selected: true } }] }],
    },
    { id: 'other', text: 'Other', children: [{ id: 'o1', text: 'O1' }] },
  ];

  // jstree opens every ancestor of the selected nodes just before `ready`.
  describe('core.expand_selected_onload', () => {
    it('should open the ancestors of preselected nodes by default', async () => {
      const tree = new MDFolderTree(container, { core: { data: nested } });

      await settle();

      expect(tree.is_open('p')).toBe(true);
      expect(tree.is_open('q')).toBe(true);
      expect(tree.is_open('other')).toBe(false);
    });

    it('should have opened them by the time ready fires', async () => {
      let openAtReady: boolean | null = null;
      container.addEventListener('ready.MDFolderTree', () => {
        openAtReady = MDFolderTree.getInstance(container)!.is_open('q');
      });
      new MDFolderTree(container, { core: { data: nested } });

      await settle();

      expect(openAtReady).toBe(true);
    });

    it('should leave them closed when false', async () => {
      const tree = new MDFolderTree(container, { core: { data: nested, expand_selected_onload: false } });

      await settle();

      expect(tree.is_open('p')).toBe(false);
    });
  });

  // jstree's check_callback defaults to false: every structural operation is
  // refused, as core_03, until the tree opts in.
  describe('core.check_callback default', () => {
    const flat: TreeNodeData[] = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ];

    it('should refuse structural operations when unset, as core_03', () => {
      const errors: Array<{ id: string }> = [];
      const tree = new MDFolderTree(container, {
        core: { data: flat, error: (e: unknown) => errors.push(e as { id: string }) },
      });

      expect(tree.create_node('#', { id: 'n', text: 'N' })).toBe(false);
      expect(tree.rename_node('a', 'X')).toBe(false);
      expect(tree.move_node('a', 'b')).toBe(false);
      expect(tree.copy_node('a', 'b')).toBe(false);
      expect(tree.delete_node('a')).toBe(false);

      expect(tree.get_text('a')).toBe('A');
      expect(errors.map((e) => e.id)).toEqual(['core_03', 'core_03', 'core_03', 'core_03', 'core_03']);
    });

    it('should allow them with check_callback: true', () => {
      const tree = new MDFolderTree(container, { core: { data: flat, check_callback: true } });

      expect(tree.rename_node('a', 'X')).toBe(true);
      expect(tree.get_text('a')).toBe('X');
    });
  });

  // jstree's restore_focus (default true) returns focus to the last active
  // node when the tree is focused again; with it off, that node is forgotten.
  describe('core.restore_focus', () => {
    const letters: TreeNodeData[] = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ];
    const key = (k: string) =>
      container.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const leave = () => container.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    const focused = () => container.getAttribute('aria-activedescendant');

    it('should resume from the last focused node by default', () => {
      new MDFolderTree(container, { core: { data: letters } });
      key('Home');
      key('ArrowDown');

      leave();
      key('ArrowDown');

      expect(focused()).toBe('c');
    });

    it('should forget the focused node on leaving when false', () => {
      new MDFolderTree(container, { core: { data: letters, restore_focus: false } });
      key('Home');
      key('ArrowDown');

      leave();

      expect(focused()).toBeNull();
    });

    it('should keep the focused node when focus moves within the tree', () => {
      new MDFolderTree(container, { core: { data: letters, restore_focus: false } });
      key('Home');
      const inner = container.querySelector('#b > .md-tree-anchor') as HTMLElement;

      container.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: inner }));

      expect(focused()).toBe('a');
    });
  });
});
