import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';
import { delay } from './helpers/async';

describe('Lazy loading regression tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const inst = MDFolderTree.getInstance(container);
    if (inst) inst.destroy();
    document.body.removeChild(container);
  });

  describe('nodes with children:true render as expandable', () => {
    test('top-level node with children:true renders as closed (not leaf)', async () => {
      new MDFolderTree(container, {
        core: {
          data: (node: any, cb: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              cb([{ id: 'folder', text: 'Folder', children: true as unknown as TreeNodeData[] }]);
            } else {
              cb([]);
            }
          },
        },
      });

      await delay(50);
      const el = container.querySelector('#folder');
      expect(el).not.toBeNull();
      expect(el!.classList.contains('md-tree-closed')).toBe(true);
      expect(el!.classList.contains('md-tree-leaf')).toBe(false);
    });

    test('nested node with children:true renders as closed (not leaf)', async () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: any, cb: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              cb([{
                id: 'parent',
                text: 'Parent',
                children: [
                  { id: 'child', text: 'Child', children: true as unknown as TreeNodeData[] },
                ],
              }]);
            } else {
              cb([]);
            }
          },
        },
      });

      await delay(50);
      const parent = tree.get_node('parent');
      expect(parent).not.toBe(false);
      // Open parent to see child rendered
      tree.open_node('parent');

      await delay(50);
      const childEl = container.querySelector('#child');
      expect(childEl).not.toBeNull();
      expect(childEl!.classList.contains('md-tree-closed')).toBe(true);
      expect(childEl!.classList.contains('md-tree-leaf')).toBe(false);
    });
  });

  describe('open_node triggers lazy loading at any depth', () => {
    test('open_node on unloaded top-level node loads children', async () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: any, cb: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              cb([{ id: 'root', text: 'Root', children: true as unknown as TreeNodeData[] }]);
            } else if (node.id === 'root') {
              cb([
                { id: 'c1', text: 'Child 1' },
                { id: 'c2', text: 'Child 2' },
              ]);
            } else {
              cb([]);
            }
          },
        },
      });

      await delay(50);
      tree.open_node('root');

      await delay(50);
      expect(tree.get_node('c1')).not.toBe(false);
      expect(tree.get_node('c2')).not.toBe(false);
      const rootNode = tree.getNode('root');
      expect(rootNode!.state.opened).toBe(true);
      expect(rootNode!.state.loaded).toBe(true);
    });

    test('open_node on unloaded second-level node loads its children', async () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: any, cb: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              cb([{
                id: 'root',
                text: 'Root',
                children: [
                  { id: 'mid', text: 'Middle', children: true as unknown as TreeNodeData[] },
                ],
              }]);
            } else if (node.id === 'mid') {
              cb([
                { id: 'deep1', text: 'Deep 1' },
                { id: 'deep2', text: 'Deep 2' },
              ]);
            } else {
              cb([]);
            }
          },
        },
      });

      await delay(50);
      // Open root first (already loaded)
      tree.open_node('root');

      await delay(50);
      // Now open mid (needs lazy load)
      tree.open_node('mid');

      await delay(50);
      expect(tree.get_node('deep1')).not.toBe(false);
      expect(tree.get_node('deep2')).not.toBe(false);
      const midNode = tree.getNode('mid');
      expect(midNode!.state.opened).toBe(true);
      expect(midNode!.state.loaded).toBe(true);
    });

    test('open_node on unloaded third-level node loads its children', async () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: any, cb: (d: TreeNodeData[]) => void) => {
            if (node.id === '#') {
              cb([{ id: 'l1', text: 'Level 1', children: true as unknown as TreeNodeData[] }]);
            } else if (node.id === 'l1') {
              cb([{ id: 'l2', text: 'Level 2', children: true as unknown as TreeNodeData[] }]);
            } else if (node.id === 'l2') {
              cb([{ id: 'l3', text: 'Level 3', children: true as unknown as TreeNodeData[] }]);
            } else if (node.id === 'l3') {
              cb([{ id: 'leaf', text: 'Leaf Node' }]);
            } else {
              cb([]);
            }
          },
        },
      });

      await delay(50);
      tree.open_node('l1');
      await delay(50);
      tree.open_node('l2');
      await delay(50);
      tree.open_node('l3');
      await delay(50);
      expect(tree.get_node('leaf')).not.toBe(false);
      const l3 = tree.getNode('l3');
      expect(l3!.state.opened).toBe(true);
      expect(l3!.state.loaded).toBe(true);
    });

    test('open_node on already-loaded node does not re-fetch', async () => {
      let callCount = 0;

      const tree = new MDFolderTree(container, {
        core: {
          data: (node: any, cb: (d: TreeNodeData[]) => void) => {
            callCount++;
            if (node.id === '#') {
              cb([{ id: 'root', text: 'Root', children: true as unknown as TreeNodeData[] }]);
            } else if (node.id === 'root') {
              cb([{ id: 'child', text: 'Child' }]);
            } else {
              cb([]);
            }
          },
        },
      });

      await delay(50);
      const initialCalls = callCount;
      tree.open_node('root');

      await delay(50);
      const afterFirstOpen = callCount;
      expect(afterFirstOpen).toBe(initialCalls + 1);

      // Close and re-open — should not fetch again
      tree.close_node('root');
      tree.open_node('root');

      await delay(50);
      expect(callCount).toBe(afterFirstOpen);
    });
  });

  describe('select_node and check_node tie_selection', () => {
    test('select_node sets checked state when checkbox plugin active', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'n1', text: 'Node 1' }] },
        plugins: ['checkbox'],
      });

      tree.select_node('n1');
      const node = tree.getNode('n1');
      expect(node!.state.selected).toBe(true);
      expect(node!.state.checked).toBe(true);
    });

    test('deselect_node clears checked state when checkbox plugin active', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'n1', text: 'Node 1' }] },
        plugins: ['checkbox'],
      });

      tree.select_node('n1');
      tree.deselect_node('n1');
      const node = tree.getNode('n1');
      expect(node!.state.selected).toBe(false);
      expect(node!.state.checked).toBe(false);
    });

    test('select_node does not set checked when tie_selection is false', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'n1', text: 'Node 1' }] },
        plugins: ['checkbox'],
        checkbox: { tie_selection: false },
      });

      tree.select_node('n1');
      const node = tree.getNode('n1');
      expect(node!.state.selected).toBe(true);
      expect(node!.state.checked).toBe(false);
    });

    test('check_node also selects the node', () => {
      const tree = new MDFolderTree(container, {
        core: { data: [{ id: 'n1', text: 'Node 1' }] },
        plugins: ['checkbox'],
      });

      tree.check_node('n1');
      const node = tree.getNode('n1');
      expect(node!.state.checked).toBe(true);
      expect(node!.state.selected).toBe(true);
      expect(tree.get_selected()).toContain('n1');
    });

    test('single-select mode clears checked on previously selected node', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: [
            { id: 'n1', text: 'Node 1' },
            { id: 'n2', text: 'Node 2' },
          ],
          multiple: false,
        },
        plugins: ['checkbox'],
      });

      // Single-select is enforced on activation, as in jstree; programmatic
      // select_node applies no policy and would keep both nodes selected.
      const click = (id: string, init: MouseEventInit = {}) =>
        (container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement)
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));

      click('n1');
      expect(tree.getNode('n1')!.state.checked).toBe(true);

      click('n2');
      expect(tree.getNode('n1')!.state.checked).toBe(false);
      expect(tree.getNode('n2')!.state.checked).toBe(true);
    });
  });
});
