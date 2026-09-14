import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * jstree's `is_parent` is `state.loaded === false || children.length > 0`,
 * and `is_leaf` / `is_closed` are defined in terms of it. An unloaded lazy
 * node (`children: true`) is therefore a closed parent — which is what lets
 * the Right arrow open it and trigger its load.
 */
describe('Lazy node state', () => {
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

  const lazyTree = (onLoad?: (id: string) => void) =>
    new MDFolderTree(container, {
      core: {
        data: (node, callback) => {
          if (node.id === '#') {
            callback([
              { id: 'lazy', text: 'Lazy', children: true } as TreeNodeData,
              { id: 'empty', text: 'Empty', children: true } as TreeNodeData,
              { id: 'leaf', text: 'Leaf' },
            ]);
            return;
          }
          onLoad?.(node.id);
          callback(node.id === 'lazy' ? [{ id: 'kid', text: 'Kid' }] : []);
        },
      },
    });

  const key = (k: string) =>
    container.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  describe('before loading', () => {
    it('should report an unloaded lazy node as a parent', () => {
      const tree = lazyTree();

      expect(tree.is_parent('lazy')).toBe(true);
    });

    it('should not report an unloaded lazy node as a leaf', () => {
      const tree = lazyTree();

      expect(tree.is_leaf('lazy')).toBe(false);
    });

    it('should report an unloaded lazy node as closed', () => {
      const tree = lazyTree();

      expect(tree.is_closed('lazy')).toBe(true);
    });

    it('should report a plain childless node as a leaf', () => {
      const tree = lazyTree();

      expect(tree.is_leaf('leaf')).toBe(true);
      expect(tree.is_parent('leaf')).toBe(false);
    });
  });

  describe('after loading', () => {
    it('should report a lazy node that loaded no children as a leaf', () => {
      const tree = lazyTree();

      tree.load_node('empty');

      expect(tree.is_leaf('empty')).toBe(true);
      expect(tree.is_parent('empty')).toBe(false);
      expect(tree.is_closed('empty')).toBe(false);
    });

    it('should report a lazy node that loaded children as a parent', () => {
      const tree = lazyTree();

      tree.load_node('lazy');

      expect(tree.is_parent('lazy')).toBe(true);
    });
  });

  describe('missing nodes', () => {
    // jstree defines is_leaf as !is_parent, so a node that does not exist
    // reports as a leaf. Surprising, but it is the contract being matched.
    it('should report a missing node as a leaf, as jstree does', () => {
      const tree = lazyTree();

      expect(tree.is_leaf('nope')).toBe(true);
    });

    it('should report a missing node as neither a parent nor closed', () => {
      const tree = lazyTree();

      expect(tree.is_parent('nope')).toBe(false);
      expect(tree.is_closed('nope')).toBe(false);
    });
  });

  describe('keyboard', () => {
    it('should load and open an unloaded lazy node on Right', () => {
      const loaded: string[] = [];
      const tree = lazyTree((id) => loaded.push(id));
      key('Home');

      key('ArrowRight');

      expect(loaded).toEqual(['lazy']);
      expect(tree.is_open('lazy')).toBe(true);
    });
  });
});
