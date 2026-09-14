import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * load_node parity with jstree 3.3.16.
 *
 * load_node returns true for any node that exists and reports the outcome as
 * `status` — in the `load_node` event and to the callback. A data function is
 * called with the tree as `this` and may answer `false` to fail. Static data
 * only loads the root: any other node fails, reporting `core_05` when
 * `core.data` is an array. Without data, the root re-reads the container's
 * original HTML. Given an array, load_node loads what is not yet loaded and
 * calls back once with the ids that loaded.
 */
describe('load_node parity', () => {
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

  const lazy = (id: string): TreeNodeData => ({ id, text: id.toUpperCase(), children: true }) as unknown as TreeNodeData;
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  describe('static data', () => {
    const staticTree = (errors: unknown[] = []) =>
      new MDFolderTree(container, {
        core: {
          check_callback: true,
          error: (e) => errors.push(e),
          data: [{ id: 'a', text: 'A', children: [{ id: 'b', text: 'B' }] }, { id: 'c', text: 'C' }],
        },
      });

    it('should return true and fail through the callback for a non-root node', () => {
      const tree = staticTree();
      const callback = jest.fn();

      expect(tree.load_node('a', callback)).toBe(true);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false);
      const a = tree.get_node('a') as TreeNode;
      expect(a.children).toEqual([]);
      expect(tree.get_node('b')).toBe(false);
      expect(a.state.loaded).toBe(false);
      expect(a.state.failed).toBe(true);
    });

    it('should report core_05 for a non-root node', () => {
      const errors: unknown[] = [];
      const tree = staticTree(errors);

      tree.load_node('a');

      const expected = {
        error: 'nodata',
        plugin: 'core',
        id: 'core_05',
        reason: 'Could not load node',
        data: JSON.stringify({ id: 'a' }),
      };
      expect(errors).toContainEqual(expected);
      expect(tree.last_error()).toEqual(expected);
    });

    it('should reload the root from core.data', () => {
      const tree = staticTree();
      tree.delete_node('a');
      const callback = jest.fn();

      expect(tree.load_node('#', callback)).toBe(true);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: '#' }), true);
      expect(tree.get_node('a')).not.toBe(false);
      expect(tree.get_node('b')).not.toBe(false);
      expect(container.querySelector('#a')).not.toBeNull();
    });

    it('should keep an unloaded node closed when opening it fails, reporting core_05', () => {
      const errors: unknown[] = [];
      const tree = new MDFolderTree(container, {
        core: { error: (e) => errors.push(e), data: [lazy('a')] },
      });

      tree.open_node('a');

      expect(tree.is_open('a')).toBe(false);
      expect(errors).toContainEqual(expect.objectContaining({ id: 'core_05' }));
    });
  });

  describe('HTML trees', () => {
    const htmlTree = (errors: unknown[] = []) => {
      container.innerHTML = '<ul><li id="a">A<ul><li id="b">B</li></ul></li><li id="c">C</li></ul>';
      return new MDFolderTree(container, { core: { check_callback: true, error: (e) => errors.push(e) } });
    };

    it('should fail a non-root node without reporting an error', () => {
      const errors: unknown[] = [];
      const tree = htmlTree(errors);
      const callback = jest.fn();

      tree.load_node('a', callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false);
      expect(errors).toEqual([]);
    });

    it('should reload the root from the original HTML', () => {
      const tree = htmlTree();
      tree.delete_node('a');

      tree.load_node('#');

      expect(tree.get_node('a')).not.toBe(false);
      expect(tree.get_node('b')).not.toBe(false);
      expect(container.querySelector('#a')).not.toBeNull();
    });
  });

  describe('data functions', () => {
    let calls: string[];
    let roots: TreeNodeData[];
    let answers: Record<string, TreeNodeData[] | false>;

    beforeEach(() => {
      calls = [];
      roots = [lazy('x'), lazy('y')];
      answers = { x: [{ id: 'x1', text: 'X1' }], y: [{ id: 'y1', text: 'Y1' }] };
    });

    const fnTree = () =>
      new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[] | false) => void) => {
            calls.push(node.id);
            callback(copy(node.id === '#' ? roots : answers[node.id] ?? []));
          },
        },
      } as never);

    it('should emit load_node with status true on success', () => {
      const tree = fnTree();
      const seen: Array<{ node: TreeNode; status: boolean }> = [];
      tree.on('load_node.MDFolderTree', (e) => seen.push(e.detail as { node: TreeNode; status: boolean }));

      tree.load_node('x');

      expect(seen).toHaveLength(1);
      expect(seen[0].node.id).toBe('x');
      expect(seen[0].status).toBe(true);
    });

    it('should treat an answer of false as a failed load, emitting status false', () => {
      answers.x = false;
      const tree = fnTree();
      const statuses: boolean[] = [];
      tree.on('load_node.MDFolderTree', (e) => statuses.push((e.detail as { status: boolean }).status));
      const callback = jest.fn();

      tree.load_node('x', callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }), false);
      expect(statuses).toEqual([false]);
      const x = tree.get_node('x') as TreeNode;
      expect(x.state.loaded).toBe(false);
      expect(x.state.failed).toBe(true);
    });

    it('should reload the root through the data function', () => {
      const tree = fnTree();
      roots = [{ id: 'z', text: 'Z' }];

      tree.load_node('#');

      expect(tree.get_node('x')).toBe(false);
      expect(tree.get_node('z')).not.toBe(false);
      expect(container.querySelector('#z')).not.toBeNull();
    });

    it('should call the data function with the tree as this', () => {
      const seen: unknown[] = [];
      const tree = new MDFolderTree(container, {
        core: {
          data: function (this: unknown, node: TreeNode, callback: (d: TreeNodeData[]) => void) {
            seen.push(this);
            callback(node.id === '#' ? [lazy('x')] : []);
          },
        },
      } as never);

      tree.load_node('x');

      expect(seen).toHaveLength(2);
      expect(seen.every((t) => t === tree)).toBe(true);
    });

    it('should load an array of nodes and call back once with the loaded ids', () => {
      const tree = fnTree();
      const callback = jest.fn();

      expect(tree.load_node(['x', 'y'], callback)).toBe(true);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(['x', 'y']);
    });

    it('should not reload the already loaded nodes of an array', () => {
      const tree = fnTree();
      tree.load_node('x');
      calls = [];

      tree.load_node(['x', 'y']);

      expect(calls).toEqual(['y']);
    });

    it('should load an empty tree when the data function answers false for the root', () => {
      let tree: MDFolderTree | undefined;

      expect(() => {
        tree = new MDFolderTree(container, {
          core: { data: (_node: TreeNode, callback: (d: false) => void) => callback(false) },
        } as never);
      }).not.toThrow();
      expect(tree!.get_json()).toEqual([]);
    });
  });
});

