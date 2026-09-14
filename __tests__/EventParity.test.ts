import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Event parity with jstree 3.3.16.
 *
 * open_all / close_all work below a node through open_node / close_node, so
 * every node's own events fire (open_all loading lazy nodes on the way), then
 * emit `{ node }`. open_node / close_node on a node already open / closed
 * return false and emit nothing. hide_all / show_all report the ids they
 * changed. `init` and `destroy` bracket the tree's life.
 */
describe('Event parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const data = (): TreeNodeData[] => [
    {
      id: 'p',
      text: 'P',
      children: [{ id: 'q', text: 'Q', children: [{ id: 'k', text: 'K' }] }],
    },
    { id: 'r', text: 'R', children: [{ id: 's', text: 'S' }] },
    { id: 'leaf', text: 'Leaf' },
  ];

  const build = () => new MDFolderTree(container, { core: { data: data() } });

  const record = (tree: MDFolderTree, ...names: string[]) => {
    const seen: Array<[string, unknown]> = [];
    for (const name of names) tree.on(`${name}.MDFolderTree`, (e) => seen.push([name, e.detail]));
    return seen;
  };

  const nodeOf = (detail: unknown) => (detail as { node: TreeNode }).node.id;

  describe('open_all', () => {
    it('should open every closed node through open_node, then emit open_all with the node', () => {
      const tree = build();
      const seen = record(tree, 'open_node', 'open_all');

      tree.open_all();

      expect(['p', 'q', 'r'].every((id) => tree.is_open(id))).toBe(true);
      expect(seen.filter(([n]) => n === 'open_node').map(([, d]) => nodeOf(d)).sort()).toEqual(['p', 'q', 'r']);
      expect(seen[seen.length - 1][0]).toBe('open_all');
      expect(nodeOf(seen[seen.length - 1][1])).toBe('#');
    });

    it('should open only the nodes below the one it is given', () => {
      const tree = build();

      tree.open_all('p');

      expect(tree.is_open('p')).toBe(true);
      expect(tree.is_open('q')).toBe(true);
      expect(tree.is_open('r')).toBe(false);
    });

    it('should load lazy nodes and open what they load', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
            callback(
              node.id === '#'
                ? [{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData]
                : node.id === 'lz'
                  ? [{ id: 'inner', text: 'Inner', children: true } as unknown as TreeNodeData]
                  : [{ id: 'bottom', text: 'Bottom' }],
            ),
        },
      } as never);

      tree.open_all();

      expect(tree.is_open('lz')).toBe(true);
      expect(tree.is_open('inner')).toBe(true);
      expect(tree.get_node('bottom')).not.toBe(false);
    });
  });

  describe('close_all', () => {
    it('should close every open node through close_node, then emit close_all with the node', () => {
      const tree = build();
      tree.open_all();
      const seen = record(tree, 'close_node', 'close_all');

      tree.close_all();

      expect(['p', 'q', 'r'].some((id) => tree.is_open(id))).toBe(false);
      expect(seen.filter(([n]) => n === 'close_node').map(([, d]) => nodeOf(d)).sort()).toEqual(['p', 'q', 'r']);
      expect(seen[seen.length - 1][0]).toBe('close_all');
    });

    it('should close only the nodes below the one it is given', () => {
      const tree = build();
      tree.open_all();

      tree.close_all('p');

      expect(tree.is_open('p')).toBe(false);
      expect(tree.is_open('q')).toBe(false);
      expect(tree.is_open('r')).toBe(true);
    });
  });

  describe('open_node / close_node on a node already in that state', () => {
    it('should return false and emit nothing from open_node on an open node', () => {
      const tree = build();
      tree.open_node('p');
      const seen = record(tree, 'before_open', 'open_node', 'after_open');

      expect(tree.open_node('p')).toBe(false);
      expect(seen).toEqual([]);
    });

    it('should return false and emit nothing from close_node on a closed node', () => {
      const tree = build();
      const seen = record(tree, 'close_node', 'after_close');

      expect(tree.close_node('p')).toBe(false);
      expect(seen).toEqual([]);
    });

    it('should call back with the node and whether open_node opened it', () => {
      const tree = build();
      const callback = jest.fn();

      tree.open_node('p', callback);
      tree.open_node('p', callback);

      expect(callback.mock.calls.map(([node, status]) => [(node as TreeNode).id, status])).toEqual([
        ['p', true],
        ['p', false],
      ]);
    });
  });

  describe('hide_all / show_all', () => {
    it('should report the ids they changed', () => {
      const tree = build();
      tree.hide_node('leaf');
      const seen = record(tree, 'hide_all', 'show_all');

      const hidden = tree.hide_all();
      const shown = tree.show_all();

      expect([...(hidden as string[])].sort()).toEqual(['k', 'p', 'q', 'r', 's']);
      expect([...(shown as string[])].sort()).toEqual(['k', 'leaf', 'p', 'q', 'r', 's']);
      expect(seen.map(([n, d]) => [n, [...(d as { nodes: string[] }).nodes].sort()])).toEqual([
        ['hide_all', ['k', 'p', 'q', 'r', 's']],
        ['show_all', ['k', 'leaf', 'p', 'q', 'r', 's']],
      ]);
    });
  });

  describe('init and destroy', () => {
    it('should emit init during construction, before loading', () => {
      const seen: string[] = [];
      for (const name of ['init', 'loading']) {
        container.addEventListener(`${name}.MDFolderTree`, () => seen.push(name));
      }

      build();

      expect(seen).toEqual(['init', 'loading']);
    });

    it('should emit destroy before tearing down, while the nodes are still there', () => {
      const tree = build();
      let nodeAtDestroy: unknown = null;
      tree.on('destroy.MDFolderTree', () => {
        nodeAtDestroy = tree.get_node('p');
      });

      tree.destroy();

      expect(nodeAtDestroy).not.toBe(false);
      expect(nodeAtDestroy).not.toBeNull();
    });
  });

  describe('restore_state', () => {
    it('should emit restore_state with the state once the state plugin has applied it', async () => {
      const stored: Record<string, string> = {
        'event-parity-state': JSON.stringify({ state: { opened: ['p'], selected: ['leaf'] } }),
      };
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: (key: string) => stored[key] ?? null,
          setItem: (key: string, value: string) => {
            stored[key] = value;
          },
          removeItem: (key: string) => {
            delete stored[key];
          },
          clear: () => undefined,
        },
        writable: true,
        configurable: true,
      });
      let detail: unknown = null;
      let openAtRestore: boolean | null = null;
      container.addEventListener('restore_state.MDFolderTree', (e) => {
        detail = (e as CustomEvent).detail;
        openAtRestore = MDFolderTree.getInstance(container)!.is_open('p');
      });

      new MDFolderTree(container, {
        core: { data: data() },
        plugins: ['state'],
        state: { key: 'event-parity-state' },
      });
      await Promise.resolve();

      expect(detail).toEqual({ state: { opened: ['p'], selected: ['leaf'] } });
      expect(openAtRestore).toBe(true);
    });
  });
});
