import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('Checkbox: get_checked_descendants & cascade options', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'root',
      text: 'Root',
      state: { opened: true },
      children: [
        {
          id: 'branch',
          text: 'Branch',
          state: { opened: true },
          children: [
            { id: 'leaf-1', text: 'Leaf 1' },
            { id: 'leaf-2', text: 'Leaf 2', state: { disabled: true } },
            { id: 'leaf-3', text: 'Leaf 3' },
          ],
        },
        { id: 'sibling', text: 'Sibling' },
      ],
    },
  ];

  afterEach(() => {
    if (tree) tree.destroy();
    if (container?.parentNode) document.body.removeChild(container);
  });

  describe('get_checked_descendants', () => {
    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      tree = new MDFolderTree(container, {
        core: { data: sampleData },
        plugins: ['checkbox'],
        checkbox: { three_state: false },
      });
    });

    test('returns empty array when no descendants are checked', () => {
      expect(tree.get_checked_descendants('root')).toEqual([]);
    });

    test('returns checked descendant IDs', () => {
      tree.check_node('leaf-1');
      tree.check_node('leaf-3');
      const result = tree.get_checked_descendants('root');
      expect(result).toContain('leaf-1');
      expect(result).toContain('leaf-3');
    });

    test('does not include the node itself', () => {
      tree.check_node('root');
      tree.check_node('branch');
      const result = tree.get_checked_descendants('root');
      expect(result).toContain('branch');
      // root should not be in its own descendants
      expect(result).not.toContain('root');
    });

    test('returns empty for unknown node', () => {
      expect(tree.get_checked_descendants('nonexistent')).toEqual([]);
    });
  });

  describe('cascade_to_disabled', () => {
    test('cascades to disabled nodes by default', () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      tree = new MDFolderTree(container, {
        core: { data: sampleData },
        plugins: ['checkbox'],
        checkbox: { three_state: true },
      });
      tree.check_node('branch');
      expect(tree.is_checked('leaf-2')).toBe(true); // disabled node gets checked
    });

    test('does not cascade to disabled nodes when cascade_to_disabled is false', () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      tree = new MDFolderTree(container, {
        core: { data: sampleData },
        plugins: ['checkbox'],
        checkbox: { three_state: true, cascade_to_disabled: false },
      });
      tree.check_node('branch');
      expect(tree.is_checked('leaf-1')).toBe(true);
      expect(tree.is_checked('leaf-2')).toBe(false); // disabled node skipped
      expect(tree.is_checked('leaf-3')).toBe(true);
    });
  });

  describe('cascade_to_hidden', () => {
    test('does not cascade to hidden nodes when cascade_to_hidden is false', () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      tree = new MDFolderTree(container, {
        core: { data: sampleData },
        plugins: ['checkbox'],
        checkbox: { three_state: true, cascade_to_hidden: false },
      });
      tree.hide_node('leaf-3');
      tree.check_node('branch');
      expect(tree.is_checked('leaf-1')).toBe(true);
      expect(tree.is_checked('leaf-3')).toBe(false); // hidden node skipped
    });
  });
});
