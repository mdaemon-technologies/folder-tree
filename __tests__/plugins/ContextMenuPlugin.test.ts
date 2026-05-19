import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('ContextMenuPlugin', () => {
  let container: HTMLElement;

  const sampleData: TreeNodeData[] = [
    { id: 'n1', text: 'Node 1', children: [{ id: 'n1-1', text: 'Child 1' }] },
    { id: 'n2', text: 'Node 2' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
    // Clean up any leaked context menus
    document.querySelectorAll('.md-tree-contextmenu').forEach((el) => el.remove());
  });

  it('should register without errors', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['contextmenu'],
    });

    expect(tree).toBeDefined();
  });

  it('should show context menu on right-click of a node', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['contextmenu'],
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    expect(anchor).not.toBeNull();

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 50,
    });
    anchor.dispatchEvent(event);

    const menu = document.querySelector('.md-tree-contextmenu');
    expect(menu).not.toBeNull();
  });

  it('should have default menu items (Create, Rename, Delete)', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['contextmenu'],
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const menu = document.querySelector('.md-tree-contextmenu');
    const items = menu?.querySelectorAll('li[role="menuitem"]');
    expect(items?.length).toBeGreaterThanOrEqual(3);

    const texts = Array.from(items!).map((li) => li.textContent);
    expect(texts).toContain('Create');
    expect(texts).toContain('Rename');
    expect(texts).toContain('Delete');
  });

  it('should support custom items via config', () => {
    new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['contextmenu'],
      contextmenu: {
        items: {
          custom: { label: 'Custom Action', action: jest.fn() },
        },
      },
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const menu = document.querySelector('.md-tree-contextmenu');
    const items = menu?.querySelectorAll('li[role="menuitem"]');
    const texts = Array.from(items!).map((li) => li.textContent);
    expect(texts).toContain('Custom Action');
  });

  it('should support items as a function', () => {
    const itemsFn = jest.fn().mockReturnValue({
      dynamic: { label: 'Dynamic Item', action: jest.fn() },
    });

    new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['contextmenu'],
      contextmenu: { items: itemsFn },
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(itemsFn).toHaveBeenCalled();
    const menu = document.querySelector('.md-tree-contextmenu');
    expect(menu?.textContent).toContain('Dynamic Item');
  });

  it('should dismiss on Escape key', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['contextmenu'],
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(document.querySelector('.md-tree-contextmenu')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.md-tree-contextmenu')).toBeNull();
  });

  it('should dismiss on click outside', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['contextmenu'],
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(document.querySelector('.md-tree-contextmenu')).not.toBeNull();

    // Click outside
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.md-tree-contextmenu')).toBeNull();
  });

  it('should select node on right-click by default', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['contextmenu'],
    });

    const anchor = container.querySelector('#n2 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(tree.get_selected()).toContain('n2');
  });

  it('should not select node when select_node is false', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['contextmenu'],
      contextmenu: { select_node: false },
    });

    const anchor = container.querySelector('#n2 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(tree.get_selected()).not.toContain('n2');
  });

  it('should emit show_contextmenu event', (done) => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['contextmenu'],
    });

    container.addEventListener('show_contextmenu.MDFolderTree', ((e: CustomEvent) => {
      expect(e.detail.node.id).toBe('n1');
      done();
    }) as EventListener);

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });

  it('should clean up menu on destroy', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['contextmenu'],
    });

    const anchor = container.querySelector('#n1 .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.md-tree-contextmenu')).not.toBeNull();

    tree.destroy();
    expect(document.querySelector('.md-tree-contextmenu')).toBeNull();
  });
});
