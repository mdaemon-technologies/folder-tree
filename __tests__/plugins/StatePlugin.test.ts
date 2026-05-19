import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('StatePlugin', () => {
  let container: HTMLElement;
  let mockStorage: Record<string, string>;

  const sampleData: TreeNodeData[] = [
    {
      id: 'n1', text: 'Node 1', children: [
        { id: 'n1-1', text: 'Child 1' },
        { id: 'n1-2', text: 'Child 2' },
      ],
    },
    { id: 'n2', text: 'Node 2' },
    { id: 'n3', text: 'Node 3' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock localStorage
    mockStorage = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
        clear: () => { mockStorage = {}; },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  it('should save state to localStorage on selection change', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    tree.select_node('n2');

    const stored = JSON.parse(mockStorage['test-tree-state']);
    expect(stored.state.selected).toContain('n2');
  });

  it('should save opened state to localStorage', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    tree.open_node('n1');

    const stored = JSON.parse(mockStorage['test-tree-state']);
    expect(stored.state.opened).toContain('n1');
  });

  it('should restore state from localStorage on init', () => {
    // Pre-populate localStorage with saved state
    mockStorage['test-tree-state'] = JSON.stringify({
      state: { opened: ['n1'], selected: ['n2'] },
    });

    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    expect(tree.getNode('n1')!.state.opened).toBe(true);
    expect(tree.get_selected()).toContain('n2');
  });

  it('should clear state from localStorage', () => {
    mockStorage['test-tree-state'] = JSON.stringify({
      state: { opened: ['n1'], selected: ['n2'] },
    });

    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    // Access the state plugin to clear
    const statePlugin = (tree as any).plugins.find((p: any) => p.name === 'state');
    statePlugin.clear_state();

    expect(mockStorage['test-tree-state']).toBeUndefined();
  });

  it('should respect TTL and discard expired state', () => {
    // Saved 2 hours ago with 1 hour TTL
    mockStorage['test-tree-state'] = JSON.stringify({
      state: { opened: ['n1'], selected: ['n2'] },
      expires: Date.now() - 3600000, // expired 1 hour ago
    });

    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state', ttl: 3600000 },
    });

    // State should NOT be restored (expired)
    expect(tree.getNode('n1')!.state.opened).toBe(false);
    expect(tree.get_selected()).not.toContain('n2');
  });

  it('should apply filter function to saved state', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: {
        key: 'test-tree-state',
        filter: (state) => ({ ...state, selected: [] }), // Never persist selection
      },
    });

    tree.select_node('n2');

    const stored = JSON.parse(mockStorage['test-tree-state']);
    expect(stored.state.selected).toEqual([]);
  });

  it('should emit state_ready event after restoring', (done) => {
    mockStorage['test-tree-state'] = JSON.stringify({
      state: { opened: [], selected: [] },
    });

    container.addEventListener('state_ready.MDFolderTree', () => {
      done();
    });

    new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });
  });

  it('should use default key when none specified', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
    });

    tree.select_node('n1');
    expect(mockStorage['md-tree-state']).toBeDefined();
  });
});
