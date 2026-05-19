import { TypesPlugin } from '../../src/plugins/TypesPlugin';

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
});
