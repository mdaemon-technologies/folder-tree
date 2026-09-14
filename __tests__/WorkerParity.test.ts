import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * core.worker parity with jstree 3.3.16: where Web Workers exist, JSON loads
 * are built in one — made from a Blob URL of the model builder's source —
 * so they complete asynchronously, one at a time. A worker that fails, or
 * data it cannot be sent, falls back to this thread; `core.worker: false`
 * never uses one. Destroying the tree revokes the worker's URL.
 *
 * jsdom has no Worker, so these tests supply one that runs the Blob's source
 * text, as a browser would.
 */
describe('core.worker parity', () => {
  let container: HTMLElement;
  let sources: Map<string, string>;
  let workers: Array<{ terminated: boolean }>;
  let revoked: string[];
  let failNext: 'error' | 'throw' | null;
  const saved: Record<string, unknown> = {};

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sources = new Map();
    workers = [];
    revoked = [];
    failNext = null;
    let next = 0;
    const g = globalThis as Record<string, unknown>;
    saved.Worker = g.Worker;
    saved.Blob = g.Blob;
    saved.create = URL.createObjectURL;
    saved.revoke = URL.revokeObjectURL;

    g.Blob = class {
      constructor(readonly parts: string[]) {}
    };
    URL.createObjectURL = ((blob: { parts: string[] }) => {
      const url = `blob:worker/${++next}`;
      sources.set(url, blob.parts.join(''));
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    g.Worker = class {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      terminated = false;
      private scope: { onmessage?: (e: { data: unknown }) => void; postMessage: (d: unknown) => void };
      constructor(url: string) {
        this.scope = { postMessage: (d) => setTimeout(() => this.onmessage?.({ data: d }), 0) };
        new Function('self', sources.get(url)!)(this.scope);
        workers.push(this);
      }
      postMessage(data: unknown): void {
        const mode = failNext;
        failNext = null;
        if (mode === 'throw') throw new Error('DataCloneError');
        if (mode === 'error') {
          setTimeout(() => this.onerror?.(new Error('worker failed')), 0);
          return;
        }
        const copy = JSON.parse(JSON.stringify(data));
        // A throw in the worker's script surfaces as an error event, as in a browser.
        setTimeout(() => {
          try {
            this.scope.onmessage!({ data: copy });
          } catch (error) {
            this.onerror?.(error);
          }
        }, 0);
      }
      terminate(): void {
        this.terminated = true;
      }
    };
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    const g = globalThis as Record<string, unknown>;
    g.Worker = saved.Worker;
    g.Blob = saved.Blob;
    URL.createObjectURL = saved.create as typeof URL.createObjectURL;
    URL.revokeObjectURL = saved.revoke as typeof URL.revokeObjectURL;
  });

  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1' }] },
    { id: 'b', text: 'B', state: { selected: true } },
  ];

  it('should build a JSON load in a worker, asynchronously', async () => {
    const tree = new MDFolderTree(container, { core: { data: data() } });

    expect(tree.get_node('a')).toBe(false);
    await settle();

    expect(workers).toHaveLength(1);
    expect([...sources.values()][0]).toContain('onmessage');
    expect((tree.get_node('a') as TreeNode).children).toEqual(['a1']);
    expect(tree.get_selected()).toEqual(['b']);
    expect(container.querySelector('#a1')).not.toBeNull();
  });

  it('should fire ready once the worker has built the tree', async () => {
    const tree = new MDFolderTree(container, { core: { data: data() } });
    let nodeAtReady: unknown = null;
    tree.on('ready.MDFolderTree', () => {
      nodeAtReady = tree.get_node('a');
    });

    await settle();

    expect(nodeAtReady).not.toBe(false);
    expect(nodeAtReady).not.toBeNull();
  });

  it('should load lazy nodes through the worker', async () => {
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
    await settle();
    const done = jest.fn();

    tree.load_node('lz', done);
    expect(done).not.toHaveBeenCalled();
    await settle();

    expect(done).toHaveBeenCalledWith(expect.objectContaining({ id: 'lz' }), true);
    expect((tree.get_node('lz') as TreeNode).children).toEqual(['k']);
  });

  it('should not use a worker with core.worker false', () => {
    const tree = new MDFolderTree(container, { core: { data: data(), worker: false } });

    expect(tree.get_node('a')).not.toBe(false);
    expect(workers).toHaveLength(0);
  });

  it('should fall back to this thread when the worker fails', async () => {
    failNext = 'error';
    const tree = new MDFolderTree(container, { core: { data: data() } });

    await settle();

    expect((tree.get_node('a') as TreeNode).children).toEqual(['a1']);
  });

  it('should fall back to this thread when the data cannot be sent', () => {
    failNext = 'throw';
    const tree = new MDFolderTree(container, { core: { data: data() } });

    expect(tree.get_node('a')).not.toBe(false);
  });

  it('should run one load at a time, finishing each', async () => {
    const tree = new MDFolderTree(container, {
      core: {
        data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
          callback(
            node.id === '#'
              ? [
                  { id: 'l1', text: 'L1', children: true } as unknown as TreeNodeData,
                  { id: 'l2', text: 'L2', children: true } as unknown as TreeNodeData,
                ]
              : [{ id: `${node.id}-k`, text: 'K' }],
          ),
      },
    } as never);
    await settle();
    const order: string[] = [];

    tree.load_node('l1', (n) => order.push(n.id));
    tree.load_node('l2', (n) => order.push(n.id));
    await settle();

    expect(order).toEqual(['l1', 'l2']);
    expect((tree.get_node('l2') as TreeNode).children).toEqual(['l2-k']);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('should drop a load whose node was deleted while it was in the worker', async () => {
    const tree = new MDFolderTree(container, {
      core: {
        check_callback: true,
        data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
          callback(
            node.id === '#'
              ? [{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData, { id: 'o', text: 'O' }]
              : [{ id: 'k', text: 'K', children: [{ id: 'k1', text: 'K1' }] }],
          ),
      },
    } as never);
    await settle();

    tree.load_node('lz');
    tree.delete_node('lz');
    await settle();

    expect(tree.get_node('k')).toBe(false);
    expect(tree.get_node('k1')).toBe(false);
    expect((tree.get_node('#') as TreeNode).children).toEqual(['o']);
  });

  it('should drop the subtree of a node whose id was taken while it was in the worker', async () => {
    const error = jest.fn();
    const tree = new MDFolderTree(container, { core: { data: data(), check_callback: true, error } });

    tree.create_node('#', { id: 'a', text: 'Mine' });
    await settle();

    expect(tree.get_text('a')).toBe('Mine');
    expect((tree.get_node('a') as TreeNode).children).toEqual([]);
    expect(tree.get_node('a1')).toBe(false);
    expect(tree.get_node('b')).not.toBe(false);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ error: 'duplicate_id', id: 'a' }));
  });

  it('should revoke the worker URL on destroy', async () => {
    const tree = new MDFolderTree(container, { core: { data: data() } });
    await settle();

    tree.destroy();

    expect(revoked).toEqual([...sources.keys()]);
  });
});
