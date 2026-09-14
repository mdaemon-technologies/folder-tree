import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * refresh_node parity with jstree 3.3.16.
 *
 * refresh_node reloads the node, and every open node inside it, through
 * `core.data`; then reopens what was open, reselects what is still there, and
 * emits `refresh_node` with `{ node, nodes }`, where `nodes` are the ids that
 * reloaded. Reloading a loaded node first drops its descendants — emitting
 * `changed` with action `load_node` when any were selected.
 */
describe('refresh_node parity', () => {
  let container: HTMLElement;
  let server: Record<string, TreeNodeData[]>;
  let calls: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    calls = [];
    server = {
      '#': [{ id: 'p', text: 'P', children: true } as TreeNodeData],
      p: [
        { id: 'c1', text: 'C1', children: true } as TreeNodeData,
        { id: 'c2', text: 'C2' },
      ],
      c1: [{ id: 'g1', text: 'G1' }],
    };
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    container.remove();
  });

  const reply = (id: string): TreeNodeData[] => JSON.parse(JSON.stringify(server[id] ?? []));

  /** A tree over `server`, answered synchronously. */
  const build = () =>
    new MDFolderTree(container, {
      core: {
        check_callback: true,
        data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) => {
          calls.push(node.id);
          callback(reply(node.id));
        },
      },
    });

  /** Load and open p and c1. */
  const expand = (tree: MDFolderTree) => {
    tree.load_node('p');
    tree.open_node('p');
    tree.load_node('c1');
    tree.open_node('c1');
    calls = [];
  };

  it('should reload the node children from core.data', () => {
    const tree = build();
    expand(tree);
    server.p = [{ id: 'c3', text: 'C3' }];

    tree.refresh_node('p');

    expect((tree.get_node('p') as TreeNode).children).toEqual(['c3']);
    expect(tree.get_node('c1')).toBe(false);
    expect(container.querySelector('#c3')).not.toBeNull();
  });

  it('should reload open descendants and reopen them', () => {
    const tree = build();
    expand(tree);
    server.c1 = [{ id: 'g2', text: 'G2' }];

    tree.refresh_node('p');

    expect(calls).toEqual(['p', 'c1']);
    expect(tree.is_open('p')).toBe(true);
    expect(tree.is_open('c1')).toBe(true);
    expect((tree.get_node('c1') as TreeNode).children).toEqual(['g2']);
  });

  it('should not reload closed descendants', () => {
    const tree = build();
    expand(tree);
    tree.close_node('c1');

    tree.refresh_node('p');

    expect(calls).toEqual(['p']);
    expect((tree.get_node('c1') as TreeNode).state.loaded).toBe(false);
  });

  it('should reselect the selected nodes that still exist', () => {
    const tree = build();
    expand(tree);
    tree.select_node(['c2', 'g1']);
    server.c1 = [{ id: 'g2', text: 'G2' }];

    tree.refresh_node('p');

    expect(tree.get_selected()).toEqual(['c2']);
    expect(tree.is_selected('c2')).toBe(true);
  });

  it('should emit refresh_node with the node and the reloaded ids', () => {
    const tree = build();
    expand(tree);
    let detail: { node: TreeNode; nodes: string[] } | null = null;
    tree.on('refresh_node.MDFolderTree', (e) => {
      detail = e.detail as { node: TreeNode; nodes: string[] };
    });

    tree.refresh_node('p');

    expect(detail).not.toBeNull();
    expect(detail!.node.id).toBe('p');
    expect(detail!.nodes).toEqual(['p', 'c1']);
  });

  it('should wait for asynchronous loads before emitting refresh_node', () => {
    const pending: Array<() => void> = [];
    const tree = new MDFolderTree(container, {
      core: {
        data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) => {
          if (node.id === '#') {
            callback(reply('#'));
            return;
          }
          pending.push(() => callback(reply(node.id)));
        },
      },
    });
    const flush = () => {
      while (pending.length) pending.shift()!();
    };
    tree.load_node('p');
    flush();
    tree.open_node('p');
    tree.load_node('c1');
    flush();
    tree.open_node('c1');
    const refreshed = jest.fn();
    tree.on('refresh_node.MDFolderTree', refreshed);

    tree.refresh_node('p');
    expect(refreshed).not.toHaveBeenCalled();

    flush();

    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(tree.is_open('c1')).toBe(true);
    expect((tree.get_node('c1') as TreeNode).children).toEqual(['g1']);
  });

  it('should return false for the root or a missing node, and true otherwise', () => {
    const tree = build();
    expand(tree);

    expect(tree.refresh_node('#')).toBe(false);
    expect(tree.refresh_node('missing')).toBe(false);
    expect(tree.refresh_node('p')).toBe(true);
  });

  it('should complete when a descendant fails to load', () => {
    const tree = build();
    expand(tree);
    let detail: { nodes: string[] } | null = null;
    tree.on('refresh_node.MDFolderTree', (e) => {
      detail = e.detail as { nodes: string[] };
    });
    const original = server.c1;
    Object.defineProperty(server, 'c1', {
      get: () => {
        throw new Error('offline');
      },
      configurable: true,
    });

    tree.refresh_node('p');

    Object.defineProperty(server, 'c1', { value: original, configurable: true, writable: true });
    expect(detail).not.toBeNull();
    expect(detail!.nodes).toEqual(['p']);
  });

  describe('open_node on a lazy node whose load fails', () => {
    it('should give up after one attempt and stay closed, as jstree does', () => {
      let attempts = 0;
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              callback(reply('#'));
              return;
            }
            attempts++;
            throw new Error('offline');
          },
        },
      });

      tree.open_node('p');

      expect(attempts).toBe(1);
      expect(tree.is_open('p')).toBe(false);
    });
  });

  describe('load_node on a loaded node', () => {
    it('should drop its descendants when the reload starts', () => {
      const pending: Array<() => void> = [];
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              callback(reply('#'));
              return;
            }
            pending.push(() => callback(reply(node.id)));
          },
        },
      });
      tree.load_node('p');
      pending.shift()!();
      tree.select_node('c2');
      const changed = jest.fn();
      tree.on('changed.MDFolderTree', changed);

      tree.load_node('p');

      expect(tree.get_node('c2')).toBe(false);
      expect(tree.get_selected()).toEqual([]);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed.mock.calls[0][0].detail.action).toBe('load_node');
    });
  });
});
