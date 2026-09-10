import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData, ChangedDetail } from '../src/types';

/**
 * Selection lived in two places: `TreeSelection`'s set (which enforced
 * `core.multiple`) and each node's `state.selected` flag (which did not).
 * They diverged, so the API and the DOM disagreed about what was selected.
 */
describe('Selection consistency', () => {
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
    { id: 'c', text: 'C' },
  ];

  const flaggedIds = (tree: MDFolderTree) =>
    tree.getAllNodes().filter((n) => n.state.selected).map((n) => n.id);
  const clickedCount = () => container.querySelectorAll('.md-tree-clicked').length;

  describe('single-select mode', () => {
    it('should honor multiple:false for nodes preselected in the data', () => {
      const tree = new MDFolderTree(container, {
        core: {
          multiple: false,
          data: [
            { id: 'a', text: 'A', state: { selected: true } },
            { id: 'b', text: 'B', state: { selected: true } },
          ],
        },
      });

      expect(tree.get_selected()).toHaveLength(1);
      expect(flaggedIds(tree)).toEqual(tree.get_selected());
      expect(clickedCount()).toBe(1);
    });

    it('should clear the previous flag when selecting another node', () => {
      const tree = new MDFolderTree(container, { core: { multiple: false, data } });

      tree.selectNode('a');
      tree.selectNode('b');

      expect(tree.get_selected()).toEqual(['b']);
      expect(flaggedIds(tree)).toEqual(['b']);
      expect(clickedCount()).toBe(1);
    });

    it('should not select everything on select_all', () => {
      const tree = new MDFolderTree(container, { core: { multiple: false, data } });

      tree.select_all();

      expect(tree.get_selected()).toHaveLength(1);
      expect(flaggedIds(tree)).toEqual(tree.get_selected());
    });
  });

  describe('multi-select mode', () => {
    it('should keep flags and the selection set in step for select_all', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      tree.select_all();

      expect(tree.get_selected().sort()).toEqual(['a', 'b', 'c']);
      expect(flaggedIds(tree).sort()).toEqual(['a', 'b', 'c']);
      expect(clickedCount()).toBe(3);
    });

    it('should not select disabled nodes', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            { id: 'a', text: 'A' },
            { id: 'off', text: 'Off', state: { disabled: true } },
          ],
        },
      });

      tree.select_all();

      expect(tree.get_selected()).toEqual(['a']);
      expect(flaggedIds(tree)).toEqual(['a']);
    });

    it('should clear flags on deselect_all', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.select_all();

      tree.deselect_all();

      expect(tree.get_selected()).toEqual([]);
      expect(flaggedIds(tree)).toEqual([]);
      expect(clickedCount()).toBe(0);
    });
  });

  describe('changed event diffs', () => {
    it('should report the real prior selection for select_all', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.selectNode('b');

      let detail: ChangedDetail | null = null;
      tree.on('changed.MDFolderTree', (e) => {
        detail = e.detail as ChangedDetail;
      });
      tree.select_all();

      expect(detail!.old_selection).toEqual(['b']);
      expect(detail!.changed!.selected.sort()).toEqual(['a', 'c']);
      expect(detail!.changed!.deselected).toEqual([]);
    });

    it('should report deselections for deselect_all', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.selectNode('a');
      tree.selectNode('b');

      let detail: ChangedDetail | null = null;
      tree.on('changed.MDFolderTree', (e) => {
        detail = e.detail as ChangedDetail;
      });
      tree.deselect_all();

      expect(detail!.changed!.deselected.sort()).toEqual(['a', 'b']);
      expect(detail!.selected).toEqual([]);
    });
  });

  describe('set_state', () => {
    it('should leave flags consistent with the selection set', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      tree.set_state({ selected: ['a', 'c'] });

      expect(tree.get_selected().sort()).toEqual(['a', 'c']);
      expect(flaggedIds(tree).sort()).toEqual(['a', 'c']);
    });
  });

  describe('checkbox plugin', () => {
    it('should keep flags consistent when checking a node', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });

      tree.check_node('a');

      expect(flaggedIds(tree)).toEqual(tree.get_selected());
    });

    it('should keep flags consistent when unchecking a node', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });
      tree.check_node('a');

      tree.uncheck_node('a');

      expect(flaggedIds(tree)).toEqual(tree.get_selected());
    });
  });
});
