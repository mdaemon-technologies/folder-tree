import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Theme Toggles', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Node 1', icon: 'icon-folder' },
    { id: 'n2', text: 'Node 2' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: sampleData, themes: { dots: true, icons: true } },
    });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  // Stripes
  test('show_stripes adds md-tree-striped class', () => {
    tree.show_stripes();
    expect(container.classList.contains('md-tree-striped')).toBe(true);
  });

  test('hide_stripes removes md-tree-striped class', () => {
    tree.show_stripes();
    tree.hide_stripes();
    expect(container.classList.contains('md-tree-striped')).toBe(false);
  });

  test('toggle_stripes toggles the class', () => {
    tree.toggle_stripes();
    expect(container.classList.contains('md-tree-striped')).toBe(true);
    tree.toggle_stripes();
    expect(container.classList.contains('md-tree-striped')).toBe(false);
  });

  // Dots
  test('hide_dots adds md-tree-no-dots class', () => {
    tree.hide_dots();
    expect(container.classList.contains('md-tree-no-dots')).toBe(true);
  });

  test('show_dots removes md-tree-no-dots class', () => {
    tree.hide_dots();
    tree.show_dots();
    expect(container.classList.contains('md-tree-no-dots')).toBe(false);
  });

  test('toggle_dots toggles the class', () => {
    tree.toggle_dots();
    expect(container.classList.contains('md-tree-no-dots')).toBe(true);
    tree.toggle_dots();
    expect(container.classList.contains('md-tree-no-dots')).toBe(false);
  });

  // Icons
  test('hide_icons adds md-tree-no-icons class', () => {
    tree.hide_icons();
    expect(container.classList.contains('md-tree-no-icons')).toBe(true);
  });

  test('show_icons removes md-tree-no-icons class', () => {
    tree.hide_icons();
    tree.show_icons();
    expect(container.classList.contains('md-tree-no-icons')).toBe(false);
  });

  test('toggle_icons toggles the class', () => {
    tree.toggle_icons();
    expect(container.classList.contains('md-tree-no-icons')).toBe(true);
    tree.toggle_icons();
    expect(container.classList.contains('md-tree-no-icons')).toBe(false);
  });

  // Ellipsis
  test('show_ellipsis adds md-tree-ellipsis class', () => {
    tree.show_ellipsis();
    expect(container.classList.contains('md-tree-ellipsis')).toBe(true);
  });

  test('hide_ellipsis removes md-tree-ellipsis class', () => {
    tree.show_ellipsis();
    tree.hide_ellipsis();
    expect(container.classList.contains('md-tree-ellipsis')).toBe(false);
  });

  test('toggle_ellipsis toggles the class', () => {
    tree.toggle_ellipsis();
    expect(container.classList.contains('md-tree-ellipsis')).toBe(true);
    tree.toggle_ellipsis();
    expect(container.classList.contains('md-tree-ellipsis')).toBe(false);
  });

  // Per-node icon management
  test('set_icon updates node icon', () => {
    expect(tree.set_icon('n1', 'new-icon')).toBe(true);
    expect(tree.get_icon('n1')).toBe('new-icon');
  });

  test('get_icon returns node icon', () => {
    expect(tree.get_icon('n1')).toBe('icon-folder');
  });

  test('get_icon returns false for unknown node', () => {
    expect(tree.get_icon('nonexistent')).toBe(false);
  });

  // Events
  test('show_stripes emits event', () => {
    const handler = jest.fn();
    container.addEventListener('show_stripes.MDFolderTree', handler);
    tree.show_stripes();
    expect(handler).toHaveBeenCalled();
  });

  test('hide_dots emits event', () => {
    const handler = jest.fn();
    container.addEventListener('hide_dots.MDFolderTree', handler);
    tree.hide_dots();
    expect(handler).toHaveBeenCalled();
  });
});
