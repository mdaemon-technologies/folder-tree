import { MassloadPlugin } from '../../src/plugins/MassloadPlugin';
import { MDFolderTree } from '../../src/MDFolderTree';

// The massload plugin as jstree's. Its end-to-end behavior is covered by
// MassloadParity.test.ts; these check the answer cache.
describe('MassloadPlugin', () => {
  describe('unit tests', () => {
    const host = (massload: unknown) => ({ config: { massload } }) as any;
    const answering = (data: Record<string, unknown>) =>
      host((_ids: string[], callback: (d: unknown) => void) => callback(data));

    it('should hand each prefetched answer out once', () => {
      const plugin = new MassloadPlugin();
      plugin.init(answering({ a: [{ id: 'x', text: 'X' }] }));
      const proceed = jest.fn();

      plugin.prefetch(['a'], proceed);

      expect(proceed).toHaveBeenCalledTimes(1);
      expect(plugin.take('a')).toEqual([{ id: 'x', text: 'X' }]);
      expect(plugin.take('a')).toBeUndefined();
    });

    it('should proceed at once without a massload function', () => {
      const plugin = new MassloadPlugin();
      plugin.init(host(null));
      const proceed = jest.fn();

      plugin.prefetch(['a'], proceed);

      expect(proceed).toHaveBeenCalledTimes(1);
      expect(plugin.take('a')).toBeUndefined();
    });

    it('should clean up on destroy', () => {
      const plugin = new MassloadPlugin();
      plugin.init(answering({ a: [] }));
      plugin.prefetch(['a'], () => undefined);

      plugin.destroy();

      expect(plugin.take('a')).toBeUndefined();
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
        massload: (_ids, callback) => callback({}),
      });

      expect(tree).toBeDefined();
    });
  });
});
