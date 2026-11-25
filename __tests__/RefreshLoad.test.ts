import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';
import { delay } from './helpers/async';

describe('Refresh & Load', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const inst = MDFolderTree.getInstance(container);
    if (inst) inst.destroy();
    document.body.removeChild(container);
  });

  test('refresh reloads tree from static data', () => {
    const data: TreeNodeData[] = [
      { id: 'n1', text: 'Node 1' },
      { id: 'n2', text: 'Node 2' },
    ];
    const tree = new MDFolderTree(container, { core: { data } });

    tree.select_node('n1');
    tree.open_all();

    tree.refresh();

    // Nodes still exist
    expect(tree.get_node('n1')).not.toBe(false);
    expect(tree.get_node('n2')).not.toBe(false);
    // Selection is restored
    expect(tree.is_selected('n1')).toBe(true);
  });

  test('refresh emits refresh event', () => {
    const data: TreeNodeData[] = [{ id: 'n1', text: 'Node 1' }];
    const tree = new MDFolderTree(container, { core: { data } });

    const handler = vi.fn();
    container.addEventListener('refresh.MDFolderTree', handler);
    tree.refresh();
    expect(handler).toHaveBeenCalled();
  });

  test('load_node triggers callback for lazy data', async () => {
    const lazyData: Record<string, TreeNodeData[]> = {
      '#': [{ id: 'root', text: 'Root', children: true as unknown as TreeNodeData[] }],
      root: [
        { id: 'lazy-1', text: 'Lazy Child 1' },
        { id: 'lazy-2', text: 'Lazy Child 2' },
      ],
    };

    const tree = new MDFolderTree(container, {
      core: {
        data: (node: any, cb: (d: TreeNodeData[]) => void) => {
          setTimeout(() => cb(lazyData[node.id] ?? []), 10);
        },
      },
    });

    // Wait for initial load
    await delay(50);
    const status = await new Promise<boolean>((resolve) => tree.load_node('root', (_node, ok) => resolve(ok)));

    expect(status).toBe(true);
    expect(tree.get_node('lazy-1')).not.toBe(false);
    expect(tree.get_node('lazy-2')).not.toBe(false);
  });

  test('load_node returns true for an existing node even when static data cannot load it, as jstree does', () => {
    const tree = new MDFolderTree(container, {
      core: { data: [{ id: 'n1', text: 'Node' }] },
    });
    const callback = vi.fn();
    const result = tree.load_node('n1', callback);
    expect(result).toBe(true);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), false);
  });

  test('load_node emits load_node event', async () => {
    const lazyData: Record<string, TreeNodeData[]> = {
      '#': [{ id: 'root', text: 'Root', children: true as unknown as TreeNodeData[] }],
      root: [{ id: 'child1', text: 'Child 1' }],
    };

    const tree = new MDFolderTree(container, {
      core: {
        data: (node: any, cb: (d: TreeNodeData[]) => void) => {
          setTimeout(() => cb(lazyData[node.id] ?? []), 10);
        },
      },
    });

    const handler = vi.fn();
    container.addEventListener('load_node.MDFolderTree', handler);

    await delay(50);
    await new Promise<void>((resolve) => tree.load_node('root', () => resolve()));

    expect(handler).toHaveBeenCalled();
  });

  test('load_all loads all unloaded nodes', async () => {
    const tree = new MDFolderTree(container, {
      core: {
        data: (node: any, cb: (d: TreeNodeData[]) => void) => {
          if (node.id === '#') {
            setTimeout(() => cb([{ id: 'a', text: 'A', children: true as unknown as TreeNodeData[] }]), 10);
          } else {
            setTimeout(() => cb([{ id: `${node.id}-child`, text: `${node.id} child` }]), 10);
          }
        },
      },
    });

    const handler = vi.fn();
    container.addEventListener('load_all.MDFolderTree', handler);

    await delay(50);
    // As in jstree, the callback runs just before load_all is emitted.
    const emittedBeforeCallback = await new Promise<number>((resolve) =>
      tree.load_all(undefined, () => resolve(handler.mock.calls.length)));
    expect(emittedBeforeCallback).toBe(0);

    await delay();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(tree.get_node('a-child')).not.toBe(false);
  });

  describe('refresh with an async data callback', () => {
    const asyncTree = () => {
      let resolve: ((d: TreeNodeData[]) => void) | null = null;
      const tree = new MDFolderTree(container, {
        core: {
          data: (node, callback) => {
            if (node.id === '#') resolve = callback;
          },
        },
      });
      return { tree, deliver: (d: TreeNodeData[]) => resolve!(d) };
    };
    const payload: TreeNodeData[] = [
      { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1' }] },
      { id: 'b', text: 'B' },
    ];

    it('should restore the selection once the data arrives', () => {
      const { tree, deliver } = asyncTree();
      deliver(payload);
      tree.selectNode('a');

      tree.refresh();
      deliver(payload);

      expect(tree.get_selected()).toEqual(['a']);
    });

    it('should restore opened nodes once the data arrives', () => {
      const { tree, deliver } = asyncTree();
      deliver(payload);
      tree.openNode('a');

      tree.refresh();
      deliver(payload);

      expect(tree.is_open('a')).toBe(true);
    });

    it('should emit refresh only after the data arrives', () => {
      const { tree, deliver } = asyncTree();
      deliver(payload);

      let refreshed = 0;
      tree.on('refresh.MDFolderTree', () => { refreshed++; });
      tree.refresh();
      expect(refreshed).toBe(0);

      deliver(payload);
      expect(refreshed).toBe(1);
    });

    it('should not re-emit ready on refresh', () => {
      const { tree, deliver } = asyncTree();
      deliver(payload);

      let ready = 0;
      tree.on('ready.MDFolderTree', () => { ready++; });
      tree.refresh();
      deliver(payload);

      expect(ready).toBe(0);
    });

    it('should keep selection flags consistent after an async refresh', () => {
      const { tree, deliver } = asyncTree();
      deliver(payload);
      tree.selectNode('a');

      tree.refresh();
      deliver(payload);

      const flagged = tree.getAllNodes().filter((n) => n.state.selected).map((n) => n.id);
      expect(flagged).toEqual(tree.get_selected());
    });
  });
});