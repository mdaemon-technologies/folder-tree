import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Inline Editing', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Original Name' },
    { id: 'n2', text: 'Another Node' },
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

  test('edit creates an input element', () => {
    tree.edit('n1');
    const input = container.querySelector('#n1 .md-tree-rename-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Original Name');
  });

  test('edit with default text pre-fills input', () => {
    tree.edit('n1', 'Custom Default');
    const input = container.querySelector('#n1 .md-tree-rename-input') as HTMLInputElement;
    expect(input!.value).toBe('Custom Default');
  });

  test('edit commits on Enter', () => {
    const callback = jest.fn();
    tree.edit('n1', undefined, callback);
    const input = container.querySelector('#n1 .md-tree-rename-input') as HTMLInputElement;
    input.value = 'New Name';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(tree.get_text('n1')).toBe('New Name');
    expect(callback).toHaveBeenCalledWith(expect.anything(), true, false);
  });

  test('edit cancels on Escape', () => {
    const callback = jest.fn();
    tree.edit('n1', undefined, callback);
    const input = container.querySelector('#n1 .md-tree-rename-input') as HTMLInputElement;
    input.value = 'Should Not Apply';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tree.get_text('n1')).toBe('Original Name');
    expect(callback).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  test('edit removes input after commit', () => {
    tree.edit('n1');
    const input = container.querySelector('#n1 .md-tree-rename-input') as HTMLInputElement;
    input.value = 'Changed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const afterInput = container.querySelector('#n1 .md-tree-rename-input');
    expect(afterInput).toBeNull();
  });

  test('edit emits edit event', () => {
    const handler = jest.fn();
    container.addEventListener('edit.MDFolderTree', handler);
    tree.edit('n1');
    expect(handler).toHaveBeenCalled();
  });

  test('edit does nothing for unknown node', () => {
    tree.edit('nonexistent');
    const inputs = container.querySelectorAll('.md-tree-rename-input');
    expect(inputs.length).toBe(0);
  });

  test('edit with unchanged text does not rename', () => {
    const callback = jest.fn();
    tree.edit('n1', undefined, callback);
    const input = container.querySelector('#n1 .md-tree-rename-input') as HTMLInputElement;
    // Don't change value, just press Enter
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(tree.get_text('n1')).toBe('Original Name');
    expect(callback).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});
