import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Theme Runtime API', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Node 1' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, { core: { data: sampleData } });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  test('get_theme returns default theme name', () => {
    expect(tree.get_theme()).toBe('default');
  });

  test('set_theme changes theme class', () => {
    tree.set_theme('dark');
    expect(tree.get_theme()).toBe('dark');
    expect(container.classList.contains('md-tree-dark')).toBe(true);
    expect(container.classList.contains('md-tree-default')).toBe(false);
  });

  test('set_theme emits set_theme event', () => {
    const handler = jest.fn();
    container.addEventListener('set_theme.MDFolderTree', handler);
    tree.set_theme('compact');
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.theme).toBe('compact');
  });

  test('set_theme_variant adds variant class', () => {
    tree.set_theme_variant('large');
    expect(container.classList.contains('md-tree-default-large')).toBe(true);
  });

  test('set_theme_variant removes previous variant', () => {
    tree.set_theme_variant('large');
    tree.set_theme_variant('small');
    expect(container.classList.contains('md-tree-default-large')).toBe(false);
    expect(container.classList.contains('md-tree-default-small')).toBe(true);
  });

  test('set_theme_variant(false) removes variant class', () => {
    tree.set_theme_variant('large');
    tree.set_theme_variant(false);
    expect(container.classList.contains('md-tree-default-large')).toBe(false);
  });
});
