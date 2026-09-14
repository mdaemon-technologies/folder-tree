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

    // Saving is debounced by 100ms, as in jstree.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

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
    jest.useRealTimers();
  });

  it('should save state to localStorage on selection change', async () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    await Promise.resolve(); // saving starts after ready, as in jstree

    tree.select_node('n2');
    jest.advanceTimersByTime(100);

    const stored = JSON.parse(mockStorage['test-tree-state']);
    expect(stored.state.core.selected).toContain('n2');
  });

  it('should save opened state to localStorage', async () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    await Promise.resolve(); // saving starts after ready, as in jstree

    tree.open_node('n1');
    jest.advanceTimersByTime(100);

    const stored = JSON.parse(mockStorage['test-tree-state']);
    expect(stored.state.core.open).toContain('n1');
  });

  it('should restore state from localStorage on init', async () => {
    // Pre-populate localStorage with saved state
    mockStorage['test-tree-state'] = JSON.stringify({
      state: { opened: ['n1'], selected: ['n2'] },
    });

    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: { key: 'test-tree-state' },
    });

    // Restore is driven by `ready`, which is deferred a microtask so that
    // consumers can subscribe to it after construction.
    await Promise.resolve();

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

  it('should apply the filter function to the state it restores', async () => {
    mockStorage['test-tree-state'] = JSON.stringify({
      state: { core: { open: ['n1'], selected: ['n2'] } },
      ttl: false,
      sec: Date.now(),
    });
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
      state: {
        key: 'test-tree-state',
        filter: (state) => ({ ...state, core: { ...state.core, selected: [] } }), // Never restore selection
      },
    });

    await Promise.resolve();

    expect(tree.is_open('n1')).toBe(true);
    expect(tree.get_selected()).toEqual([]);
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

  it("should use jstree's default key when none is specified", async () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['state'],
    });

    await Promise.resolve(); // saving starts after ready, as in jstree

    tree.select_node('n1');
    jest.advanceTimersByTime(100);
    expect(mockStorage['jstree']).toBeDefined();
  });

  describe('corrupt storage', () => {
    const readErrors = (): string[] => {
      const seen: string[] = [];
      const onError = (e: ErrorEvent) => { seen.push(e.message); e.preventDefault(); };
      window.addEventListener('error', onError);
      new MDFolderTree(container, {
        core: { data: sampleData },
        plugins: ['state'],
        state: { key: 'corrupt-key' },
      });
      window.removeEventListener('error', onError);
      return seen;
    };

    it('should tolerate a stored null payload', () => {
      localStorage.setItem('corrupt-key', 'null');

      expect(readErrors()).toEqual([]);
    });

    it('should tolerate a stored payload with no state object', () => {
      localStorage.setItem('corrupt-key', '{"expires":123}');

      expect(readErrors()).toEqual([]);
    });

    it('should tolerate a stored payload with a non-array opened list', () => {
      localStorage.setItem('corrupt-key', '{"state":{"opened":"nope","selected":null}}');

      expect(readErrors()).toEqual([]);
    });
  });
});