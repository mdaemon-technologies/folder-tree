import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData, ChangedDetail } from '../src/types';

/**
 * Selection and activation parity with jstree 3.3.16.
 *
 * jstree separates two layers. The programmatic selection API (`select_node`,
 * `deselect_node`, `select_all`, `deselect_all`) applies no policy: it ignores
 * `core.multiple` and `disabled`. `activate_node` — which every click and
 * Enter keypress goes through — enforces `multiple`, `disabled` and
 * `allow_reselect`, and implements ctrl/shift selection.
 */
describe('Selection and activation parity', () => {
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
    { id: 'd', text: 'D' },
    { id: 'folder', text: 'Folder', children: [{ id: 'deep', text: 'Deep' }] },
    { id: 'off', text: 'Off', state: { disabled: true } },
  ];

  const build = (core: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, ...core }, ...rest });

  const click = (id: string, init: MouseEventInit = {}) => {
    const anchor = container.querySelector(`#${CSS.escape(id)} > .md-tree-anchor`) as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  };

  const clickPart = (id: string, selector: string, init: MouseEventInit = {}) => {
    const el = container.querySelector(`#${CSS.escape(id)} > .md-tree-anchor ${selector}`) as HTMLElement;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  };

  const key = (k: string) =>
    container.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  const record = (tree: MDFolderTree, names: string[]) => {
    const log: string[] = [];
    for (const name of names) tree.on(`${name}.MDFolderTree`, () => log.push(name));
    return log;
  };

  const sorted = (ids: string[]) => [...ids].sort();

  describe('programmatic selection applies no policy', () => {
    it('should keep earlier selections under multiple:false', () => {
      const tree = build({ multiple: false });

      tree.select_node('a');
      tree.select_node('b');

      expect(sorted(tree.get_selected())).toEqual(['a', 'b']);
    });

    it('should select a disabled node', () => {
      const tree = build();

      tree.select_node('off');

      expect(tree.is_selected('off')).toBe(true);
    });

    it('should emit nothing when the node is already selected', () => {
      const tree = build();
      tree.select_node('a');
      const log = record(tree, ['select_node', 'changed']);

      tree.select_node('a');

      expect(log).toEqual([]);
    });

    it('should emit nothing when deselecting a node that is not selected', () => {
      const tree = build();
      const log = record(tree, ['deselect_node', 'changed']);

      tree.deselect_node('a');

      expect(log).toEqual([]);
    });

    it('should still emit select_node when suppressed, but not changed', () => {
      const tree = build();
      const log = record(tree, ['select_node', 'changed']);

      tree.select_node('a', true);

      expect(log).toEqual(['select_node']);
    });

    it('should still emit deselect_node when suppressed, but not changed', () => {
      const tree = build();
      tree.select_node('a');
      const log = record(tree, ['deselect_node', 'changed']);

      tree.deselect_node('a', true);

      expect(log).toEqual(['deselect_node']);
    });

    it('should open the collapsed ancestors of a selected node', () => {
      const tree = build();
      expect(tree.is_open('folder')).toBe(false);

      tree.select_node('deep');

      expect(tree.is_open('folder')).toBe(true);
    });
  });

  describe('select_all and deselect_all', () => {
    it('should include disabled nodes in select_all', () => {
      const tree = build();

      tree.select_all();

      expect(tree.get_selected()).toContain('off');
    });

    it('should emit select_all carrying the new selection', () => {
      const tree = build();
      let detail: { selected: string[] } | null = null;
      tree.on('select_all.MDFolderTree', (e) => { detail = e.detail as { selected: string[] }; });

      tree.select_all();

      expect(sorted(detail!.selected)).toEqual(['a', 'b', 'c', 'd', 'deep', 'folder', 'off']);
    });

    it('should still emit select_all when suppressed, but not changed', () => {
      const tree = build();
      const log = record(tree, ['select_all', 'changed']);

      tree.select_all(true);

      expect(log).toEqual(['select_all']);
    });

    it('should emit deselect_all carrying the previous selection as node', () => {
      const tree = build();
      tree.select_node('a');
      tree.select_node('b');
      let detail: { node: string[]; selected: string[] } | null = null;
      tree.on('deselect_all.MDFolderTree', (e) => {
        detail = e.detail as { node: string[]; selected: string[] };
      });

      tree.deselect_all();

      expect(sorted(detail!.node)).toEqual(['a', 'b']);
      expect(detail!.selected).toEqual([]);
    });

    it('should still emit deselect_all when suppressed, but not changed', () => {
      const tree = build();
      tree.select_node('a');
      const log = record(tree, ['deselect_all', 'changed']);

      tree.deselect_all(true);

      expect(log).toEqual(['deselect_all']);
    });
  });

  describe('click activation', () => {
    it('should replace the selection on a plain click', () => {
      const tree = build();

      click('a');
      click('b');

      expect(tree.get_selected()).toEqual(['b']);
    });

    it('should ignore a plain click on the only selected node', () => {
      const tree = build();
      click('a');
      const log = record(tree, ['select_node', 'deselect_node', 'changed']);

      click('a');

      expect(log).toEqual([]);
      expect(tree.get_selected()).toEqual(['a']);
    });

    it('should reselect on a plain click when allow_reselect is set', () => {
      const tree = build({ allow_reselect: true });
      click('a');
      const log = record(tree, ['deselect_all', 'select_node']);

      click('a');

      expect(log).toEqual(['deselect_all', 'select_node']);
      expect(tree.get_selected()).toEqual(['a']);
    });

    it('should add a node to the selection on ctrl-click', () => {
      const tree = build();

      click('a');
      click('b', { ctrlKey: true });

      expect(sorted(tree.get_selected())).toEqual(['a', 'b']);
    });

    it('should remove a selected node on ctrl-click', () => {
      const tree = build();

      click('a');
      click('b', { ctrlKey: true });
      click('a', { ctrlKey: true });

      expect(tree.get_selected()).toEqual(['b']);
    });

    it('should treat meta-click like ctrl-click', () => {
      const tree = build();

      click('a');
      click('b', { metaKey: true });

      expect(sorted(tree.get_selected())).toEqual(['a', 'b']);
    });

    it('should select a contiguous range on shift-click', () => {
      const tree = build();

      click('b');
      click('d', { shiftKey: true });

      expect(sorted(tree.get_selected())).toEqual(['b', 'c', 'd']);
    });

    it('should select a range upward on shift-click', () => {
      const tree = build();

      click('d');
      click('b', { shiftKey: true });

      expect(sorted(tree.get_selected())).toEqual(['b', 'c', 'd']);
    });

    it('should keep selections outside the range on ctrl+shift-click', () => {
      const tree = build();

      click('a');
      click('c', { ctrlKey: true });
      click('d', { shiftKey: true, ctrlKey: true });

      expect(sorted(tree.get_selected())).toEqual(['a', 'c', 'd']);
    });

    it('should skip disabled nodes inside a shift range', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            { id: 'x1', text: 'X1' },
            { id: 'x2', text: 'X2', state: { disabled: true } },
            { id: 'x3', text: 'X3' },
          ],
        },
      });

      click('x1');
      click('x3', { shiftKey: true });

      expect(sorted(tree.get_selected())).toEqual(['x1', 'x3']);
    });

    it('should replace the selection on a modified click when multiple is false', () => {
      const tree = build({ multiple: false });

      click('a');
      click('b', { ctrlKey: true });

      expect(tree.get_selected()).toEqual(['b']);
    });

    it('should deselect on ctrl-click of the selected node when multiple is false', () => {
      const tree = build({ multiple: false });

      click('a');
      click('a', { ctrlKey: true });

      expect(tree.get_selected()).toEqual([]);
    });

    it('should do nothing when a disabled node is clicked', () => {
      const tree = build();
      const log = record(tree, ['select_node', 'activate_node']);

      click('off');

      expect(log).toEqual([]);
      expect(tree.get_selected()).toEqual([]);
    });

    it('should emit activate_node after the selection has changed', () => {
      const tree = build();
      const order = record(tree, ['select_node', 'activate_node']);

      click('a');

      expect(order).toEqual(['select_node', 'activate_node']);
    });

    it('should carry the node and originating event on activate_node', () => {
      const tree = build();
      let detail: { node: { id: string }; event: Event } | null = null;
      tree.on('activate_node.MDFolderTree', (e) => {
        detail = e.detail as { node: { id: string }; event: Event };
      });

      click('a');

      expect(detail!.node.id).toBe('a');
      expect(detail!.event).toBeInstanceOf(MouseEvent);
    });

    it('should move keyboard focus to the clicked node', () => {
      build();

      click('a');
      click('c', { ctrlKey: true });

      expect(container.getAttribute('aria-activedescendant')).toBe('c');
    });

    it('should activate the focused node on Enter with click semantics', () => {
      const tree = build();
      click('a');

      key('ArrowDown');
      key('Enter');

      expect(tree.get_selected()).toEqual(['b']);
    });
  });

  describe('changed diffs follow the last emitted selection', () => {
    it('should report the node that lost selection when a click replaces it', () => {
      const tree = build();
      click('a');
      let detail: ChangedDetail | null = null;
      tree.on('changed.MDFolderTree', (e) => { detail = e.detail as ChangedDetail; });

      click('b');

      expect(detail!.changed!.selected).toEqual(['b']);
      expect(detail!.changed!.deselected).toEqual(['a']);
    });

    it('should diff against the last emitted selection, not the previous call', () => {
      const tree = build();
      tree.select_node('a');
      tree.select_node('b', true);
      let detail: ChangedDetail | null = null;
      tree.on('changed.MDFolderTree', (e) => { detail = e.detail as ChangedDetail; });

      tree.select_node('c');

      // 'b' was selected silently, so it first appears in this diff.
      expect(sorted(detail!.changed!.selected)).toEqual(['b', 'c']);
    });

    // jstree seeds the diff baseline by emitting `changed` with action
    // 'ready' just before `ready`, whenever nodes arrive preselected.
    const preselected: TreeNodeData[] = [
      { id: 'p', text: 'P', state: { selected: true } },
      { id: 'q', text: 'Q' },
    ];

    it('should report preselected nodes in a changed event before ready', async () => {
      const tree = new MDFolderTree(container, { core: { data: preselected } });
      const seen: string[] = [];
      let initial: ChangedDetail | null = null;
      tree.on('changed.MDFolderTree', (e) => {
        const d = e.detail as ChangedDetail;
        seen.push('changed:' + d.action);
        initial = d;
      });
      tree.on('ready.MDFolderTree', () => seen.push('ready'));

      await Promise.resolve();

      expect(seen).toEqual(['changed:ready', 'ready']);
      expect(initial!.selected).toEqual(['p']);
    });

    it('should not report preselected nodes as new in a later diff', async () => {
      const tree = new MDFolderTree(container, { core: { data: preselected } });
      await Promise.resolve();
      let detail: ChangedDetail | null = null;
      tree.on('changed.MDFolderTree', (e) => { detail = e.detail as ChangedDetail; });

      tree.select_node('q');

      expect(detail!.changed!.selected).toEqual(['q']);
    });

    it('should not emit a ready changed event when nothing is preselected', async () => {
      const tree = build();
      const seen: string[] = [];
      tree.on('changed.MDFolderTree', () => seen.push('changed'));
      tree.on('ready.MDFolderTree', () => seen.push('ready'));

      await Promise.resolve();

      expect(seen).toEqual(['ready']);
    });
  });

  describe('checkbox events', () => {
    const checkboxTree = (checkbox: Record<string, unknown> = {}) =>
      build({}, { plugins: ['checkbox'], checkbox });

    it('should emit select_node rather than check_node when tie_selection is on', () => {
      const tree = checkboxTree();
      const log = record(tree, ['select_node', 'check_node']);

      tree.check_node('a');

      expect(log).toEqual(['select_node']);
    });

    it('should emit deselect_node rather than uncheck_node when tie_selection is on', () => {
      const tree = checkboxTree();
      tree.check_node('a');
      const log = record(tree, ['deselect_node', 'uncheck_node']);

      tree.uncheck_node('a');

      expect(log).toEqual(['deselect_node']);
    });

    it('should not open ancestors when checking with tie_selection on', () => {
      const tree = checkboxTree();

      tree.check_node('deep');

      expect(tree.is_checked('deep')).toBe(true);
      expect(tree.is_open('folder')).toBe(false);
    });

    it('should emit check_node carrying the checked set when tie_selection is off', () => {
      const tree = checkboxTree({ tie_selection: false });
      let detail: { node: { id: string }; selected: string[] } | null = null;
      tree.on('check_node.MDFolderTree', (e) => {
        detail = e.detail as { node: { id: string }; selected: string[] };
      });

      tree.check_node('a');

      expect(detail!.node.id).toBe('a');
      expect(detail!.selected).toContain('a');
    });

    it('should emit uncheck_node when tie_selection is off', () => {
      const tree = checkboxTree({ tie_selection: false });
      tree.check_node('a');
      const log = record(tree, ['uncheck_node', 'deselect_node']);

      tree.uncheck_node('a');

      expect(log).toEqual(['uncheck_node']);
    });

    it('should emit select_all from check_all when tie_selection is on', () => {
      const tree = checkboxTree();
      const log = record(tree, ['select_all', 'check_all']);

      tree.check_all();

      expect(log).toEqual(['select_all']);
    });

    it('should emit check_all when tie_selection is off', () => {
      const tree = checkboxTree({ tie_selection: false });
      const log = record(tree, ['select_all', 'check_all']);

      tree.check_all();

      expect(log).toEqual(['check_all']);
    });

    it('should check disabled nodes on check_all', () => {
      const tree = checkboxTree();

      tree.check_all();

      expect(tree.is_checked('off')).toBe(true);
    });

    it('should keep the undetermined state after a redraw', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            {
              id: 'p',
              text: 'P',
              state: { opened: true },
              children: [{ id: 'k1', text: 'K1' }, { id: 'k2', text: 'K2' }],
            },
          ],
        },
        plugins: ['checkbox'],
      });
      tree.check_node('k1');
      expect(tree.is_undetermined('p')).toBe(true);

      tree.redraw();

      expect(tree.is_undetermined('p')).toBe(true);
    });
  });

  describe('checkbox whole_node', () => {
    it('should add to the selection when the checkbox icon is clicked', () => {
      const tree = build({}, { plugins: ['checkbox'], checkbox: { whole_node: false } });

      clickPart('a', '.md-tree-checkbox');
      clickPart('b', '.md-tree-checkbox');

      expect(sorted(tree.get_checked())).toEqual(['a', 'b']);
    });

    it('should replace the selection when the node text is clicked', () => {
      const tree = build({}, { plugins: ['checkbox'], checkbox: { whole_node: false } });

      clickPart('a', '.md-tree-checkbox');
      clickPart('b', 'span');

      expect(tree.get_checked()).toEqual(['b']);
    });

    it('should select without checking on a text click when tie_selection is off', () => {
      const tree = build(
        {},
        { plugins: ['checkbox'], checkbox: { whole_node: false, tie_selection: false } },
      );

      clickPart('a', 'span');

      expect(tree.get_selected()).toEqual(['a']);
      expect(tree.is_checked('a')).toBe(false);
    });

    it('should check without selecting on an icon click when tie_selection is off', () => {
      const tree = build(
        {},
        { plugins: ['checkbox'], checkbox: { whole_node: false, tie_selection: false } },
      );

      clickPart('a', '.md-tree-checkbox');

      expect(tree.is_checked('a')).toBe(true);
      expect(tree.get_selected()).toEqual([]);
    });
  });
});
