import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Lifecycle Events', () => {
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
    { id: 'solo', text: 'Solo' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const inst = MDFolderTree.getInstance(container);
    if (inst) inst.destroy();
    document.body.removeChild(container);
  });

  test('loading event fires during initialization', () => {
    const handler = jest.fn();
    container.addEventListener('loading.MDFolderTree', handler);
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    expect(handler).toHaveBeenCalled();
  });

  test('loaded event fires after initialization', () => {
    const handler = jest.fn();
    container.addEventListener('loaded.MDFolderTree', handler);
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    expect(handler).toHaveBeenCalled();
  });

  test('ready event fires after loaded', () => {
    const order: string[] = [];
    container.addEventListener('loaded.MDFolderTree', () => order.push('loaded'));
    container.addEventListener('ready.MDFolderTree', () => order.push('ready'));
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    expect(order).toEqual(['loaded', 'ready']);
  });

  test('before_open event fires before open_node', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    const order: string[] = [];
    container.addEventListener('before_open.MDFolderTree', () => order.push('before_open'));
    container.addEventListener('open_node.MDFolderTree', () => order.push('open_node'));
    container.addEventListener('after_open.MDFolderTree', () => order.push('after_open'));
    tree.open_node('folder');
    expect(order).toEqual(['before_open', 'open_node', 'after_open']);
  });

  test('after_close event fires after close_node', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    tree.open_node('folder');
    const order: string[] = [];
    container.addEventListener('close_node.MDFolderTree', () => order.push('close_node'));
    container.addEventListener('after_close.MDFolderTree', () => order.push('after_close'));
    tree.close_node('folder');
    expect(order).toEqual(['close_node', 'after_close']);
  });

  test('activate_node event fires on click', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    const handler = jest.fn();
    container.addEventListener('activate_node.MDFolderTree', handler);
    const anchor = container.querySelector('#solo > .md-tree-anchor') as HTMLElement;
    anchor.click();
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.node.id).toBe('solo');
  });

  test('hover_node event fires on mouseenter', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    const handler = jest.fn();
    container.addEventListener('hover_node.MDFolderTree', handler);
    const anchor = container.querySelector('#solo > .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(handler).toHaveBeenCalled();
  });

  test('dehover_node event fires on mouseleave', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    const handler = jest.fn();
    container.addEventListener('dehover_node.MDFolderTree', handler);
    const anchor = container.querySelector('#solo > .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(handler).toHaveBeenCalled();
  });

  test('enable_node event fires', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    tree.disable_node('solo');
    const handler = jest.fn();
    container.addEventListener('enable_node.MDFolderTree', handler);
    tree.enable_node('solo');
    expect(handler).toHaveBeenCalled();
  });

  test('disable_node event fires', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    const handler = jest.fn();
    container.addEventListener('disable_node.MDFolderTree', handler);
    tree.disable_node('solo');
    expect(handler).toHaveBeenCalled();
  });

  test('redraw event fires on redraw()', () => {
    tree = new MDFolderTree(container, { core: { data: sampleData } });
    const handler = jest.fn();
    container.addEventListener('redraw.MDFolderTree', handler);
    tree.redraw();
    expect(handler).toHaveBeenCalled();
  });
});