/**
 * A data function may answer with an HTML string, which jstree parses as
 * markup (`_append_html_data`): the items of a top-level `<ul>`, otherwise
 * every top-level element.
 */
describe('load_node HTML responses', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const htmlTree = (answers: Record<string, string>) =>
    new MDFolderTree(container, {
      core: {
        data: (node: TreeNode, callback: (d: string) => void) => callback(answers[node.id] ?? ''),
      },
    } as never);

  it('should load children from an HTML string of <li> elements', () => {
    const tree = htmlTree({
      '#': '<li id="p" class="md-tree-closed">P</li>',
      p: '<li id="h1">H1</li><li id="h2" class="md-tree-closed"><a>H2</a></li>',
    });

    tree.load_node('p');

    expect((tree.get_node('p') as TreeNode).children).toEqual(['h1', 'h2']);
    expect(tree.get_text('h2')).toBe('H2');
    expect(tree.is_loaded('h2')).toBe(false);
  });

  it('should load the items of a <ul> in an HTML string', () => {
    const tree = htmlTree({ '#': '<ul><li id="a"><a>A</a></li><li id="b"><a>B</a></li></ul>' });

    expect(tree.get_json().map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('should render a root loaded from an HTML string', () => {
    htmlTree({ '#': '<li id="r1">R1</li>' });

    expect(container.querySelector('#r1')).not.toBeNull();
  });
});
