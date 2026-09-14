import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * State parity with jstree 3.3.16.
 *
 * get_state() reports `{ core: { open, loaded, scroll, selected } }` —
 * `loaded` only with core.loaded_state — plus `checkbox` while checking is not
 * tied to selection. set_state() applies it step by step, loading nodes before
 * opening them, never closing what is open, replacing the selection, then
 * calling back and emitting set_state.
 *
 * The state plugin saves `{ state, ttl, sec }` under `state.key` ('jstree')
 * 100ms after a change — without core.loaded unless preserve_loaded — and
 * restores once the tree is ready: ignoring a state older than its ttl,
 * passing it through `filter` (the tree as `this`), then emitting
 * restore_state, and state_ready as saving starts.
 */
describe('State parity', () => {
  let container: HTMLElement;
  let storage: Record<string, string>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    storage = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          storage = {};
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'A', text: 'A', children: [{ id: 'a1', text: 'a1' }] },
    { id: 'B', text: 'B', children: [{ id: 'b1', text: 'b1' }] },
  ];

  describe('get_state', () => {
    it("should report jstree's shape", () => {
      const tree = new MDFolderTree(container, { core: { data: data() } });
      tree.open_node('A');
      tree.select_node('a1');

      expect(tree.get_state()).toEqual({
        core: { open: ['A'], loaded: [], scroll: { left: 0, top: 0 }, selected: ['a1'] },
      });
    });

    it('should list the loaded nodes with core.loaded_state', () => {
      const tree = new MDFolderTree(container, { core: { data: data(), loaded_state: true } });

      expect(tree.get_state().core!.loaded).toEqual(expect.arrayContaining(['A', 'a1', 'B', 'b1']));
    });

    it('should add the checked nodes while checking is not tied to selection', () => {
      const tree = new MDFolderTree(container, {
        core: { data: data() },
        plugins: ['checkbox'],
        checkbox: { tie_selection: false },
      });
      tree.check_node('b1');

      expect([...(tree.get_state().checkbox as string[])].sort()).toEqual(['B', 'b1']);
    });
  });

  describe('set_state', () => {
    it('should open and select without closing what is already open', () => {
      const tree = new MDFolderTree(container, { core: { data: data() } });
      tree.open_node('A');

      tree.set_state({ core: { open: ['B'], selected: ['b1'] } });

      expect(tree.is_open('A')).toBe(true);
      expect(tree.is_open('B')).toBe(true);
      expect(tree.get_selected()).toEqual(['b1']);
    });

    it('should load lazy nodes before opening them', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
            callback(
              node.id === '#'
                ? [{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData]
                : [{ id: 'k', text: 'K' }],
            ),
        },
      } as never);

      tree.set_state({ core: { open: ['lz'] } });

      expect(tree.is_loaded('lz')).toBe(true);
      expect(tree.is_open('lz')).toBe(true);
    });

    it('should restore the checked nodes while checking is not tied to selection', () => {
      const tree = new MDFolderTree(container, {
        core: { data: data() },
        plugins: ['checkbox'],
        checkbox: { tie_selection: false, three_state: false },
      });
      tree.check_node('a1');

      tree.set_state({ checkbox: ['b1'] });

      expect(tree.is_checked('a1')).toBe(false);
      expect(tree.is_checked('b1')).toBe(true);
    });

    it('should call back and emit set_state once done', () => {
      const tree = new MDFolderTree(container, { core: { data: data() } });
      const order: string[] = [];
      tree.on('set_state.MDFolderTree', () => order.push('event'));

      tree.set_state({ core: { open: ['A'] } }, () => order.push('callback'));

      expect(order).toEqual(['callback', 'event']);
    });

    it('should still accept the { opened, selected } shape of earlier releases', () => {
      const tree = new MDFolderTree(container, { core: { data: data() } });

      tree.set_state({ opened: ['B'], selected: ['b1'] });

      expect(tree.is_open('B')).toBe(true);
      expect(tree.get_selected()).toEqual(['b1']);
    });
  });

  describe('state plugin', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['queueMicrotask'] }));
    afterEach(() => jest.useRealTimers());

    const ready = () => Promise.resolve();
    const stateTree = (state: Record<string, unknown> = {}, core: Record<string, unknown> = {}) =>
      new MDFolderTree(container, { core: { data: data(), ...core }, plugins: ['state'], state } as never);

    it("should save get_state as { state, ttl, sec } under 'jstree', 100ms after a change", async () => {
      const tree = stateTree();
      await ready();

      tree.select_node('a1');
      expect(storage.jstree).toBeUndefined();
      jest.advanceTimersByTime(100);

      const saved = JSON.parse(storage.jstree);
      expect(saved.state.core.selected).toEqual(['a1']);
      expect(saved.ttl).toBe(false);
      expect(typeof saved.sec).toBe('number');
    });

    it('should drop core.loaded unless preserve_loaded', async () => {
      const tree = stateTree({}, { loaded_state: true });
      await ready();
      tree.select_node('a1');
      jest.advanceTimersByTime(100);
      expect('loaded' in JSON.parse(storage.jstree).state.core).toBe(false);
      tree.destroy();

      const keeping = stateTree({ preserve_loaded: true }, { loaded_state: true });
      await ready();
      keeping.select_node('b1');
      jest.advanceTimersByTime(100);
      expect(JSON.parse(storage.jstree).state.core.loaded).toEqual(expect.arrayContaining(['A', 'B']));
    });

    it('should restore a state jstree saved', async () => {
      storage.jstree = JSON.stringify({
        state: { core: { open: ['A'], scroll: { left: 0, top: 0 }, selected: ['a1'] } },
        ttl: false,
        sec: Date.now(),
      });
      const tree = stateTree();

      await ready();

      expect(tree.is_open('A')).toBe(true);
      expect(tree.get_selected()).toEqual(['a1']);
    });

    it('should ignore a state older than its ttl, leaving it stored', async () => {
      storage.jstree = JSON.stringify({ state: { core: { open: ['A'] } }, ttl: 1000, sec: Date.now() - 5000 });
      const tree = stateTree();

      await ready();

      expect(tree.is_open('A')).toBe(false);
      expect(storage.jstree).toBeDefined();
    });

    it('should pass the stored state through filter, with the tree as this', async () => {
      storage.jstree = JSON.stringify({ state: { core: { open: ['A'], selected: ['a1'] } }, ttl: false, sec: Date.now() });
      let self: unknown = null;
      const tree = stateTree({
        filter: function (this: unknown, state: { core: { selected: string[] } }) {
          self = this;
          state.core.selected = [];
          return state;
        },
      });

      await ready();

      expect(self).toBe(tree);
      expect(tree.is_open('A')).toBe(true);
      expect(tree.get_selected()).toEqual([]);
    });

    it('should emit restore_state, then state_ready as saving starts', async () => {
      storage.jstree = JSON.stringify({ state: { core: { open: ['A'] } }, ttl: false, sec: Date.now() });
      const order: string[] = [];
      container.addEventListener('restore_state.MDFolderTree', () => order.push('restore_state'));
      container.addEventListener('state_ready.MDFolderTree', () => order.push('state_ready'));
      stateTree();

      await ready();

      expect(order).toEqual(['restore_state', 'state_ready']);
    });
  });
});
