import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('State API (get_state / set_state)', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'folder',
      text: 'Folder',
      children: [
        { id: 'file-1', text: 'File 1' },
        { id: 'file-2', text: 'File 2' },
      ],
    },
    { id: 'root-2', text: 'Root 2' },
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

  test('get_state returns opened and selected arrays', () => {
    tree.open_node('folder');
    tree.select_node('file-1');
    const state = tree.get_state();
    expect(state.opened).toContain('folder');
    expect(state.selected).toContain('file-1');
  });

  test('get_state returns empty arrays when nothing is opened/selected', () => {
    const state = tree.get_state();
    expect(state.selected).toEqual([]);
  });

  test('set_state restores opened and selected nodes', () => {
    const savedState = { opened: ['folder'], selected: ['file-2'] };
    tree.set_state(savedState);
    expect(tree.is_open('folder')).toBe(true);
    expect(tree.is_selected('file-2')).toBe(true);
  });

  test('set_state deselects previously selected nodes', () => {
    tree.select_node('file-1');
    tree.set_state({ opened: [], selected: ['file-2'] });
    expect(tree.is_selected('file-1')).toBe(false);
    expect(tree.is_selected('file-2')).toBe(true);
  });

  test('set_state emits set_state event', () => {
    const handler = jest.fn();
    container.addEventListener('set_state.MDFolderTree', handler);
    tree.set_state({ opened: ['folder'], selected: [] });
    expect(handler).toHaveBeenCalled();
  });

  test('set_state calls callback when provided', () => {
    const cb = jest.fn();
    tree.set_state({ opened: [], selected: [] }, cb);
    expect(cb).toHaveBeenCalled();
  });
});
