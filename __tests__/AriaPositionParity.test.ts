import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Where the aria attributes live, as jstree 3.3.16 puts them: the anchor
 * carries `role="treeitem"` along with `aria-selected`, `aria-disabled`,
 * `aria-level` and — for a node with children — `aria-expanded`, while the
 * `<li>` is `role="none"`. `core.compute_elements_positions` adds
 * `aria-setsize` and `aria-posinset`.
 */
describe('aria position parity', () => {
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
      id: 'r1',
      text: 'R1',
      state: { opened: true },
      children: [
        { id: 'c1', text: 'C1' },
        { id: 'c2', text: 'C2' },
      ],
    },
    { id: 'r2', text: 'R2' },
    { id: 'r3', text: 'R3', state: { disabled: true } },
  ];
  const build = (core: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data: data(), check_callback: true, ...core } } as never);
  const li = (id: string) => container.querySelector(`#${id}`) as HTMLElement;
  const anchor = (id: string) => container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;

  describe('roles', () => {
    it('should put treeitem on the anchor and none on the node', () => {
      build();

      expect(anchor('r1').getAttribute('role')).toBe('treeitem');
      expect(li('r1').getAttribute('role')).toBe('none');
    });

    it('should keep the tree and group roles', () => {
      build();

      expect(container.getAttribute('role')).toBe('tree');
      expect(container.querySelector('ul')!.getAttribute('role')).toBe('group');
    });
  });

  describe('state on the anchor', () => {
    it('should report selection on the anchor', () => {
      const tree = build();

      tree.select_node('r2');

      expect(anchor('r2').getAttribute('aria-selected')).toBe('true');
      expect(anchor('r1').getAttribute('aria-selected')).toBe('false');
      expect(li('r2').hasAttribute('aria-selected')).toBe(false);
    });

    it('should report expansion on a parent anchor only', () => {
      const tree = build();

      expect(anchor('r1').getAttribute('aria-expanded')).toBe('true');
      expect(anchor('r2').hasAttribute('aria-expanded')).toBe(false);

      tree.close_node('r1', 0);

      expect(anchor('r1').getAttribute('aria-expanded')).toBe('false');
    });

    it('should report a disabled node on its anchor', () => {
      build();

      expect(anchor('r3').getAttribute('aria-disabled')).toBe('true');
      expect(li('r3').hasAttribute('aria-disabled')).toBe(false);
    });

    it('should report the level, deepening with nesting', () => {
      build();

      expect(anchor('r1').getAttribute('aria-level')).toBe('1');
      expect(anchor('c1').getAttribute('aria-level')).toBe('2');
    });
  });

  describe('compute_elements_positions', () => {
    it('should leave the positions off by default', () => {
      build();

      expect(anchor('r1').hasAttribute('aria-setsize')).toBe(false);
      expect(anchor('r1').hasAttribute('aria-posinset')).toBe(false);
    });

    it('should report the size and position of each node', () => {
      build({ compute_elements_positions: true });

      expect(anchor('r1').getAttribute('aria-setsize')).toBe('3');
      expect(anchor('r1').getAttribute('aria-posinset')).toBe('1');
      expect(anchor('c2').getAttribute('aria-setsize')).toBe('2');
      expect(anchor('c2').getAttribute('aria-posinset')).toBe('2');
    });

    it('should follow a move', () => {
      const tree = build({ compute_elements_positions: true });

      tree.move_node('r2', 'r1', 0);

      expect(anchor('r2').getAttribute('aria-setsize')).toBe('3');
      expect(anchor('r2').getAttribute('aria-posinset')).toBe('1');
      expect(anchor('r3').getAttribute('aria-setsize')).toBe('2');
    });
  });
});
