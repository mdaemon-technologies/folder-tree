import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Only the initial JSON load ran through `JsonParser`. Lazy loads, HTML
 * parsing and `createNode` bypassed it, so nodes could reach the store with
 * `id: undefined` and no defaults applied.
 */
describe('Ingress normalization', () => {
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

  describe('lazy loading', () => {
    const lazyTree = () =>
      new MDFolderTree(container, {
        core: {
          data: (node, callback) => {
            if (node.id === '#') {
              callback([{ id: 'root', text: 'Root', children: true } as TreeNodeData]);
            } else {
              callback([{ text: 'No id supplied' } as TreeNodeData]);
            }
          },
        },
      });

    it('should generate an id for a lazily loaded node that lacks one', () => {
      const tree = lazyTree();

      tree.load_node('root');

      const ids = tree.getAllNodes().map((n) => n.id);
      expect(ids).not.toContain(undefined);
      expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    });

    it('should make the lazily loaded child reachable and rendered', () => {
      const tree = lazyTree();

      tree.load_node('root');

      const child = tree.getNodeChildren('root')[0];
      expect(child).toBeDefined();
      expect(child.text).toBe('No id supplied');
      expect(container.querySelector(`#${CSS.escape(child.id)}`)).not.toBeNull();
    });

    it('should apply defaults to a lazily loaded node', () => {
      const tree = lazyTree();

      tree.load_node('root');

      const child = tree.getNodeChildren('root')[0];
      expect(child.type).toBe('default');
      expect(child.state.selected).toBe(false);
      // As in jstree, li_attr.id defaults to the node id.
      expect(child.li_attr).toEqual({ id: child.id });
    });
  });

  describe('HTML parsing', () => {
    it('should generate ids for list items that have none', () => {
      container.innerHTML = '<ul><li><a>Alpha</a></li><li><a>Beta</a></li></ul>';

      const tree = new MDFolderTree(container, {});

      const ids = tree.getAllNodes().map((n) => n.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    });

    it('should still honor explicit ids in the markup', () => {
      container.innerHTML = '<ul><li id="explicit"><a>Alpha</a></li></ul>';

      const tree = new MDFolderTree(container, {});

      expect(tree.getNode('explicit')).not.toBeNull();
    });
  });

  describe('createNode', () => {
    it('should not render the string "undefined" when text is omitted', () => {
      const tree = new MDFolderTree(container, { core: { data: [{ id: 'a', text: 'A' }], check_callback: true } });

      const created = tree.createNode('#', {} as TreeNodeData);

      expect(created).not.toBe(false);
      expect((created as { text: string }).text).toBe('');
      expect(container.textContent).not.toContain('undefined');
    });
  });

  describe('generated ids', () => {
    it('should not collide with ids already in the tree', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'mdft_1', text: 'Squatter' }, { text: 'Generated' } as TreeNodeData] },
      });

      expect(tree.getNode('mdft_1')!.text).toBe('Squatter');
      expect(tree.getAllNodes()).toHaveLength(2);
    });
  });
});
