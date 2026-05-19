import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeConfig, TreeNodeData } from '../src/types';

describe('MDFolderTree', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-tree';
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  const sampleData: TreeNodeData[] = [
    {
      id: 'node-1',
      text: 'Node 1',
      type: 'folder',
      children: [
        { id: 'node-1-1', text: 'Child 1', type: 'file' },
        { id: 'node-1-2', text: 'Child 2', type: 'file' },
      ],
    },
    {
      id: 'node-2',
      text: 'Node 2',
      type: 'folder',
    },
  ];

  it('should create an instance with JSON data', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
    });

    expect(tree).toBeDefined();
    expect(container.classList.contains('md-tree')).toBe(true);
    expect(container.classList.contains('md-tree-default')).toBe(true);
  });

  it('should store instance on element', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
    });

    expect(MDFolderTree.getInstance(container)).toBe(tree);
  });

  it('should render nodes into the DOM', () => {
    new MDFolderTree(container, { core: { data: sampleData } });

    const nodes = container.querySelectorAll('.md-tree-node');
    expect(nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('should get node by ID', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    const node = tree.get_node('node-1');
    expect(node).not.toBeNull();
    expect(node!.text).toBe('Node 1');
  });

  it('should get node as DOM element', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    const el = tree.get_node('node-1', true) as HTMLElement;
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.id).toBe('node-1');
  });

  it('should select and deselect nodes', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    tree.select_node('node-1');
    expect(tree.get_selected()).toContain('node-1');

    tree.deselect_node('node-1');
    expect(tree.get_selected()).not.toContain('node-1');
  });

  it('should select all and deselect all', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    tree.select_all(true);
    expect(tree.get_selected().length).toBeGreaterThan(0);

    tree.deselect_all(true);
    expect(tree.get_selected().length).toBe(0);
  });

  it('should open and close nodes', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    tree.open_node('node-1');
    const node = tree.get_node('node-1');
    expect(node!.state.opened).toBe(true);

    tree.close_node('node-1');
    expect(tree.get_node('node-1')!.state.opened).toBe(false);
  });

  it('should open all and close all', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    tree.open_all();
    expect(tree.get_node('node-1')!.state.opened).toBe(true);

    tree.close_all();
    expect(tree.get_node('node-1')!.state.opened).toBe(false);
  });

  it('should enable and disable nodes', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    tree.disable_node('node-1');
    expect(tree.get_node('node-1')!.state.disabled).toBe(true);

    tree.enable_node('node-1');
    expect(tree.get_node('node-1')!.state.disabled).toBe(false);
  });

  it('should destroy cleanly', () => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });
    tree.destroy();

    expect(MDFolderTree.getInstance(container)).toBeNull();
    expect(container.classList.contains('md-tree')).toBe(false);
    expect(container.innerHTML).toBe('');
  });

  it('should emit events on select', (done) => {
    const tree = new MDFolderTree(container, { core: { data: sampleData } });

    container.addEventListener('select_node.MDFolderTree', ((e: CustomEvent) => {
      expect(e.detail.node.id).toBe('node-2');
      done();
    }) as EventListener);

    tree.select_node('node-2');
  });

  it('should support single-select mode', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData, multiple: false },
    });

    tree.select_node('node-1');
    tree.select_node('node-2');

    expect(tree.get_selected()).toEqual(['node-2']);
  });
});
