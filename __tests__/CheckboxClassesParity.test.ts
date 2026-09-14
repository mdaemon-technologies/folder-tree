import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Checkbox plugin container state, as jstree 3.3.16 keeps it: `visible` is
 * applied while loading through show_checkboxes / hide_checkboxes, which
 * toggle a class on the container — so a redraw cannot bring hidden
 * checkboxes back — and the container is marked at init for
 * `tie_selection` and for `keep_selected_style: false`.
 */
describe('checkbox container classes', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const data: TreeNodeData[] = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  const build = (checkbox: Record<string, unknown> = {}, nodes: TreeNodeData[] = data) =>
    new MDFolderTree(container, { core: { data: nodes }, plugins: ['checkbox'], checkbox });
  const hidden = () => container.classList.contains('md-tree-no-checkboxes');

  describe('visible', () => {
    it('should show checkboxes by default', () => {
      build();

      expect(hidden()).toBe(false);
    });

    it('should hide checkboxes when false, across a redraw', () => {
      const tree = build({ visible: false });

      expect(hidden()).toBe(true);
      tree.redraw();
      expect(hidden()).toBe(true);
    });

    it('should keep checkboxes hidden by hide_checkboxes across a redraw', () => {
      const tree = build();

      tree.hide_checkboxes();
      tree.redraw();

      expect(hidden()).toBe(true);
      const box = container.querySelector('#a .md-tree-checkbox') as HTMLElement;
      expect(box.style.display).toBe('');
    });

    it('should show them again with show_checkboxes', () => {
      const tree = build({ visible: false });

      tree.show_checkboxes();

      expect(hidden()).toBe(false);
    });
  });

  describe('init classes', () => {
    it('should mark the container when checking is tied to selection', () => {
      build();

      expect(container.classList.contains('md-tree-checkbox-selection')).toBe(true);
    });

    it('should not mark it when checking is independent', () => {
      build({ tie_selection: false });

      expect(container.classList.contains('md-tree-checkbox-selection')).toBe(false);
    });

    it('should mark keep_selected_style: false at init, even before any node renders', () => {
      build({ keep_selected_style: false }, []);

      expect(container.classList.contains('md-tree-checkbox-no-clicked')).toBe(true);
    });
  });
});
