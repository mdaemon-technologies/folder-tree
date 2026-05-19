import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('Checkbox Plugin - Full API', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'parent',
      text: 'Parent',
      state: { opened: true },
      children: [
        { id: 'child-1', text: 'Child 1' },
        { id: 'child-2', text: 'Child 2' },
        { id: 'child-3', text: 'Child 3' },
      ],
    },
    { id: 'solo', text: 'Solo Node' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: sampleData },
      checkbox: { three_state: true },
      plugins: ['checkbox'],
    });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  test('check_node checks a node', () => {
    tree.check_node('solo');
    expect(tree.is_checked('solo')).toBe(true);
  });

  test('check_node cascades to children', () => {
    tree.check_node('parent');
    expect(tree.is_checked('child-1')).toBe(true);
    expect(tree.is_checked('child-2')).toBe(true);
    expect(tree.is_checked('child-3')).toBe(true);
  });

  test('uncheck_node unchecks a node', () => {
    tree.check_node('solo');
    tree.uncheck_node('solo');
    expect(tree.is_checked('solo')).toBe(false);
  });

  test('uncheck_node cascades to children', () => {
    tree.check_node('parent');
    tree.uncheck_node('parent');
    expect(tree.is_checked('child-1')).toBe(false);
    expect(tree.is_checked('child-2')).toBe(false);
  });

  test('check_all checks all nodes', () => {
    tree.check_all();
    expect(tree.is_checked('parent')).toBe(true);
    expect(tree.is_checked('child-1')).toBe(true);
    expect(tree.is_checked('solo')).toBe(true);
  });

  test('uncheck_all unchecks all nodes', () => {
    tree.check_all();
    tree.uncheck_all();
    expect(tree.is_checked('parent')).toBe(false);
    expect(tree.is_checked('solo')).toBe(false);
  });

  test('get_checked returns checked IDs', () => {
    tree.check_node('solo');
    tree.check_node('child-1');
    const checked = tree.get_checked();
    expect(checked).toContain('solo');
    expect(checked).toContain('child-1');
  });

  test('get_top_checked returns top-level checked only', () => {
    tree.check_node('parent'); // cascades to children
    const top = tree.get_top_checked();
    expect(top).toContain('parent');
    expect(top).not.toContain('child-1');
  });

  test('get_bottom_checked returns leaf checked only', () => {
    tree.check_node('parent');
    const bottom = tree.get_bottom_checked();
    expect(bottom).toContain('child-1');
    expect(bottom).toContain('child-2');
    expect(bottom).not.toContain('parent');
  });

  test('is_undetermined detects partial state', () => {
    tree.check_node('child-1');
    // parent should be undetermined (not all children checked)
    expect(tree.is_undetermined('parent')).toBe(true);
  });

  test('get_undetermined returns undetermined IDs', () => {
    tree.check_node('child-1');
    const und = tree.get_undetermined();
    expect(und).toContain('parent');
  });

  test('show_checkboxes / hide_checkboxes toggles visibility', () => {
    tree.hide_checkboxes();
    const cb = container.querySelector('.md-tree-checkbox') as HTMLElement;
    expect(cb.style.display).toBe('none');
    tree.show_checkboxes();
    expect(cb.style.display).toBe('');
  });

  test('toggle_checkboxes toggles state', () => {
    tree.toggle_checkboxes();
    const cb = container.querySelector('.md-tree-checkbox') as HTMLElement;
    expect(cb.style.display).toBe('none');
    tree.toggle_checkboxes();
    expect(cb.style.display).toBe('');
  });

  test('disable_checkbox adds disabled class', () => {
    tree.disable_checkbox('child-1');
    const cb = container.querySelector('#child-1 > .md-tree-anchor > .md-tree-checkbox');
    expect(cb!.classList.contains('md-tree-checkbox-disabled')).toBe(true);
  });

  test('enable_checkbox removes disabled class', () => {
    tree.disable_checkbox('child-1');
    tree.enable_checkbox('child-1');
    const cb = container.querySelector('#child-1 > .md-tree-anchor > .md-tree-checkbox');
    expect(cb!.classList.contains('md-tree-checkbox-disabled')).toBe(false);
  });

  test('check_node emits event', () => {
    const handler = jest.fn();
    container.addEventListener('check_node.MDFolderTree', handler);
    tree.check_node('solo');
    expect(handler).toHaveBeenCalled();
  });

  test('uncheck_node emits event', () => {
    const handler = jest.fn();
    container.addEventListener('uncheck_node.MDFolderTree', handler);
    tree.check_node('solo');
    tree.uncheck_node('solo');
    expect(handler).toHaveBeenCalled();
  });
});

describe('Checkbox Plugin - without plugin enabled', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: [{ id: 'n1', text: 'Node' }] },
      plugins: [], // no checkbox
    });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  test('checkbox methods are no-ops without plugin', () => {
    tree.check_node('n1');
    expect(tree.is_checked('n1')).toBe(false);
    expect(tree.get_checked()).toEqual([]);
  });
});
