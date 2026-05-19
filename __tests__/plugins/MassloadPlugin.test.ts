import { MassloadPlugin } from '../../src/plugins/MassloadPlugin';
import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('MassloadPlugin', () => {
  describe('unit tests', () => {
    it('should batch multiple load requests', () => {
      const plugin = new MassloadPlugin();
      plugin.init({
        config: { massload: {} },
        getNode: () => null,
        redraw: jest.fn(),
        createNode: jest.fn(),
      } as any);

      plugin.queueLoad('node-1');
      plugin.queueLoad('node-2');
      plugin.queueLoad('node-3');

      // Pending should have 3 nodes (internal state)
      expect((plugin as any).pending.size).toBe(3);
    });

    it('should deduplicate queued node IDs', () => {
      const plugin = new MassloadPlugin();
      plugin.init({
        config: { massload: {} },
        getNode: () => null,
        redraw: jest.fn(),
        createNode: jest.fn(),
      } as any);

      plugin.queueLoad('node-1');
      plugin.queueLoad('node-1');
      plugin.queueLoad('node-1');

      expect((plugin as any).pending.size).toBe(1);
    });

    it('should accept multiple node IDs at once', () => {
      const plugin = new MassloadPlugin();
      plugin.init({
        config: { massload: {} },
        getNode: () => null,
        redraw: jest.fn(),
        createNode: jest.fn(),
      } as any);

      plugin.queueLoadMultiple(['a', 'b', 'c']);
      expect((plugin as any).pending.size).toBe(3);
    });

    it('should clean up on destroy', () => {
      const plugin = new MassloadPlugin();
      plugin.init({
        config: { massload: {} },
        getNode: () => null,
        redraw: jest.fn(),
        createNode: jest.fn(),
      } as any);

      plugin.queueLoad('x');
      plugin.destroy();

      expect((plugin as any).pending.size).toBe(0);
      expect((plugin as any).debounceTimer).toBeNull();
    });
  });

  describe('integration tests', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      const instance = MDFolderTree.getInstance(container);
      if (instance) instance.destroy();
      document.body.removeChild(container);
    });

    it('should register as a plugin without errors', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'root', text: 'Root' }] },
        plugins: ['massload'],
        massload: {
          url: '/api/nodes',
          data: (ids) => ({ ids }),
          callback: (ids, response) => ({}),
        },
      });

      expect(tree).toBeDefined();
    });
  });
});
