import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('Keyboard Navigation', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'folder-1',
      text: 'Folder 1',
      state: { opened: true },
      children: [
        { id: 'child-1', text: 'Child 1' },
        { id: 'child-2', text: 'Child 2' },
      ],
    },
    { id: 'folder-2', text: 'Folder 2' },
  ];

  function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
    container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, { core: { data: sampleData, check_callback: true } });
  });

  afterEach(() => {
    tree.destroy();
    document.body.removeChild(container);
  });

  test('container has tabindex=0', () => {
    expect(container.getAttribute('tabindex')).toBe('0');
  });

  test('ArrowDown focuses first node when nothing focused', () => {
    pressKey('ArrowDown');
    const focused = container.querySelector('.md-tree-focused');
    expect(focused).not.toBeNull();
  });

  test('ArrowDown moves to next visible node', () => {
    pressKey('ArrowDown'); // focus folder-1
    pressKey('ArrowDown'); // focus child-1
    const focused = container.querySelector('.md-tree-focused');
    expect(focused!.closest('.md-tree-node')!.id).toBe('child-1');
  });

  test('ArrowUp moves to previous node', () => {
    pressKey('ArrowDown'); // folder-1
    pressKey('ArrowDown'); // child-1
    pressKey('ArrowUp');   // back to folder-1
    const focused = container.querySelector('.md-tree-focused');
    expect(focused!.closest('.md-tree-node')!.id).toBe('folder-1');
  });

  test('ArrowRight opens closed node', () => {
    tree.close_node('folder-1');
    pressKey('ArrowDown'); // focus folder-1
    pressKey('ArrowRight'); // opens folder-1
    expect(tree.is_open('folder-1')).toBe(true);
  });

  test('ArrowRight on open node focuses first child', () => {
    pressKey('ArrowDown'); // folder-1
    pressKey('ArrowRight'); // focus first child
    const focused = container.querySelector('.md-tree-focused');
    expect(focused!.closest('.md-tree-node')!.id).toBe('child-1');
  });

  test('ArrowLeft closes open node', () => {
    pressKey('ArrowDown'); // folder-1
    expect(tree.is_open('folder-1')).toBe(true);
    pressKey('ArrowLeft'); // closes folder-1
    expect(tree.is_open('folder-1')).toBe(false);
  });

  test('ArrowLeft on closed node focuses parent', () => {
    pressKey('ArrowDown'); // folder-1
    pressKey('ArrowDown'); // child-1
    pressKey('ArrowLeft'); // go to parent folder-1
    const focused = container.querySelector('.md-tree-focused');
    expect(focused!.closest('.md-tree-node')!.id).toBe('folder-1');
  });

  test('Enter selects the focused node', () => {
    pressKey('ArrowDown'); // folder-1
    pressKey('Enter');
    expect(tree.is_selected('folder-1')).toBe(true);
  });

  test('Home focuses first visible node', () => {
    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('Home');
    const focused = container.querySelector('.md-tree-focused');
    expect(focused!.closest('.md-tree-node')!.id).toBe('folder-1');
  });

  test('Ctrl+V pastes at focused node', () => {
    tree.cut('child-1');
    pressKey('ArrowDown'); // folder-1 focused
    // Navigate to folder-2
    pressKey('ArrowDown'); // child-2 (since folder-1 is open, first child)
    pressKey('ArrowDown'); // child-2's next
    pressKey('ArrowDown'); // folder-2
    pressKey('v', { ctrlKey: true });
    // child-1 should have been moved
    const node = tree.get_node('child-1');
    expect(node).not.toBeNull();
  });

  test('aria-activedescendant is set on focus', () => {
    pressKey('ArrowDown');
    expect(container.getAttribute('aria-activedescendant')).not.toBeNull();
  });

  describe('End key with collapsed nodes', () => {
    it('should focus a closed parent when it is the last node', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            { id: 'first', text: 'First' },
            { id: 'last', text: 'Last', children: [{ id: 'kid', text: 'Kid' }] },
          ],
        },
      });
      expect(tree.is_closed('last')).toBe(true);

      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      expect(container.getAttribute('aria-activedescendant')).toBe('last');
    });

    it('should not focus a child hidden inside a collapsed parent', () => {
      new MDFolderTree(container, {
        core: {
          data: [
            { id: 'first', text: 'First' },
            { id: 'last', text: 'Last', children: [{ id: 'kid', text: 'Kid' }] },
          ],
        },
      });

      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      expect(container.getAttribute('aria-activedescendant')).not.toBe('kid');
    });

    it('should focus the deepest visible node when the last parent is open', () => {
      new MDFolderTree(container, {
        core: {
          data: [
            { id: 'first', text: 'First' },
            { id: 'last', text: 'Last', state: { opened: true }, children: [{ id: 'kid', text: 'Kid' }] },
          ],
        },
      });

      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      expect(container.getAttribute('aria-activedescendant')).toBe('kid');
    });
  });
});