import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Keyboard parity with jstree 3.3.16.
 *
 * jstree's `core.keyboard` is a map of key combos to handlers, deep-merged
 * over its defaults: `ctrl-space`, `enter`, `left`, `up`, `right`, `down`,
 * `*` (open_all), `home`, `end` and `f2`. There is no `delete`, no clipboard
 * shortcut, and plain `space` is unbound. `false` disables every shortcut, a
 * `null` entry disables one, combos match regardless of modifier order, and
 * handlers run with the tree as `this`.
 */
describe('Keyboard parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    container.remove();
  });

  const data: TreeNodeData[] = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'folder', text: 'Folder', children: [{ id: 'deep', text: 'Deep' }] },
  ];

  const build = (core: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, ...core } });

  const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = container) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  const focused = () => container.getAttribute('aria-activedescendant');

  const click = (id: string) =>
    (container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  describe('default map', () => {
    it('should not delete the focused node on Delete', () => {
      const tree = build();
      key('Home');

      key('Delete');

      expect(tree.getNode('a')).not.toBeNull();
    });

    it('should not activate on a plain Space', () => {
      const tree = build();
      key('Home');

      key(' ');

      expect(tree.get_selected()).toEqual([]);
    });

    it('should toggle the focused node into the selection on ctrl+Space', () => {
      const tree = build();
      click('a');
      key('ArrowDown');

      key(' ', { ctrlKey: true });

      expect([...tree.get_selected()].sort()).toEqual(['a', 'b']);
    });

    it('should not cut on ctrl+x', () => {
      const tree = build();
      key('Home');

      key('x', { ctrlKey: true });

      expect(tree.can_paste()).toBe(false);
    });

    it('should not copy on ctrl+c', () => {
      const tree = build();
      key('Home');

      key('c', { ctrlKey: true });

      expect(tree.can_paste()).toBe(false);
    });

    it('should not paste on ctrl+v', () => {
      const tree = build();
      tree.copy('a');
      key('Home');
      key('ArrowDown');

      key('v', { ctrlKey: true });

      expect(tree.getNode('b')!.children).toEqual([]);
    });

    it('should open every node on *', () => {
      const tree = build();
      key('Home');

      key('*');

      expect(tree.is_open('folder')).toBe(true);
    });

    it('should still start inline editing on F2', () => {
      build({ check_callback: true });
      key('Home');

      key('F2');

      expect(container.querySelector('.md-tree-rename-input')).not.toBeNull();
    });

    it('should open a closed node on Right and keep focus on it', () => {
      const tree = build();
      key('End');
      expect(focused()).toBe('folder');

      key('ArrowRight');

      expect(tree.is_open('folder')).toBe(true);
      expect(focused()).toBe('folder');
    });

    // jstree's get_next_dom / get_prev_dom walk past nodes with no rendered
    // height, so arrow navigation never lands on a hidden node.
    it('should skip hidden nodes moving down', () => {
      const tree = build();
      tree.hide_node('b');
      key('Home');

      key('ArrowDown');

      expect(focused()).toBe('folder');
    });

    it('should skip hidden nodes moving up', () => {
      const tree = build();
      tree.hide_node('b');
      key('End');

      key('ArrowUp');

      expect(focused()).toBe('a');
    });

    it('should skip hidden nodes in get_next_dom', () => {
      const tree = build();
      tree.hide_node('b');

      expect(tree.get_next_dom('a')!.id).toBe('folder');
    });

    it('should skip hidden nodes in get_prev_dom', () => {
      const tree = build();
      tree.hide_node('b');

      expect(tree.get_prev_dom('folder')!.id).toBe('a');
    });

    it('should not focus a descendant of a hidden node on End', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
            {
              id: 'folder',
              text: 'Folder',
              state: { opened: true },
              children: [{ id: 'deep', text: 'Deep' }],
            },
          ],
        },
      });
      tree.hide_node('folder');

      key('End');

      expect(focused()).toBe('b');
    });
  });

  describe('core.keyboard', () => {
    it('should disable every shortcut when false', () => {
      const tree = build({ keyboard: false });

      key('Home');
      key('Enter');

      expect(focused()).toBeNull();
      expect(tree.get_selected()).toEqual([]);
    });

    it('should add a custom shortcut alongside the defaults', () => {
      const tree = build({
        keyboard: {
          'ctrl-a': function (this: MDFolderTree) {
            this.select_all();
          },
        },
      });

      key('a', { ctrlKey: true });
      key('Home');

      expect(tree.get_selected().length).toBe(4);
      expect(focused()).toBe('a');
    });

    it('should call a custom shortcut with the tree as this and the event', () => {
      let receivedThis: unknown = null;
      let receivedEvent: unknown = null;
      const tree = build({
        keyboard: {
          'ctrl-q': function (this: unknown, e: KeyboardEvent) {
            receivedThis = this;
            receivedEvent = e;
          },
        },
      });

      const event = key('q', { ctrlKey: true });

      expect(receivedThis).toBe(tree);
      // As in jstree, whose handlers get a jQuery event, the native event is
      // its originalEvent, and its properties read through.
      expect((receivedEvent as { originalEvent: unknown }).originalEvent).toBe(event);
      expect((receivedEvent as KeyboardEvent).key).toBe('q');
      expect((receivedEvent as KeyboardEvent).ctrlKey).toBe(true);
    });

    it('should let a custom shortcut override a default', () => {
      const calls: string[] = [];
      const tree = build({ keyboard: { enter: () => { calls.push('custom'); } } });
      key('Home');

      key('Enter');

      expect(calls).toEqual(['custom']);
      expect(tree.get_selected()).toEqual([]);
    });

    it('should let null disable a single default', () => {
      const tree = build({ keyboard: { enter: null } });
      key('Home');

      key('Enter');

      expect(tree.get_selected()).toEqual([]);
      expect(focused()).toBe('a');
    });

    it('should match a combo regardless of modifier order', () => {
      const calls: string[] = [];
      build({ keyboard: { 'shift-ctrl-x': () => { calls.push('hit'); } } });

      key('x', { ctrlKey: true, shiftKey: true });

      expect(calls).toEqual(['hit']);
    });

    it('should prevent default when a shortcut returns false', () => {
      build({ keyboard: { 'ctrl-q': () => false } });

      const event = key('q', { ctrlKey: true });

      expect(event.defaultPrevented).toBe(true);
    });

    // Shortcuts earlier releases bound by default, restored the supported way.
    it('should let a consumer bind Delete to delete the focused node', () => {
      const tree = build({
        check_callback: true,
        keyboard: {
          delete: function (this: MDFolderTree) {
            const id = this.getContainer().getAttribute('aria-activedescendant');
            if (id) this.delete_node(id);
          },
        },
      });
      key('Home');

      key('Delete');

      expect(tree.getNode('a')).toBeNull();
    });

    it('should let a consumer bind ctrl+c to copy the selection', () => {
      const tree = build({
        keyboard: {
          'ctrl-c': function (this: MDFolderTree) {
            this.copy(this.get_selected());
          },
        },
      });
      click('a');

      key('c', { ctrlKey: true });

      // jstree's buffer: the mode is the operation paste will perform.
      expect(tree.get_buffer().mode).toBe('copy_node');
      expect(tree.get_buffer().ids).toEqual(['a']);
    });
  });

  describe('inline editing', () => {
    it('should not activate the node when Enter commits an edit', () => {
      const tree = build({ check_callback: true });
      key('Home');
      tree.edit('a');
      const input = container.querySelector('.md-tree-rename-input') as HTMLInputElement;
      input.value = 'Renamed';

      key('Enter', {}, input);

      expect(tree.get_text('a')).toBe('Renamed');
      expect(tree.get_selected()).toEqual([]);
    });
  });
  // jstree delegates keydown to the focused anchor, so a handler sees it as
  // the event's target and currentTarget, and gets a jQuery event carrying
  // the native one as originalEvent.
  describe('the event a handler receives', () => {
    const ctrlK = { ctrlKey: true, code: 'KeyK' };

    it('should present the focused anchor as currentTarget and target', () => {
      let seen: { node: unknown; target: unknown } | null = null;
      build({
        keyboard: {
          'ctrl-k': function (this: MDFolderTree, e: KeyboardEvent) {
            seen = { node: this.get_node(e.currentTarget as Element), target: e.target };
          },
        },
      });
      key('Home');
      key('ArrowDown');

      key('k', ctrlK);

      expect(seen).not.toBeNull();
      expect((seen!.node as { id: string }).id).toBe('b');
      expect(seen!.target).toBe(container.querySelector('#b > .md-tree-anchor'));
    });

    it('should carry the native event as originalEvent', () => {
      let original: unknown = null;
      build({
        keyboard: {
          'ctrl-k': (e: KeyboardEvent) => {
            original = (e as unknown as { originalEvent: unknown }).originalEvent;
          },
        },
      });
      key('Home');

      const event = key('k', ctrlK);

      expect(original).toBe(event);
    });

    it('should let a handler call the event methods', () => {
      build({
        keyboard: {
          'ctrl-k': (e: KeyboardEvent) => {
            e.preventDefault();
          },
        },
      });
      key('Home');

      const event = key('k', ctrlK);

      expect(event.defaultPrevented).toBe(true);
    });
  });
});
