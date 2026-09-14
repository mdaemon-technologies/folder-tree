import { MDFolderTree } from '../src/MDFolderTree';
import { CheckboxPlugin } from '../src/plugins/CheckboxPlugin';
import type { TreeNode, TreeNodeData, TreePlugin, TreePluginHost } from '../src/types';

/**
 * The plugin registry: plugins are registered by name against the class and
 * built by name when a tree lists them, rather than being hardcoded into the
 * core. Consumers register their own the same way the built-ins are, and
 * reach any live plugin through `getPlugin`.
 */
describe('plugin registry', () => {
  let container: HTMLElement;
  let log: string[];

  class MarkerPlugin implements TreePlugin {
    host: TreePluginHost | null = null;
    destroyed = false;
    constructor(readonly name: string) {}
    init(tree: TreePluginHost): void {
      this.host = tree;
      log.push('init:' + this.name);
    }
    destroy(): void {
      this.destroyed = true;
      log.push('destroy:' + this.name);
    }
    onBeforeRender(nodes: TreeNode[]): TreeNode[] {
      log.push('render:' + this.name);
      return nodes;
    }
  }

  beforeAll(() => {
    for (const name of ['marker', 'alpha', 'beta']) {
      MDFolderTree.registerPlugin(name, () => new MarkerPlugin(name));
    }
  });

  beforeEach(() => {
    log = [];
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const data = (): TreeNodeData[] => [{ id: 'a', text: 'A' }];
  const build = (plugins: string[]) =>
    new MDFolderTree(container, { core: { data: data(), check_callback: true }, plugins } as never);

  describe('registering', () => {
    it('should build a registered plugin the tree names', () => {
      const tree = build(['marker']);

      const plugin = tree.getPlugin<MarkerPlugin>('marker');

      expect(plugin).toBeInstanceOf(MarkerPlugin);
      expect(plugin?.host).toBe(tree);
    });

    it('should pass over a name nothing is registered under', () => {
      const tree = build(['marker', 'nonesuch']);

      expect(tree.getPlugin('nonesuch')).toBeNull();
      expect(tree.getPlugin('marker')).not.toBeNull();
    });

    it('should find a plugin under the name it was registered by', () => {
      // The name a tree lists is the registered one; what the plugin calls
      // itself is its own affair, as jstree keys `_data[deco]` by the former.
      MDFolderTree.registerPlugin('audit', () => new MarkerPlugin('auditor'));

      const tree = build(['audit']);

      expect(tree.getPlugin<MarkerPlugin>('audit')?.name).toBe('auditor');
    });

    it('should not build a registered plugin the tree never named', () => {
      const tree = build([]);

      expect(tree.getPlugin('marker')).toBeNull();
    });

    it('should tear a registered plugin down with the tree', () => {
      const tree = build(['marker']);
      const plugin = tree.getPlugin<MarkerPlugin>('marker');

      tree.destroy();

      expect(plugin?.destroyed).toBe(true);
    });
  });

  describe('the built-ins', () => {
    it('should be registered the same way, and reachable by name', () => {
      const tree = build(['checkbox']);

      expect(tree.getPlugin('checkbox')).toBeInstanceOf(CheckboxPlugin);
      expect(tree.getPlugin('search')).toBeNull();
    });
  });

  describe('order', () => {
    it('should run hooks in the order the tree listed them', () => {
      build(['beta', 'alpha']);

      expect(log.filter((entry) => entry.startsWith('init:'))).toEqual(['init:beta', 'init:alpha']);
      expect(log.filter((entry) => entry.startsWith('render:'))).toEqual(['render:beta', 'render:alpha']);
    });
  });
});
