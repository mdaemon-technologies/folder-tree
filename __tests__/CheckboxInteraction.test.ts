import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData, ChangedDetail } from '../src/types';

/**
 * Clicking a node in checkbox mode went through a second, private cascade
 * implementation in the core that ignored `tie_selection`, the
 * `cascade_to_*` options, and never emitted `changed`.
 */
describe('Checkbox interaction', () => {
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
    {
      id: 'parent',
      text: 'Parent',
      state: { opened: true },
      children: [
        { id: 'kid1', text: 'Kid 1' },
        { id: 'kid2', text: 'Kid 2', state: { disabled: true } },
      ],
    },
    { id: 'solo', text: 'Solo' },
  ];

  const click = (id: string) => {
    const anchor = container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  };

  describe('tie_selection', () => {
    it('should not touch selection when tie_selection is false', () => {
      const tree = new MDFolderTree(container, {
        core: { data },
        plugins: ['checkbox'],
        checkbox: { tie_selection: false },
      });

      click('solo');

      expect(tree.is_checked('solo')).toBe(true);
      expect(tree.get_selected()).toEqual([]);
    });

    it('should select alongside checking by default', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });

      click('solo');

      expect(tree.is_checked('solo')).toBe(true);
      expect(tree.get_selected()).toContain('solo');
    });
  });

  describe('events', () => {
    it('should emit changed when a checkbox is toggled', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });
      const details: ChangedDetail[] = [];
      tree.on('changed.MDFolderTree', (e) => details.push(e.detail as ChangedDetail));

      click('solo');

      expect(details).toHaveLength(1);
      expect(details[0].changed!.selected).toContain('solo');
    });

    it('should emit deselect_node rather than select_node when unchecking', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });
      click('solo');

      const seen: string[] = [];
      tree.on('select_node.MDFolderTree', () => seen.push('select_node'));
      tree.on('deselect_node.MDFolderTree', () => seen.push('deselect_node'));
      click('solo');

      expect(seen).toEqual(['deselect_node']);
    });

    it('should still emit select_node when checking', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });
      const seen: string[] = [];
      tree.on('select_node.MDFolderTree', () => seen.push('select_node'));

      click('solo');

      expect(seen).toEqual(['select_node']);
    });
  });

  describe('cascade options are honored from the click path', () => {
    it('should skip disabled children when cascade_to_disabled is false', () => {
      const tree = new MDFolderTree(container, {
        core: { data },
        plugins: ['checkbox'],
        checkbox: { cascade_to_disabled: false },
      });

      click('parent');

      expect(tree.is_checked('kid1')).toBe(true);
      expect(tree.is_checked('kid2')).toBe(false);
    });

    it('should cascade to all children by default', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });

      click('parent');

      expect(tree.is_checked('kid1')).toBe(true);
      expect(tree.is_checked('kid2')).toBe(true);
    });

    it('should not cascade when three_state is false', () => {
      const tree = new MDFolderTree(container, {
        core: { data },
        plugins: ['checkbox'],
        checkbox: { three_state: false },
      });

      click('parent');

      expect(tree.is_checked('parent')).toBe(true);
      expect(tree.is_checked('kid1')).toBe(false);
    });
  });

  describe('single-select mode', () => {
    it('should uncheck the previous node when multiple is false', () => {
      const tree = new MDFolderTree(container, {
        core: { data, multiple: false },
        plugins: ['checkbox'],
        checkbox: { three_state: false },
      });

      click('solo');
      click('parent');

      expect(tree.is_checked('parent')).toBe(true);
      expect(tree.is_checked('solo')).toBe(false);
      expect(tree.get_selected()).toEqual(['parent']);
    });
  });

  describe('state consistency', () => {
    it('should keep selection flags in step with the selection set', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });

      click('parent');

      const flagged = tree.getAllNodes().filter((n) => n.state.selected).map((n) => n.id).sort();
      expect(flagged).toEqual(tree.get_selected().sort());
    });
  });

  describe('check_all', () => {
    it('should not leave disabled nodes checked but unselected', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });

      tree.check_all();

      // With tie_selection on, checked and selected must not contradict.
      for (const node of tree.getAllNodes()) {
        expect(node.state.checked).toBe(node.state.selected);
      }
    });

    it('should keep the checked set aligned with the selection', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['checkbox'] });

      tree.check_all();

      expect(tree.get_checked().sort()).toEqual(tree.get_selected().sort());
    });
  });
});