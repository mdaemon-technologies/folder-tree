import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Core Utility Methods', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'root-1',
      text: 'Root One',
      type: 'folder',
      state: { opened: true },
      children: [
        {
          id: 'child-1',
          text: 'Child A',
          type: 'file',
          children: [
            { id: 'grandchild-1', text: 'Grandchild X', type: 'file' },
          ],
        },
        { id: 'child-2', text: 'Child B', type: 'file', state: { disabled: true } },
      ],
    },
    {
      id: 'root-2',
      text: 'Root Two',
      type: 'folder',
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
    });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  // get_parent
  test('get_parent returns parent ID', () => {
    expect(tree.get_parent('child-1')).toBe('root-1');
    expect(tree.get_parent('root-1')).toBe('#');
  });

  test('get_parent returns null for unknown node', () => {
    expect(tree.get_parent('nonexistent')).toBeNull();
  });

  // get_path
  test('get_path returns text path with default separator', () => {
    expect(tree.get_path('grandchild-1')).toBe('Root One/Child A/Grandchild X');
  });

  test('get_path returns ID path when ids=true', () => {
    expect(tree.get_path('grandchild-1', '/', true)).toBe('root-1/child-1/grandchild-1');
  });

  test('get_path returns array when glue=false', () => {
    expect(tree.get_path('grandchild-1', false)).toEqual(['Root One', 'Child A', 'Grandchild X']);
  });

  test('get_path returns false for unknown node', () => {
    expect(tree.get_path('nonexistent')).toBe(false);
  });

  // get_text / set_text
  test('get_text returns node text', () => {
    expect(tree.get_text('root-1')).toBe('Root One');
  });

  test('get_text returns false for unknown node', () => {
    expect(tree.get_text('nonexistent')).toBe(false);
  });

  test('set_text changes node text and emits event', () => {
    const handler = jest.fn();
    container.addEventListener('set_text.MDFolderTree', handler);
    expect(tree.set_text('root-1', 'New Name')).toBe(true);
    expect(tree.get_text('root-1')).toBe('New Name');
    expect(handler).toHaveBeenCalled();
  });

  // is_selected
  test('is_selected returns false by default', () => {
    expect(tree.is_selected('root-1')).toBe(false);
  });

  test('is_selected returns true after selection', () => {
    tree.select_node('root-1');
    expect(tree.is_selected('root-1')).toBe(true);
  });

  // is_parent / is_leaf
  test('is_parent returns true for nodes with children', () => {
    expect(tree.is_parent('root-1')).toBe(true);
  });

  test('is_parent returns false for leaf nodes', () => {
    expect(tree.is_parent('root-2')).toBe(false);
  });

  test('is_leaf returns true for leaf nodes', () => {
    expect(tree.is_leaf('child-2')).toBe(true);
  });

  test('is_leaf returns false for parent nodes', () => {
    expect(tree.is_leaf('root-1')).toBe(false);
  });

  // is_open / is_closed
  test('is_open returns true for opened nodes', () => {
    expect(tree.is_open('root-1')).toBe(true);
  });

  test('is_open returns false for closed nodes', () => {
    expect(tree.is_open('child-1')).toBe(false);
  });

  test('is_closed returns true for closed parent nodes', () => {
    expect(tree.is_closed('child-1')).toBe(true);
  });

  test('is_closed returns false for leaf nodes', () => {
    expect(tree.is_closed('child-2')).toBe(false);
  });

  // is_disabled / is_loaded
  test('is_disabled returns true for disabled nodes', () => {
    expect(tree.is_disabled('child-2')).toBe(true);
  });

  test('is_loaded returns true for static data nodes', () => {
    expect(tree.is_loaded('root-1')).toBe(true);
  });

  // toggle_node
  test('toggle_node opens a closed node', () => {
    tree.close_node('root-1');
    expect(tree.is_open('root-1')).toBe(false);
    tree.toggle_node('root-1');
    expect(tree.is_open('root-1')).toBe(true);
  });

  test('toggle_node closes an open node', () => {
    expect(tree.is_open('root-1')).toBe(true);
    tree.toggle_node('root-1');
    expect(tree.is_open('root-1')).toBe(false);
  });

  // get_next_dom / get_prev_dom
  test('get_next_dom returns next visible node', () => {
    const next = tree.get_next_dom('root-1');
    expect(next).not.toBeNull();
    expect(next!.id).toBe('child-1');
  });

  test('get_prev_dom returns previous visible node', () => {
    const prev = tree.get_prev_dom('child-1');
    expect(prev).not.toBeNull();
    expect(prev!.id).toBe('root-1');
  });

  // get_top_selected / get_bottom_selected
  test('get_top_selected returns only top-level selected ancestors', () => {
    tree.select_node('root-1', true);
    tree.select_node('child-1', true);
    const top = tree.get_top_selected();
    expect(top).toContain('root-1');
    expect(top).not.toContain('child-1');
  });

  test('get_bottom_selected returns only leaf-level selected', () => {
    tree.select_node('root-1', true);
    tree.select_node('child-1', true);
    const bottom = tree.get_bottom_selected();
    expect(bottom).toContain('child-1');
    expect(bottom).not.toContain('root-1');
  });

  // set_id
  test('set_id changes a node ID', () => {
    expect(tree.set_id('root-2', 'renamed-root')).toBe(true);
    expect(tree.get_node('root-2')).toBeNull();
    expect(tree.get_node('renamed-root')).not.toBeNull();
    expect(tree.get_text('renamed-root')).toBe('Root Two');
  });

  test('set_id returns false for duplicate IDs', () => {
    expect(tree.set_id('root-1', 'root-2')).toBe(false);
  });

  // get_json
  test('get_json serializes tree to JSON array', () => {
    const json = tree.get_json() as TreeNodeData[];
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(2);
    expect(json[0].id).toBe('root-1');
    expect(json[0].children).toBeDefined();
  });

  test('get_json serializes single node', () => {
    const json = tree.get_json('child-2') as TreeNodeData;
    expect(json.id).toBe('child-2');
    expect(json.text).toBe('Child B');
  });

  test('get_json with no_state omits state', () => {
    const json = tree.get_json('root-1', { no_state: true }) as TreeNodeData;
    expect(json.state).toBeUndefined();
  });

  test('get_json flat mode returns all nodes flat', () => {
    const flat = tree.get_json(undefined, { flat: true }) as TreeNodeData[];
    // root-1, child-1, grandchild-1, child-2, root-2 = 5
    expect(flat.length).toBe(5);
  });
});
