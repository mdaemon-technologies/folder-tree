import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Plugin order parity with jstree 3.3.16. jstree decorates an instance by
 * walking the consumer's `plugins` array (`$.jstree.create`, 102-106), so the
 * order a consumer lists plugins in is the order they apply. Ours applied a
 * fixed chain of its own regardless, which is observable wherever two plugins
 * answer the same hook: `check` reports the first plugin that refuses.
 */
describe('plugin order parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  // `p` already holds one child named A, so creating another A inside it is
  // refused by types (max_children) and by unique (the name) alike.
  const data = (): TreeNodeData[] => [{ id: 'p', text: 'P', children: [{ id: 'pa', text: 'A' }] }];

  const build = (plugins: string[]) =>
    new MDFolderTree(container, {
      core: { data: data(), check_callback: true },
      plugins,
      types: { default: { max_children: 1 } },
    } as never);

  const errorOf = (tree: MDFolderTree) => tree.last_error() as { plugin: string; id: string };

  it('should let the first listed plugin refuse first', () => {
    const tree = build(['types', 'unique']);

    expect(tree.create_node('p', { text: 'A' })).toBe(false);

    expect(errorOf(tree)).toMatchObject({ plugin: 'types', id: 'types_01' });
  });

  it('should refuse in the consumer order when that order is reversed', () => {
    const tree = build(['unique', 'types']);

    expect(tree.create_node('p', { text: 'A' })).toBe(false);

    expect(errorOf(tree)).toMatchObject({ plugin: 'unique', id: 'unique_04' });
  });

  it('should still apply a type config that never named the plugin', () => {
    const tree = new MDFolderTree(container, {
      core: { data: data(), check_callback: true },
      types: { default: { max_children: 1 } },
    } as never);

    expect(tree.create_node('p', { text: 'B' })).toBe(false);

    expect(errorOf(tree)).toMatchObject({ plugin: 'types', id: 'types_01' });
  });
});
