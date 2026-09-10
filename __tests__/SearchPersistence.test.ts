import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Search state lived only as DOM classes and inline styles, so any full
 * render — which clears `innerHTML` — erased it. Matching also walked the DOM,
 * missing nodes inside collapsed parents.
 */
describe('Search persistence', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    container.remove();
  });

  const data: TreeNodeData[] = [
    {
      id: 'folder',
      text: 'Folder',
      children: [
        { id: 'target', text: 'Needle' },
        { id: 'other', text: 'Haystack' },
      ],
    },
    { id: 'solo', text: 'Nothing here' },
  ];

  const build = (search = {}) =>
    new MDFolderTree(container, { core: { data }, plugins: ['search'], search });

  const highlighted = () =>
    Array.from(container.querySelectorAll('.md-tree-search'))
      .map((el) => el.closest('.md-tree-node')!.id);

  describe('matching', () => {
    it('should find nodes inside a collapsed parent', () => {
      const tree = build();

      expect(tree.is_closed('folder')).toBe(true);
      expect(tree.search('Needle')).toEqual(['target']);
    });

    it('should be case-insensitive by default', () => {
      const tree = build();

      expect(tree.search('needle')).toEqual(['target']);
    });

    it('should respect case_sensitive', () => {
      const tree = build({ case_sensitive: true });

      expect(tree.search('needle')).toEqual([]);
      expect(tree.search('Needle')).toEqual(['target']);
    });
  });

  describe('highlighting survives rendering', () => {
    it('should mark matches in the DOM', () => {
      const tree = build();

      tree.search('Needle');

      expect(highlighted()).toEqual(['target']);
    });

    it('should keep highlighting after a redraw', () => {
      const tree = build();
      tree.search('Needle');

      tree.redraw();

      expect(highlighted()).toEqual(['target']);
    });

    it('should keep highlighting after an unrelated structural change', () => {
      const tree = build();
      tree.search('Needle');

      tree.createNode('#', { id: 'fresh', text: 'Fresh' });

      expect(highlighted()).toEqual(['target']);
    });

    it('should drop highlighting on clear_search', () => {
      const tree = build();
      tree.search('Needle');

      tree.clear_search();

      expect(highlighted()).toEqual([]);
    });
  });

  describe('show_only_matches', () => {
    it('should hide non-matching branches', () => {
      const tree = build({ show_only_matches: true });

      tree.search('Needle');

      expect(tree.is_hidden('solo')).toBe(true);
      expect(tree.is_hidden('other')).toBe(true);
      expect(tree.is_hidden('target')).toBe(false);
    });

    it('should keep ancestors of a match visible and open', () => {
      const tree = build({ show_only_matches: true });

      tree.search('Needle');

      expect(tree.is_hidden('folder')).toBe(false);
      expect(tree.is_open('folder')).toBe(true);
    });

    it('should survive a redraw', () => {
      const tree = build({ show_only_matches: true });
      tree.search('Needle');

      tree.redraw();

      expect(container.querySelector('#solo')!.classList.contains('md-tree-hidden')).toBe(true);
      expect(container.querySelector('#target')!.classList.contains('md-tree-hidden')).toBe(false);
    });

    it('should restore visibility on clear_search', () => {
      const tree = build({ show_only_matches: true });
      tree.search('Needle');

      tree.clear_search();

      expect(tree.is_hidden('solo')).toBe(false);
      expect(tree.is_hidden('other')).toBe(false);
    });

    it('should close nodes it opened when close_opened_onclear is set', () => {
      const tree = build({ show_only_matches: true, close_opened_onclear: true });
      tree.search('Needle');
      expect(tree.is_open('folder')).toBe(true);

      tree.clear_search();

      expect(tree.is_open('folder')).toBe(false);
    });
  });
});
