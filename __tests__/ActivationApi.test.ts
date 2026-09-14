import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Public API added for jstree parity: `activate_node(obj, e)` and the
 * `prevent_open` argument of `select_node(obj, supress_event, prevent_open, e)`.
 */
describe('Activation API', () => {
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
    { id: 'folder', text: 'Folder', children: [{ id: 'deep', text: 'Deep' }] },
    { id: 'off', text: 'Off', state: { disabled: true } },
  ];

  describe('activate_node', () => {
    it('should behave like a plain click', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      tree.activate_node('a');
      tree.activate_node('b');

      expect(tree.get_selected()).toEqual(['b']);
    });

    it('should honor modifier keys from the supplied event', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      tree.activate_node('a');
      tree.activate_node('b', { ctrlKey: true });

      expect([...tree.get_selected()].sort()).toEqual(['a', 'b']);
    });

    it('should refuse a disabled node', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      expect(tree.activate_node('off')).toBe(false);
      expect(tree.get_selected()).toEqual([]);
    });

    it('should enforce multiple:false', () => {
      const tree = new MDFolderTree(container, { core: { data, multiple: false } });

      tree.activate_node('a');
      tree.activate_node('b', { ctrlKey: true });

      expect(tree.get_selected()).toEqual(['b']);
    });
  });

  describe('select_node prevent_open', () => {
    it('should leave ancestors collapsed when prevent_open is set', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      tree.select_node('deep', false, true);

      expect(tree.is_selected('deep')).toBe(true);
      expect(tree.is_open('folder')).toBe(false);
    });
  });
});
