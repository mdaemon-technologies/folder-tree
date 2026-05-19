import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Node Visibility', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Node 1' },
    { id: 'n2', text: 'Node 2' },
    { id: 'n3', text: 'Node 3' },
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

  test('hide_node adds hidden class', () => {
    tree.hide_node('n1');
    const el = container.querySelector('#n1');
    expect(el!.classList.contains('md-tree-hidden')).toBe(true);
  });

  test('hide_node sets state.hidden to true', () => {
    tree.hide_node('n1');
    expect(tree.is_hidden('n1')).toBe(true);
  });

  test('show_node removes hidden class', () => {
    tree.hide_node('n1');
    tree.show_node('n1');
    const el = container.querySelector('#n1');
    expect(el!.classList.contains('md-tree-hidden')).toBe(false);
  });

  test('show_node sets state.hidden to false', () => {
    tree.hide_node('n1');
    tree.show_node('n1');
    expect(tree.is_hidden('n1')).toBe(false);
  });

  test('hide_all hides all nodes', () => {
    tree.hide_all();
    expect(tree.is_hidden('n1')).toBe(true);
    expect(tree.is_hidden('n2')).toBe(true);
    expect(tree.is_hidden('n3')).toBe(true);
    const els = container.querySelectorAll('.md-tree-hidden');
    expect(els.length).toBe(3);
  });

  test('show_all shows all nodes', () => {
    tree.hide_all();
    tree.show_all();
    expect(tree.is_hidden('n1')).toBe(false);
    expect(tree.is_hidden('n2')).toBe(false);
    expect(tree.is_hidden('n3')).toBe(false);
  });

  test('hide_node emits event', () => {
    const handler = jest.fn();
    container.addEventListener('hide_node.MDFolderTree', handler);
    tree.hide_node('n1');
    expect(handler).toHaveBeenCalled();
  });

  test('show_node emits event', () => {
    const handler = jest.fn();
    container.addEventListener('show_node.MDFolderTree', handler);
    tree.hide_node('n1');
    tree.show_node('n1');
    expect(handler).toHaveBeenCalled();
  });

  test('is_hidden returns false by default', () => {
    expect(tree.is_hidden('n1')).toBe(false);
  });

  test('is_hidden returns false for unknown nodes', () => {
    expect(tree.is_hidden('nonexistent')).toBe(false);
  });
});
