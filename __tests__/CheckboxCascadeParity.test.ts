import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * checkbox.cascade parity with jstree 3.3.16. `three_state` (the default)
 * means cascade 'up+down+undetermined'; otherwise `cascade` names the
 * directions. Down re-derives a subtree when a node is checked or unchecked —
 * a parent that cannot be fully checked (a child excluded by
 * cascade_to_disabled / cascade_to_hidden) ends unchecked. Up checks a parent
 * once all its children are, and unchecking clears the ancestors. Both also
 * apply as nodes load, and up re-applies on delete and move. Partial parents
 * show as undetermined only with 'undetermined'.
 */
describe('checkbox.cascade parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const family = (): TreeNodeData[] => [
    {
      id: 'p',
      text: 'P',
      state: { opened: true },
      children: [
        { id: 'c1', text: 'C1' },
        { id: 'c2', text: 'C2' },
      ],
    },
    { id: 'other', text: 'Other' },
  ];

  const build = (checkbox: Record<string, unknown>, data: TreeNodeData[] = family()) =>
    new MDFolderTree(container, {
      core: { data, check_callback: true },
      plugins: ['checkbox'],
      checkbox: { tie_selection: false, ...checkbox },
    } as never);

  describe('directions', () => {
    it('should cascade down only with cascade "down"', () => {
      const tree = build({ three_state: false, cascade: 'down' });

      tree.check_node('p');
      expect([tree.is_checked('c1'), tree.is_checked('c2')]).toEqual([true, true]);

      tree.uncheck_node('p');
      tree.check_node('c1');
      tree.check_node('c2');
      expect(tree.is_checked('p')).toBe(false);
    });

    it('should cascade up only with cascade "up"', () => {
      const tree = build({ three_state: false, cascade: 'up' });

      tree.check_node('c1');
      tree.check_node('c2');
      expect(tree.is_checked('p')).toBe(true);

      tree.uncheck_node('c1');
      expect(tree.is_checked('p')).toBe(false);
      expect(tree.is_checked('c2')).toBe(true);

      tree.check_node('other');
      tree.uncheck_node('c2');
      tree.check_node('p');
      expect(tree.is_checked('c1')).toBe(false);
    });

    it('should not cascade with three_state false and no cascade', () => {
      const tree = build({ three_state: false });

      tree.check_node('p');

      expect(tree.is_checked('c1')).toBe(false);
    });

    it('should use up+down+undetermined whenever three_state is on, whatever cascade says', () => {
      const tree = build({ three_state: true, cascade: 'down' });

      tree.check_node('c1');
      tree.check_node('c2');

      expect(tree.is_checked('p')).toBe(true);
    });
  });

  describe('undetermined', () => {
    it('should report partial parents only with "undetermined"', () => {
      const withUndetermined = build({ three_state: false, cascade: 'up+down+undetermined' });
      withUndetermined.check_node('c1');
      expect(withUndetermined.get_undetermined()).toEqual(['p']);
      withUndetermined.destroy();

      const without = build({ three_state: false, cascade: 'up+down' });
      without.check_node('c1');
      expect(without.get_undetermined()).toEqual([]);
    });
  });

  describe('excluded children', () => {
    it('should leave a parent unchecked when a disabled child cannot be checked', () => {
      const tree = build({ cascade_to_disabled: false }, [
        {
          id: 'p',
          text: 'P',
          state: { opened: true },
          children: [
            { id: 'c1', text: 'C1' },
            { id: 'd', text: 'D', state: { disabled: true } },
          ],
        },
      ]);

      tree.check_node('p');

      expect(tree.is_checked('c1')).toBe(true);
      expect(tree.is_checked('d')).toBe(false);
      expect(tree.is_checked('p')).toBe(false);
      expect(tree.is_undetermined('p')).toBe(true);
    });
  });

  describe('as nodes load', () => {
    it('should check the children a checked parent loads', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: { id: string }, callback: (d: TreeNodeData[]) => void) =>
            callback(
              node.id === '#'
                ? [{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData]
                : [{ id: 'k1', text: 'K1' }, { id: 'k2', text: 'K2' }],
            ),
        },
        plugins: ['checkbox'],
        checkbox: { tie_selection: false },
      } as never);
      tree.check_node('lz');

      tree.load_node('lz');

      expect([tree.is_checked('k1'), tree.is_checked('k2')]).toEqual([true, true]);
    });

    it('should cascade initial data down from a checked parent', () => {
      const tree = build({}, [
        {
          id: 'p',
          text: 'P',
          state: { checked: true },
          children: [{ id: 'c1', text: 'C1' }, { id: 'c2', text: 'C2' }],
        },
      ]);

      expect([tree.is_checked('c1'), tree.is_checked('c2')]).toEqual([true, true]);
    });

    it('should check a parent whose initial children are all checked', () => {
      const tree = build({}, [
        {
          id: 'p',
          text: 'P',
          children: [
            { id: 'c1', text: 'C1', state: { checked: true } },
            { id: 'c2', text: 'C2', state: { checked: true } },
          ],
        },
      ]);

      expect(tree.is_checked('p')).toBe(true);
    });
  });

  describe('up on structural changes', () => {
    it('should check a parent once its only unchecked child is deleted', () => {
      const tree = build({ three_state: false, cascade: 'up' });
      tree.check_node('c1');

      tree.delete_node('c2');

      expect(tree.is_checked('p')).toBe(true);
    });

    it('should check the old parent when its only unchecked child moves out', () => {
      const tree = build({ three_state: false, cascade: 'up' });
      tree.check_node('c1');

      tree.move_node('c2', '#', 'last');

      expect(tree.is_checked('p')).toBe(true);
    });

    it('should uncheck a checked parent that an unchecked node moves into', () => {
      const tree = build({ three_state: false, cascade: 'up' });
      tree.check_node('c1');
      tree.check_node('c2');
      expect(tree.is_checked('p')).toBe(true);

      tree.move_node('other', 'p', 'last');

      expect(tree.is_checked('p')).toBe(false);
    });
  });
});
