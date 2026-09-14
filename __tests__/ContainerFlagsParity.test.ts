import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Container flags and the drag helper, as jstree 3.3.16 sets them: the
 * container takes `jstree-rtl` when its computed direction is right-to-left
 * and `aria-multiselectable` when `core.multiple`, and the drag helper takes
 * the theme's responsive class under `core.themes.responsive`.
 */
describe('container flags parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    document.getElementById('vakata-dnd')?.remove();
    document.getElementById('md-tree-marker')?.remove();
  });

  const data = (): TreeNodeData[] => [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ];

  describe('direction', () => {
    it('should mark a right-to-left tree', () => {
      container.style.direction = 'rtl';

      new MDFolderTree(container, { core: { data: data() } });

      expect(container.classList.contains('md-tree-rtl')).toBe(true);
    });

    it('should leave a left-to-right tree unmarked', () => {
      new MDFolderTree(container, { core: { data: data() } });

      expect(container.classList.contains('md-tree-rtl')).toBe(false);
    });
  });

  describe('aria-multiselectable', () => {
    it('should declare it while core.multiple is on', () => {
      new MDFolderTree(container, { core: { data: data() } });

      expect(container.getAttribute('aria-multiselectable')).toBe('true');
    });

    it('should leave it off for a single-select tree', () => {
      new MDFolderTree(container, { core: { data: data(), multiple: false } });

      expect(container.getAttribute('aria-multiselectable')).toBeNull();
    });
  });

  describe('the drag helper', () => {
    const drag = () => {
      const anchor = container.querySelector('#a > .md-tree-anchor') as HTMLElement;
      anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 40 }));
      return document.getElementById('md-tree-dnd') as HTMLElement;
    };

    it('should carry the responsive class with themes.responsive', () => {
      new MDFolderTree(container, {
        core: { data: data(), themes: { responsive: true } },
        plugins: ['dnd'],
      });

      expect(drag().classList.contains('md-tree-dnd-responsive')).toBe(true);
    });

    it('should not carry it otherwise', () => {
      new MDFolderTree(container, { core: { data: data() }, plugins: ['dnd'] });

      expect(drag().classList.contains('md-tree-dnd-responsive')).toBe(false);
    });
  });
});
