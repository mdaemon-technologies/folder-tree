import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Node-reference parity with jstree 3.3.16.
 *
 * Every jstree method that takes a node accepts it in any form `get_node`
 * understands: a node object, a plain object with an `id`, an id, a
 * '#'-prefixed id, a jQuery-style wrapper, any DOM element inside a node, or
 * the container itself (the root). Twenty-five
 * of those methods also accept an array of such references.
 *
 * The idiom this matters most for is passing `data.node` from an event
 * straight back into the API — which previously did nothing at all.
 */
describe('Node references', () => {
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
    {
      id: 'folder',
      text: 'Folder',
      state: { opened: true },
      children: [{ id: 'deep', text: 'Deep' }],
    },
  ];

  const build = (rest: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, check_callback: true }, ...rest });

  const el = (selector: string) => container.querySelector(selector) as HTMLElement;
  const node = (tree: MDFolderTree, id: string) => tree.get_node(id) as TreeNode;
  const sorted = (ids: string[]) => [...ids].sort();

  describe('get_node', () => {
    it('should resolve a node object', () => {
      const tree = build();
      const a = node(tree, 'a');

      expect(tree.get_node(a)).toBe(a);
    });

    it('should resolve a plain object carrying an id', () => {
      const tree = build();

      expect((tree.get_node({ id: 'a' }) as TreeNode).id).toBe('a');
    });

    it('should resolve a "#"-prefixed id', () => {
      const tree = build();

      expect((tree.get_node('#a') as TreeNode).id).toBe('a');
    });

    it('should resolve a numeric id', () => {
      const tree = new MDFolderTree(container, { core: { data: [{ id: '5', text: 'Five' }] } });

      expect((tree.get_node(5) as TreeNode).id).toBe('5');
    });

    it('should resolve the node element itself', () => {
      const tree = build();

      expect((tree.get_node(el('#a')) as TreeNode).id).toBe('a');
    });

    it('should resolve any element inside a node', () => {
      const tree = build();

      expect((tree.get_node(el('#deep > .md-tree-anchor span')) as TreeNode).id).toBe('deep');
    });

    it('should not treat a missing id as a CSS selector', () => {
      const tree = build({ core: { data, check_callback: true } });
      tree.delete_node('a');

      // 'a' is also a tag name matching every anchor; it must not resolve.
      expect(tree.get_node('a')).toBe(false);
    });

    it('should resolve a jQuery-style wrapper', () => {
      const tree = build();
      const wrapper = { 0: el('#b'), length: 1 };

      expect((tree.get_node(wrapper) as TreeNode).id).toBe('b');
    });

    it('should resolve the container to the root', () => {
      const tree = build();

      expect((tree.get_node(container) as TreeNode).id).toBe('#');
    });

    it('should resolve "#" to the root', () => {
      const tree = build();

      expect((tree.get_node('#') as TreeNode).id).toBe('#');
    });

    it('should return false for an unknown node, as jstree does', () => {
      const tree = build();

      expect(tree.get_node('nope')).toBe(false);
    });

    it('should return the node element when as_dom is set', () => {
      const tree = build();

      expect(tree.get_node({ id: 'a' }, true)).toBe(el('#a'));
    });

    it('should return the container for the root when as_dom is set', () => {
      const tree = build();

      expect(tree.get_node('#', true)).toBe(container);
    });
  });

  describe('methods accept node objects and elements', () => {
    it('should select a node passed as an object', () => {
      const tree = build();

      tree.select_node(node(tree, 'a'));

      expect(tree.is_selected('a')).toBe(true);
    });

    it('should accept the node from an event payload', () => {
      const tree = build();
      let fromEvent: TreeNode | null = null;
      tree.on('select_node.MDFolderTree', (e) => {
        fromEvent = (e.detail as { node: TreeNode }).node;
      });
      tree.select_node('a');

      tree.deselect_node(fromEvent!);

      expect(tree.get_selected()).toEqual([]);
    });

    it('should accept an element for is_selected', () => {
      const tree = build();
      tree.select_node('a');

      expect(tree.is_selected(el('#a'))).toBe(true);
    });

    it('should accept an element for get_text', () => {
      const tree = build();

      expect(tree.get_text(el('#a > .md-tree-anchor span'))).toBe('A');
    });

    it('should accept node objects for both node and parent in move_node', () => {
      const tree = build();

      tree.move_node(node(tree, 'b'), node(tree, 'folder'));

      expect(node(tree, 'b').parent).toBe('folder');
    });

    it('should accept a node object as the create_node parent', () => {
      const tree = build();

      tree.create_node(node(tree, 'folder'), { id: 'fresh', text: 'Fresh' });

      expect(node(tree, 'fresh').parent).toBe('folder');
    });

    it('should accept a node object for delete_node', () => {
      const tree = build();

      tree.delete_node(node(tree, 'b'));

      expect(tree.get_node('b')).toBe(false);
    });

    it('should accept a node object for rename_node', () => {
      const tree = build();

      tree.rename_node(node(tree, 'a'), 'Renamed');

      expect(tree.get_text('a')).toBe('Renamed');
    });
  });

  describe('array-capable methods', () => {
    it('should select every node in an array', () => {
      const tree = build();

      tree.select_node(['a', 'b']);

      expect(sorted(tree.get_selected())).toEqual(['a', 'b']);
    });

    it('should deselect every node in an array', () => {
      const tree = build();
      tree.select_node(['a', 'b']);

      tree.deselect_node(['a', 'b']);

      expect(tree.get_selected()).toEqual([]);
    });

    it('should accept mixed reference forms in one array', () => {
      const tree = build();

      tree.select_node(['a', node(tree, 'b'), el('#deep')]);

      expect(sorted(tree.get_selected())).toEqual(['a', 'b', 'deep']);
    });

    it('should open and close every node in an array', () => {
      const tree = build();

      tree.close_node(['folder']);
      expect(tree.is_open('folder')).toBe(false);

      tree.open_node([node(tree, 'folder')]);
      expect(tree.is_open('folder')).toBe(true);
    });

    it('should toggle every node in an array', () => {
      const tree = build();

      tree.toggle_node(['folder']);

      expect(tree.is_open('folder')).toBe(false);
    });

    it('should delete every node in an array', () => {
      const tree = build();

      tree.delete_node(['a', 'b']);

      expect(tree.get_node('a')).toBe(false);
      expect(tree.get_node('b')).toBe(false);
    });

    it('should move every node in an array', () => {
      const tree = build();

      tree.move_node(['a', 'b'], 'folder');

      expect(node(tree, 'a').parent).toBe('folder');
      expect(node(tree, 'b').parent).toBe('folder');
    });

    it('should hide and show every node in an array', () => {
      const tree = build();

      tree.hide_node(['a', 'b']);
      expect(tree.is_hidden('a') && tree.is_hidden('b')).toBe(true);

      tree.show_node(['a', 'b']);
      expect(tree.is_hidden('a') || tree.is_hidden('b')).toBe(false);
    });

    it('should disable and enable every node in an array', () => {
      const tree = build();

      tree.disable_node(['a', 'b']);
      expect(tree.is_disabled('a') && tree.is_disabled('b')).toBe(true);

      tree.enable_node(['a', 'b']);
      expect(tree.is_disabled('a') || tree.is_disabled('b')).toBe(false);
    });

    it('should set the text of every node in an array', () => {
      const tree = build();

      tree.set_text(['a', 'b'], 'Same');

      expect([tree.get_text('a'), tree.get_text('b')]).toEqual(['Same', 'Same']);
    });

    it('should rename every node in an array', () => {
      const tree = build();

      tree.rename_node(['a', 'b'], 'Same');

      expect([tree.get_text('a'), tree.get_text('b')]).toEqual(['Same', 'Same']);
    });

    it('should check and uncheck every node in an array', () => {
      const tree = build({ plugins: ['checkbox'] });

      tree.check_node(['a', 'b']);
      expect(tree.is_checked('a') && tree.is_checked('b')).toBe(true);

      tree.uncheck_node(['a', 'b']);
      expect(tree.is_checked('a') || tree.is_checked('b')).toBe(false);
    });

    it('should return true after processing an array, as jstree does', () => {
      const tree = build();

      expect(tree.select_node(['a', 'b'])).toBe(true);
      expect(tree.delete_node(['a', 'b'])).toBe(true);
    });
  });

  describe('the root', () => {
    it('should not be selectable', () => {
      const tree = build();

      tree.select_node('#');

      expect(tree.get_selected()).toEqual([]);
    });

    it('should not be deletable', () => {
      const tree = build();

      expect(tree.delete_node('#')).toBe(false);
      expect(tree.getRootNodeIds()).toEqual(['a', 'b', 'folder']);
    });
  });
});
