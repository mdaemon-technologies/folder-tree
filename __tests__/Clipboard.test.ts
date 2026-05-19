import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Clipboard (cut/copy/paste)', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'folder-1',
      text: 'Folder 1',
      state: { opened: true },
      children: [
        { id: 'file-1', text: 'File A' },
        { id: 'file-2', text: 'File B' },
      ],
    },
    {
      id: 'folder-2',
      text: 'Folder 2',
      state: { opened: true },
      children: [
        { id: 'file-3', text: 'File C' },
      ],
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, { core: { data: sampleData, check_callback: true } });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  test('cut stores buffer with mode cut', () => {
    tree.cut('file-1');
    const buffer = tree.get_buffer();
    expect(buffer).not.toBeNull();
    expect(buffer!.mode).toBe('cut');
    expect(buffer!.ids).toEqual(['file-1']);
  });

  test('cut adds md-tree-cut class', () => {
    tree.cut('file-1');
    const el = container.querySelector('#file-1');
    expect(el!.classList.contains('md-tree-cut')).toBe(true);
  });

  test('copy stores buffer with mode copy', () => {
    tree.copy(['file-1', 'file-2']);
    const buffer = tree.get_buffer();
    expect(buffer!.mode).toBe('copy');
    expect(buffer!.ids).toEqual(['file-1', 'file-2']);
  });

  test('copy does not add md-tree-cut class', () => {
    tree.copy('file-1');
    const el = container.querySelector('#file-1');
    expect(el!.classList.contains('md-tree-cut')).toBe(false);
  });

  test('can_paste returns false with no buffer', () => {
    expect(tree.can_paste()).toBe(false);
  });

  test('can_paste returns true after cut', () => {
    tree.cut('file-1');
    expect(tree.can_paste()).toBe(true);
  });

  test('paste with cut moves node', () => {
    tree.cut('file-1');
    const result = tree.paste('folder-2');
    expect(result).toBe(true);
    // file-1 should now be under folder-2
    const node = tree.get_node('file-1');
    expect(node).not.toBeNull();
    expect((node as any).parent).toBe('folder-2');
  });

  test('paste with copy copies node', () => {
    tree.copy('file-1');
    const result = tree.paste('folder-2');
    expect(result).toBe(true);
    // Original still exists
    expect(tree.get_node('file-1')).not.toBeNull();
    // folder-2 should have new child
    const folder2 = tree.get_node('folder-2');
    expect((folder2 as any).children.length).toBe(2);
  });

  test('paste clears buffer', () => {
    tree.cut('file-1');
    tree.paste('folder-2');
    expect(tree.get_buffer()).toBeNull();
    expect(tree.can_paste()).toBe(false);
  });

  test('clear_buffer removes cut visual', () => {
    tree.cut('file-1');
    tree.clear_buffer();
    const el = container.querySelector('#file-1');
    expect(el!.classList.contains('md-tree-cut')).toBe(false);
  });

  test('cut emits event', () => {
    const handler = jest.fn();
    container.addEventListener('cut.MDFolderTree', handler);
    tree.cut('file-1');
    expect(handler).toHaveBeenCalled();
  });

  test('paste emits event', () => {
    const handler = jest.fn();
    container.addEventListener('paste.MDFolderTree', handler);
    tree.cut('file-1');
    tree.paste('folder-2');
    expect(handler).toHaveBeenCalled();
  });
});
