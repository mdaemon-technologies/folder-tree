import { UniquePlugin } from '../../src/plugins/UniquePlugin';
import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('UniquePlugin', () => {
  describe('unit tests', () => {
    it('should detect duplicate siblings (case-insensitive)', () => {
      const plugin = new UniquePlugin();
      plugin.init({
        config: { unique: { case_sensitive: false } },
        getNodeChildren: () => [
          { id: 'a', text: 'Foo', parent: 'root' } as any,
          { id: 'b', text: 'Bar', parent: 'root' } as any,
        ],
      } as any);

      expect(plugin.isUnique('root', 'Baz')).toBe(true);
      expect(plugin.isUnique('root', 'foo')).toBe(false); // case-insensitive match
      expect(plugin.isUnique('root', 'Foo')).toBe(false);
    });

    it('should detect duplicates case-sensitively when configured', () => {
      const plugin = new UniquePlugin();
      plugin.init({
        config: { unique: { case_sensitive: true } },
        getNodeChildren: () => [
          { id: 'a', text: 'Foo', parent: 'root' } as any,
        ],
      } as any);

      expect(plugin.isUnique('root', 'foo')).toBe(true); // Different case = unique
      expect(plugin.isUnique('root', 'Foo')).toBe(false);
    });

    it('should trim whitespace when configured', () => {
      const plugin = new UniquePlugin();
      plugin.init({
        config: { unique: { trim_whitespace: true } },
        getNodeChildren: () => [
          { id: 'a', text: '  Foo  ', parent: 'root' } as any,
        ],
      } as any);

      expect(plugin.isUnique('root', 'Foo')).toBe(false);
      expect(plugin.isUnique('root', '  Foo  ')).toBe(false);
    });

    it('should exclude a specific node ID from check', () => {
      const plugin = new UniquePlugin();
      plugin.init({
        config: { unique: {} },
        getNodeChildren: () => [
          { id: 'a', text: 'Foo', parent: 'root' } as any,
          { id: 'b', text: 'Bar', parent: 'root' } as any,
        ],
      } as any);

      // Renaming 'a' to 'Foo' should still be unique (it's itself)
      expect(plugin.isUnique('root', 'Foo', 'a')).toBe(true);
      // But renaming 'b' to 'Foo' should not be unique
      expect(plugin.isUnique('root', 'Foo', 'b')).toBe(false);
    });

    it('should generate unique names with duplicate function', () => {
      const plugin = new UniquePlugin();
      plugin.init({
        config: { unique: { duplicate: (name: string, counter: number) => `${name}_${counter}` } },
        getNodeChildren: () => [
          { id: 'a', text: 'Foo', parent: 'root' } as any,
          { id: 'b', text: 'Foo_1', parent: 'root' } as any,
        ],
      } as any);

      expect(plugin.getUniqueName('root', 'Foo')).toBe('Foo_2');
    });
  });

  describe('integration tests', () => {
    let container: HTMLElement;

    const sampleData: TreeNodeData[] = [
      {
        id: 'parent', text: 'Parent', children: [
          { id: 'child-1', text: 'Alpha' },
          { id: 'child-2', text: 'Beta' },
        ],
      },
    ];

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      const instance = MDFolderTree.getInstance(container);
      if (instance) instance.destroy();
      document.body.removeChild(container);
    });

    it('should be registered as a plugin', () => {
      const tree = new MDFolderTree(container, {
        core: { data: sampleData },
        plugins: ['unique'],
        unique: { case_sensitive: false },
      });

      expect(tree).toBeDefined();
    });
  });
});
