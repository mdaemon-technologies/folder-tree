import { TypesPlugin } from '../../src/plugins/TypesPlugin';
import { MDFolderTree } from '../../src/MDFolderTree';

describe('TypesPlugin', () => {
  it('should resolve icon class from type config', () => {
    const plugin = new TypesPlugin();
    plugin.init({
      config: {
        types: {
          default: { icon: 'md-tree-icon-folder' },
          email: { icon: 'md-tree-icon-email' },
        },
      },
    } as any);

    expect(plugin.getIconForType('email')).toBe('md-tree-icon-email');
    expect(plugin.getIconForType('default')).toBe('md-tree-icon-folder');
  });

  it('should fall back to default type', () => {
    const plugin = new TypesPlugin();
    plugin.init({
      config: {
        types: {
          default: { icon: 'md-tree-icon-folder' },
        },
      },
    } as any);

    expect(plugin.getIconForType('unknown')).toBe('md-tree-icon-folder');
  });

  it('should return false when icon is false', () => {
    const plugin = new TypesPlugin();
    plugin.init({
      config: {
        types: {
          hidden: { icon: false },
        },
      },
    } as any);

    expect(plugin.getIconForType('hidden')).toBe(false);
  });

  describe('icon precedence', () => {
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

    it('should let an explicit node icon win over its type icon', () => {
      new MDFolderTree(container, {
        core: { data: [{ id: 'n', text: 'N', type: 'folder', icon: 'my-node-icon' }] },
        types: { folder: { icon: 'type-icon' } },
        plugins: ['types'],
      });

      const icon = container.querySelector('#n .md-tree-themeicon') as HTMLElement;
      expect(icon.className).toContain('my-node-icon');
      expect(icon.className).not.toContain('type-icon');
    });

    it('should apply the type icon when the node has none', () => {
      new MDFolderTree(container, {
        core: { data: [{ id: 'n', text: 'N', type: 'folder' }] },
        types: { folder: { icon: 'type-icon' } },
        plugins: ['types'],
      });

      const icon = container.querySelector('#n .md-tree-themeicon') as HTMLElement;
      expect(icon.className).toContain('type-icon');
    });
  });
});