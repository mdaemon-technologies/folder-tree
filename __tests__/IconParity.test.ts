import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Icon parity with jstree 3.3.16.
 *
 * A node's `icon` is `true` (the theme icon) unless set: `false` hides it, and
 * a string is a CSS class list — or, if it contains '/' or '.', an image URL.
 * `hide_icon` / `show_icon` change `node.icon` itself, and the types plugin
 * writes a type's icon into `node.icon` on jstree's `model` event, so
 * `get_icon` reports it.
 */
describe('Icon parity', () => {
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

  const build = (data: TreeNodeData[], rest: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, check_callback: true }, ...rest });

  const iconEl = (id: string) =>
    container.querySelector(`#${id} > .md-tree-anchor > .md-tree-themeicon`) as HTMLElement;

  describe('default icon', () => {
    it('should default a node without an icon to true', () => {
      const tree = build([{ id: 'plain', text: 'Plain' }]);

      expect(tree.get_icon('plain')).toBe(true);
    });

    it('should render the default icon visibly', () => {
      build([{ id: 'plain', text: 'Plain' }]);

      expect(iconEl('plain').classList.contains('md-tree-themeicon-hidden')).toBe(false);
      expect(iconEl('plain').classList.contains('md-tree-themeicon-custom')).toBe(false);
    });

    it('should treat an empty or null icon as the default', () => {
      const tree = build([
        { id: 'empty', text: 'Empty', icon: '' },
        { id: 'nil', text: 'Nil', icon: null } as unknown as TreeNodeData,
      ]);

      expect(tree.get_icon('empty')).toBe(true);
      expect(tree.get_icon('nil')).toBe(true);
    });

    it('should hide the icon of a node whose icon is false', () => {
      build([{ id: 'bare', text: 'Bare', icon: false }]);

      expect(iconEl('bare').classList.contains('md-tree-themeicon-hidden')).toBe(true);
    });
  });

  describe('custom icons', () => {
    it('should render a multi-class icon such as Font Awesome', () => {
      expect(() => build([{ id: 'fa', text: 'FA', icon: 'fa fa-folder' }])).not.toThrow();

      const el = iconEl('fa');
      expect(el.classList.contains('fa')).toBe(true);
      expect(el.classList.contains('fa-folder')).toBe(true);
      expect(el.classList.contains('md-tree-themeicon-custom')).toBe(true);
    });

    it('should render an icon containing a slash or dot as an image', () => {
      build([{ id: 'img', text: 'Img', icon: 'img/folder.png' }]);

      const el = iconEl('img');
      expect(el.style.backgroundImage).toContain('img/folder.png');
      expect(el.classList.contains('md-tree-themeicon-custom')).toBe(true);
      expect(el.classList.contains('img/folder.png')).toBe(false);
    });
  });

  describe('set_icon', () => {
    it('should restore the default icon for true, null or an empty string', () => {
      const tree = build([{ id: 'a', text: 'A', icon: 'custom' }]);

      for (const reset of [true, null, '']) {
        tree.set_icon('a', 'custom');
        tree.set_icon('a', reset as never);
        expect(tree.get_icon('a')).toBe(true);
      }
      expect(iconEl('a').classList.contains('md-tree-themeicon-custom')).toBe(false);
    });

    it('should hide the icon for false', () => {
      const tree = build([{ id: 'a', text: 'A' }]);

      tree.set_icon('a', false);

      expect(tree.get_icon('a')).toBe(false);
      expect(iconEl('a').classList.contains('md-tree-themeicon-hidden')).toBe(true);
    });
  });

  describe('hide_icon / show_icon', () => {
    it('should set the icon to false and hide it', () => {
      const tree = build([{ id: 'a', text: 'A', icon: 'mine' }]);

      expect(tree.hide_icon('a')).toBe(true);

      expect(tree.get_icon('a')).toBe(false);
      expect(iconEl('a').classList.contains('md-tree-themeicon-hidden')).toBe(true);
    });

    it('should keep the icon hidden across a redraw', () => {
      const tree = build([{ id: 'a', text: 'A', icon: 'mine' }]);
      tree.hide_icon('a');

      tree.redraw();

      expect(iconEl('a').classList.contains('md-tree-themeicon-hidden')).toBe(true);
    });

    it('should restore the previous custom icon on show_icon', () => {
      const tree = build([{ id: 'a', text: 'A', icon: 'mine' }]);
      tree.hide_icon('a');

      expect(tree.show_icon('a')).toBe(true);

      expect(tree.get_icon('a')).toBe('mine');
      expect(iconEl('a').classList.contains('mine')).toBe(true);
    });

    it('should fall back to the default icon on show_icon when there was none', () => {
      const tree = build([{ id: 'a', text: 'A' }]);
      tree.hide_icon('a');

      tree.show_icon('a');

      expect(tree.get_icon('a')).toBe(true);
    });

    it('should show the default icon when a redraw has dropped the hidden icon, as jstree does', () => {
      const tree = build([{ id: 'a', text: 'A', icon: 'mine' }]);
      tree.hide_icon('a');
      tree.redraw();

      tree.show_icon('a');

      expect(tree.get_icon('a')).toBe(true);
    });

    it('should record a custom icon on the rendered element, as jstree does', () => {
      build([{ id: 'a', text: 'A', icon: 'mine' }]);

      expect(iconEl('a').getAttribute('rel')).toBe('mine');
    });

    it('should accept arrays', () => {
      const tree = build([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);

      tree.hide_icon(['a', 'b']);

      expect([tree.get_icon('a'), tree.get_icon('b')]).toEqual([false, false]);
    });
  });

  describe('types plugin', () => {
    const types = {
      default: { icon: 'def-icon' },
      folder: { icon: 'folder-icon' },
      bare: { icon: false },
    };

    it('should write the type icon into node.icon, so get_icon reports it', () => {
      const tree = build([{ id: 'f', text: 'F', type: 'folder' }], { types });

      expect(tree.get_icon('f')).toBe('folder-icon');
    });

    it('should keep an explicit node icon over the type icon', () => {
      const tree = build([{ id: 'f', text: 'F', type: 'folder', icon: 'mine' }], { types });

      expect(tree.get_icon('f')).toBe('mine');
    });

    it('should resolve an unconfigured type to default, as jstree does', () => {
      const tree = build([{ id: 'u', text: 'U', type: 'unknown' }], { types });

      expect(tree.get_type('u')).toBe('default');
      expect(tree.get_icon('u')).toBe('def-icon');
    });

    it('should apply the type icon to a created node', () => {
      const tree = build([{ id: 'a', text: 'A' }], { types });

      tree.create_node('#', { id: 'n', text: 'N', type: 'folder' });

      expect(tree.get_icon('n')).toBe('folder-icon');
    });

    it('should hide icons for a type whose icon is false', () => {
      build([{ id: 'x', text: 'X', type: 'bare' }], { types });

      expect(iconEl('x').classList.contains('md-tree-themeicon-hidden')).toBe(true);
    });
  });

  describe('model event', () => {
    it('should report created nodes and their parent', () => {
      const tree = build([{ id: 'a', text: 'A' }]);
      let detail: { nodes: string[]; parent: string } | null = null;
      tree.on('model.MDFolderTree', (e) => {
        detail = e.detail as { nodes: string[]; parent: string };
      });

      tree.create_node('a', { id: 'n', text: 'N' });

      expect(detail).toEqual({ nodes: ['n'], parent: 'a' });
    });

    it('should report lazily loaded nodes and their parent', () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (n, callback) => {
            if (n.id === '#') {
              callback([{ id: 'lazy', text: 'Lazy', children: true } as TreeNodeData]);
              return;
            }
            callback([{ id: 'kid', text: 'Kid' }]);
          },
        },
      });
      let detail: { nodes: string[]; parent: string } | null = null;
      tree.on('model.MDFolderTree', (e) => {
        detail = e.detail as { nodes: string[]; parent: string };
      });

      tree.load_node('lazy');

      expect(detail).toEqual({ nodes: ['kid'], parent: 'lazy' });
    });
  });
});
