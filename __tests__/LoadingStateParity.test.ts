import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode, TreeNodeData } from '../src/types';

/**
 * Loading affordances, as jstree 3.3.16 shows them: a node being loaded
 * carries `md-tree-loading`, with `aria-busy` on its anchor, and while the
 * root loads the tree shows a placeholder node reading
 * `get_string('Loading ...')` — both going as soon as the nodes arrive.
 */
describe('loading state parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  /** A tree whose root loads at once and whose lazy node waits to be released. */
  const lazyTree = () => {
    let release: ((data: TreeNodeData[]) => void) | null = null;
    const tree = new MDFolderTree(container, {
      core: {
        data: (node: TreeNode, callback: (data: TreeNodeData[]) => void) => {
          if (node.id === '#') callback([{ id: 'lz', text: 'LZ', children: true } as unknown as TreeNodeData]);
          else release = callback;
        },
      },
    } as never);
    return { tree, release: () => release };
  };

  /** A tree whose root load never finishes until it is released. */
  const pendingTree = (core: Record<string, unknown> = {}) => {
    let release: ((data: TreeNodeData[]) => void) | null = null;
    new MDFolderTree(container, {
      core: { data: (_node: TreeNode, callback: (data: TreeNodeData[]) => void) => (release = callback), ...core },
    } as never);
    return () => release;
  };

  describe('a node being loaded', () => {
    it('should carry the loading class and mark its anchor busy', () => {
      const { tree, release } = lazyTree();

      tree.load_node('lz');

      const loading = container.querySelector('#lz') as HTMLElement;
      expect(loading.classList.contains('md-tree-loading')).toBe(true);
      expect(loading.querySelector('.md-tree-anchor')!.getAttribute('aria-busy')).toBe('true');
    });

    it('should drop both once the load finishes', () => {
      const { tree, release } = lazyTree();
      tree.load_node('lz');

      release()!([{ id: 'k', text: 'K' }]);

      const loaded = container.querySelector('#lz') as HTMLElement;
      expect(loaded.classList.contains('md-tree-loading')).toBe(false);
      expect(loaded.querySelector('.md-tree-anchor')!.getAttribute('aria-busy')).toBe('false');
    });

    it('should keep the class through a redraw', () => {
      const { tree } = lazyTree();
      tree.load_node('lz');

      tree.redraw();

      expect(container.querySelector('#lz')!.classList.contains('md-tree-loading')).toBe(true);
    });
  });

  describe('the initial placeholder', () => {
    it('should stand in until the root arrives', () => {
      const release = pendingTree();

      const placeholder = container.querySelector('.md-tree-initial-node');
      expect(placeholder).not.toBeNull();
      expect(placeholder!.textContent).toContain('Loading ...');
      expect(container.querySelectorAll('.md-tree-node')).toHaveLength(0);

      release()!([{ id: 'a', text: 'A' }]);

      expect(container.querySelector('.md-tree-initial-node')).toBeNull();
      expect(container.querySelector('#a')).not.toBeNull();
    });

    it('should take its text through get_string', () => {
      pendingTree({ strings: { 'Loading ...': 'Chargement…' } });

      expect(container.querySelector('.md-tree-initial-node')!.textContent).toContain('Chargement…');
    });

    it('should mark the container busy while the root loads', () => {
      const release = pendingTree();

      expect(container.classList.contains('md-tree-loading')).toBe(true);
      expect(container.getAttribute('aria-busy')).toBe('true');

      release()!([{ id: 'a', text: 'A' }]);

      expect(container.classList.contains('md-tree-loading')).toBe(false);
      expect(container.getAttribute('aria-busy')).toBe('false');
    });
  });
});
