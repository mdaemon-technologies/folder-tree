import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Massload plugin parity with jstree 3.3.16. `massload` is a function called
 * with the tree as `this`, the ids to load and a callback taking a map of id
 * to children (JSON, or an HTML string). It batches the multi-node loads —
 * load_node with an array, refresh_node — while a single load_node goes
 * straight to core.data, as in jstree. A node the answer leaves out loads
 * through core.data.
 */
describe('Massload parity', () => {
  let container: HTMLElement;
  let dataCalls: string[];
  let massCalls: string[][];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dataCalls = [];
    massCalls = [];
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const lazy = (id: string): TreeNodeData => ({ id, text: id.toUpperCase(), children: true }) as unknown as TreeNodeData;

  const build = (answer: (ids: string[]) => Record<string, TreeNodeData[] | string>, self?: { seen: unknown }) =>
    new MDFolderTree(container, {
      core: {
        data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) => {
          if (node.id === '#') {
            callback([lazy('lz1'), lazy('lz2')]);
            return;
          }
          dataCalls.push(node.id);
          callback([{ id: `${node.id}-fallback`, text: 'Fallback' }]);
        },
      },
      plugins: ['massload'],
      massload: function (this: unknown, ids: string[], callback: (d: Record<string, unknown>) => void) {
        if (self) self.seen = this;
        massCalls.push([...ids]);
        callback(answer(ids));
      },
    } as never);

  const kids = (tree: MDFolderTree, id: string) => (tree.get_node(id) as TreeNode).children;

  it('should load an array of nodes through one massload call', () => {
    const tree = build(() => ({ lz1: [{ id: 'a1', text: 'A1' }], lz2: [{ id: 'a2', text: 'A2' }] }));

    tree.load_node(['lz1', 'lz2']);

    expect(massCalls).toEqual([['lz1', 'lz2']]);
    expect(dataCalls).toEqual([]);
    expect(kids(tree, 'lz1')).toEqual(['a1']);
    expect(kids(tree, 'lz2')).toEqual(['a2']);
  });

  it('should load a node the answer leaves out through core.data', () => {
    const tree = build(() => ({ lz1: [{ id: 'a1', text: 'A1' }] }));

    tree.load_node(['lz1', 'lz2']);

    expect(kids(tree, 'lz1')).toEqual(['a1']);
    expect(dataCalls).toEqual(['lz2']);
    expect(kids(tree, 'lz2')).toEqual(['lz2-fallback']);
  });

  it('should accept HTML strings in the answer', () => {
    const tree = build(() => ({ lz1: '<li id="h1">H1</li>', lz2: [] }));

    tree.load_node(['lz1', 'lz2']);

    expect(kids(tree, 'lz1')).toEqual(['h1']);
  });

  it('should call massload with the tree as this', () => {
    const self = { seen: null as unknown };
    const tree = build(() => ({}), self);

    tree.load_node(['lz1']);

    expect(self.seen).toBe(tree);
  });

  it('should not use massload for a single load_node', () => {
    const tree = build(() => ({}));

    tree.load_node('lz1');

    expect(massCalls).toEqual([]);
    expect(dataCalls).toEqual(['lz1']);
  });

  it('should batch the reloads of refresh_node', () => {
    const tree = build(() => ({ lz1: [lazy('inner')], inner: [{ id: 'deep', text: 'Deep' }] }));
    tree.load_node(['lz1']);
    tree.open_node('lz1');
    tree.load_node(['inner']);
    tree.open_node('inner');
    massCalls = [];

    tree.refresh_node('lz1');

    expect(massCalls[0]).toEqual(['lz1', 'inner']);
  });

  // jstree's load_all loads through _load_nodes — so massload batches it —
  // and again for whatever those loads reveal.
  describe('load_all', () => {
    it('should load every unloaded node below, including what the loads reveal', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
            callback(
              node.id === '#' ? [lazy('l1')] : node.id === 'l1' ? [lazy('l2')] : [{ id: 'bottom', text: 'Bottom' }],
            ),
        },
      } as never);
      const events: string[] = [];
      tree.on('load_all.MDFolderTree', (e) => events.push((e.detail as { node: TreeNode }).node.id));
      const callback = jest.fn();

      tree.load_all(undefined, callback);

      expect(tree.is_loaded('l2')).toBe(true);
      expect(tree.get_node('bottom')).not.toBe(false);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: '#' }));
      expect(events).toEqual(['#']);
    });

    it('should batch its loads through massload', () => {
      const tree = build(() => ({ lz1: [], lz2: [] }));

      tree.load_all();

      expect(massCalls).toEqual([['lz1', 'lz2']]);
      expect(dataCalls).toEqual([]);
    });

    it('should finish when a node fails to load', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              callback([lazy('bad')]);
              return;
            }
            throw new Error('offline');
          },
        },
      } as never);
      const callback = jest.fn();

      tree.load_all(undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
