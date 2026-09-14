import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Search plugin parity with jstree 3.3.16:
 * `search(str, skip_async, show_only_matches, inside, append,
 * show_only_matches_children)`. Every match's ancestors are opened, and
 * clear_search closes the ones the search opened (`close_opened_onclear`,
 * default true). Candidates are the descendants of `inside` (or the root)
 * that have text and are not hidden; `search_leaves_only` counts only loaded
 * childless nodes. `fuzzy` matches approximately, `search_callback` runs with
 * the tree as `this`, and `search.ajax` names nodes to load before searching.
 */
describe('search parity', () => {
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
      id: 'folder',
      text: 'Folder',
      children: [
        { id: 'target', text: 'Needle' },
        {
          id: 'sub',
          text: 'Sub',
          children: [
            { id: 'deep', text: 'Deep needle' },
            { id: 'deep2', text: 'Other' },
          ],
        },
      ],
    },
    { id: 'solo', text: 'Solo' },
    { id: 'lazy', text: 'Lazy needle', children: true } as unknown as TreeNodeData,
    { id: 'blank', text: '' },
  ];

  const build = (search: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data: data(), check_callback: true }, plugins: ['search'], search } as never);

  const highlighted = () =>
    Array.from(container.querySelectorAll('.md-tree-search'))
      .map((el) => el.closest('.md-tree-node')!.id)
      .sort();

  describe('revealing matches', () => {
    it('should open the ancestors of every match, without show_only_matches', () => {
      const tree = build();

      tree.search('Deep needle');

      expect(tree.is_open('folder')).toBe(true);
      expect(tree.is_open('sub')).toBe(true);
    });

    it('should close the nodes it opened on clear_search, by default', () => {
      const tree = build();
      tree.search('Deep needle');

      tree.clear_search();

      expect(tree.is_open('folder')).toBe(false);
      expect(tree.is_open('sub')).toBe(false);
    });

    it('should leave open the nodes that were open already', () => {
      const tree = build();
      tree.open_node('folder');
      tree.search('Deep needle');

      tree.clear_search();

      expect(tree.is_open('folder')).toBe(true);
      expect(tree.is_open('sub')).toBe(false);
    });

    it('should leave them open when close_opened_onclear is false', () => {
      const tree = build({ close_opened_onclear: false });
      tree.search('Deep needle');

      tree.clear_search();

      expect(tree.is_open('sub')).toBe(true);
    });
  });

  describe('candidates', () => {
    it('should search only inside a given node', () => {
      const tree = build();

      expect(tree.search('needle', false, false, 'sub')).toEqual(['deep']);
    });

    it('should skip hidden nodes and nodes without text', () => {
      const tree = build({ search_callback: () => true });
      tree.hide_node('solo');

      const found = tree.search('x');

      expect(found).toContain('target');
      expect(found).not.toContain('solo');
      expect(found).not.toContain('blank');
    });

    it('should count only loaded childless nodes as leaves with search_leaves_only', () => {
      const tree = build({ search_leaves_only: true });

      const found = tree.search('needle');

      expect(found).toContain('target');
      expect(found).toContain('deep');
      expect(found).not.toContain('lazy');
    });

    it('should call search_callback with the string and the node, and the tree as this', () => {
      const calls: Array<[unknown, string, string]> = [];
      const tree = build({
        search_callback: function (this: unknown, str: string, node: TreeNode) {
          calls.push([this, str, node.id]);
          return false;
        },
      });

      tree.search('q');

      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every(([self, str]) => self === tree && str === 'q')).toBe(true);
    });
  });

  describe('results', () => {
    it('should replace earlier results without append', () => {
      const tree = build();
      tree.search('Other');

      tree.search('Solo');

      expect(highlighted()).toEqual(['solo']);
    });

    it('should add to earlier results with append', () => {
      const tree = build();
      tree.search('Solo');

      tree.search('Other', false, false, null, true);

      expect(highlighted()).toEqual(['deep2', 'solo']);
    });
  });

  describe('fuzzy', () => {
    it('should match approximately with fuzzy', () => {
      const tree = build({ fuzzy: true });

      expect(tree.search('Neddle')).toContain('target');
    });

    it('should not match approximately by default', () => {
      const tree = build();

      expect(tree.search('Neddle')).toEqual([]);
    });

    it('should still reject unrelated text with fuzzy', () => {
      const tree = build({ fuzzy: true });

      expect(tree.search('zzqx')).toEqual([]);
    });
  });

  describe('show_only_matches', () => {
    it('should take show_only_matches from the argument over the config', () => {
      const tree = build();

      tree.search('Solo', false, true);

      expect(tree.is_hidden('folder')).toBe(true);
      expect(tree.is_hidden('solo')).toBe(false);
    });

    it('should show the descendants of a match with show_only_matches_children', () => {
      const tree = build({ show_only_matches: true, show_only_matches_children: true });

      tree.search('Sub');

      expect(tree.is_hidden('deep')).toBe(false);
      expect(tree.is_hidden('deep2')).toBe(false);
      expect(tree.is_hidden('solo')).toBe(true);
    });

    it('should hide the descendants of a match without show_only_matches_children', () => {
      const tree = build({ show_only_matches: true });

      tree.search('Sub');

      expect(tree.is_hidden('deep2')).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit search with the matched nodes, str, res and show_only_matches', () => {
      const tree = build();
      let detail: { nodes: Element[]; str: string; res: string[]; show_only_matches: boolean } | null = null;
      tree.on('search.MDFolderTree', (e) => {
        detail = e.detail as typeof detail;
      });

      tree.search('Solo');

      expect(detail).not.toBeNull();
      expect(detail!.str).toBe('Solo');
      expect(detail!.res).toEqual(['solo']);
      expect(detail!.show_only_matches).toBe(false);
      expect(detail!.nodes.map((n) => n.id)).toEqual(['solo']);
    });

    it('should emit clear_search with str and res', () => {
      const tree = build();
      tree.search('Solo');
      let detail: { str: string; res: string[] } | null = null;
      tree.on('clear_search.MDFolderTree', (e) => {
        detail = e.detail as typeof detail;
      });

      tree.clear_search();

      expect(detail).toEqual(expect.objectContaining({ str: 'Solo', res: ['solo'] }));
    });
  });

  describe('search.ajax', () => {
    const remoteTree = (calls: Array<[string, unknown]>) =>
      new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: TreeNodeData[]) => void) =>
            callback(
              node.id === '#'
                ? [{ id: 'lp', text: 'LP', children: true } as unknown as TreeNodeData]
                : [{ id: 'n2', text: 'Remote needle' }],
            ),
        },
        plugins: ['search'],
        search: {
          ajax: function (str: string, callback: (ids: string[]) => void, inside: unknown) {
            calls.push([str, inside]);
            callback(['lp']);
          },
        },
      } as never);

    it('should load the nodes search.ajax names, then search', () => {
      const calls: Array<[string, unknown]> = [];
      const tree = remoteTree(calls);

      tree.search('Remote');

      expect(calls).toEqual([['Remote', null]]);
      expect(tree.is_loaded('lp')).toBe(true);
      expect(tree.is_open('lp')).toBe(true);
      expect(highlighted()).toEqual(['n2']);
    });

    it('should skip search.ajax with skip_async', () => {
      const calls: Array<[string, unknown]> = [];
      const tree = remoteTree(calls);

      tree.search('Remote', true);

      expect(calls).toEqual([]);
      expect(tree.is_loaded('lp')).toBe(false);
    });
  });
});
