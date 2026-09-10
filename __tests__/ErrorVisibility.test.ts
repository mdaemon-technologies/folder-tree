import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Everything ran inside DOM event dispatch or unguarded plugin hooks, where
 * exceptions are swallowed. `core.error` was never invoked for plugin or load
 * failures, so a broken callback failed silently.
 */
describe('Error visibility', () => {
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

  const data: TreeNodeData[] = [{ id: 'a', text: 'A' }];

  describe('activation hooks', () => {
    it('should report a throwing conditionalselect callback', () => {
      const errors: unknown[] = [];
      new MDFolderTree(container, {
        core: { data, error: (e) => errors.push(e) },
        plugins: ['conditionalselect'],
        conditionalselect: () => {
          throw new Error('boom');
        },
      });

      const anchor = container.querySelector('#a > .md-tree-anchor') as HTMLElement;
      expect(() =>
        anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
      ).not.toThrow();

      expect(errors).toContainEqual(
        expect.objectContaining({ error: 'plugin_hook', hook: 'onBeforeActivate' }),
      );
    });

    it('should not activate a node when its veto hook throws', () => {
      const tree = new MDFolderTree(container, {
        core: { data },
        plugins: ['conditionalselect'],
        conditionalselect: () => {
          throw new Error('boom');
        },
      });

      const anchor = container.querySelector('#a > .md-tree-anchor') as HTMLElement;
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(tree.get_selected()).toEqual([]);
    });
  });

  describe('lazy loading', () => {
    it('should report a throwing data callback', () => {
      const errors: unknown[] = [];
      const tree = new MDFolderTree(container, {
        core: {
          error: (e) => errors.push(e),
          data: (node, callback) => {
            if (node.id === '#') {
              callback([{ id: 'root', text: 'Root', children: true } as TreeNodeData]);
              return;
            }
            throw new Error('network down');
          },
        },
      });

      expect(() => tree.load_node('root')).not.toThrow();
      expect(errors).toContainEqual(expect.objectContaining({ error: 'load_failed', id: 'root' }));
    });

    it('should not leave a node stuck in the loading state', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node, callback) => {
            if (node.id === '#') {
              callback([{ id: 'root', text: 'Root', children: true } as TreeNodeData]);
              return;
            }
            throw new Error('network down');
          },
        },
      });

      tree.load_node('root');

      expect(tree.is_loading('root')).toBe(false);
    });
  });
});
