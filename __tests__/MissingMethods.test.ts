import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * jstree 3.3.16 public methods this library lacked: hover_node, dehover_node,
 * get_container_ul, get_string, get_type, set_type, get_theme_variant and
 * redraw_node.
 */
describe('Missing jstree methods', () => {
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
    { id: 'a', text: 'A', type: 'folder' },
    { id: 'b', text: 'B', type: 'file' },
  ];

  const types = {
    folder: { icon: 'folder-icon', max_children: 2 },
    file: { icon: 'file-icon' },
  };

  const build = (core: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) =>
    new MDFolderTree(container, { core: { data, ...core }, ...rest });

  const anchor = (id: string) => container.querySelector(`#${id} > .md-tree-anchor`) as HTMLElement;
  const record = (tree: MDFolderTree, names: string[]) => {
    const log: string[] = [];
    for (const name of names) {
      tree.on(`${name}.MDFolderTree`, (e) => {
        log.push(`${name}:${(e.detail as { node: { id: string } }).node.id}`);
      });
    }
    return log;
  };

  describe('hover_node / dehover_node', () => {
    it('should mark the anchor hovered and emit hover_node', () => {
      const tree = build();
      const log = record(tree, ['hover_node']);

      tree.hover_node('a');

      expect(anchor('a').classList.contains('md-tree-hovered')).toBe(true);
      expect(log).toEqual(['hover_node:a']);
    });

    it('should dehover the previously hovered node first', () => {
      const tree = build();
      tree.hover_node('a');
      const log = record(tree, ['hover_node', 'dehover_node']);

      tree.hover_node('b');

      expect(anchor('a').classList.contains('md-tree-hovered')).toBe(false);
      expect(log).toEqual(['dehover_node:a', 'hover_node:b']);
    });

    it('should do nothing when the node is already hovered', () => {
      const tree = build();
      tree.hover_node('a');
      const log = record(tree, ['hover_node', 'dehover_node']);

      expect(tree.hover_node('a')).toBe(false);
      expect(log).toEqual([]);
    });

    it('should return false for an unknown node', () => {
      const tree = build();

      expect(tree.hover_node('nope')).toBe(false);
    });

    it('should clear the hover and emit dehover_node', () => {
      const tree = build();
      tree.hover_node('a');
      const log = record(tree, ['dehover_node']);

      tree.dehover_node('a');

      expect(anchor('a').classList.contains('md-tree-hovered')).toBe(false);
      expect(log).toEqual(['dehover_node:a']);
    });

    it('should return false when dehovering a node that is not hovered', () => {
      const tree = build();

      expect(tree.dehover_node('a')).toBe(false);
    });

    it('should route pointer hover through hover_node', () => {
      build();

      anchor('a').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      anchor('b').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(anchor('a').classList.contains('md-tree-hovered')).toBe(false);
      expect(anchor('b').classList.contains('md-tree-hovered')).toBe(true);
    });
  });

  describe('get_container_ul', () => {
    it('should return the root list element', () => {
      const tree = build();

      expect(tree.get_container_ul()).toBe(container.querySelector('.md-tree-container-ul'));
    });
  });

  describe('get_string', () => {
    it('should return the key when no strings are configured', () => {
      const tree = build();

      expect(tree.get_string('Loading ...')).toBe('Loading ...');
    });

    it('should look the key up in a strings map', () => {
      const tree = build({ strings: { 'Loading ...': 'Chargement ...' } });

      expect(tree.get_string('Loading ...')).toBe('Chargement ...');
      expect(tree.get_string('Unmapped')).toBe('Unmapped');
    });

    it('should call a strings function with the tree as this', () => {
      let receivedThis: unknown = null;
      const tree = build({
        strings: function (this: unknown, key: string) {
          receivedThis = this;
          return key.toUpperCase();
        },
      });

      expect(tree.get_string('new node')).toBe('NEW NODE');
      expect(receivedThis).toBe(tree);
    });
  });

  describe('get_type / set_type', () => {
    it('should return the node type', () => {
      const tree = build({}, { types });

      expect(tree.get_type('a')).toBe('folder');
    });

    it('should return the type with its rules when asked', () => {
      const tree = build({}, { types });

      expect(tree.get_type('a', true)).toEqual({ type: 'folder', icon: 'folder-icon', max_children: 2 });
    });

    it('should return false for an unknown node', () => {
      const tree = build({}, { types });

      expect(tree.get_type('nope')).toBe(false);
    });

    it('should change the type and render the new type icon', () => {
      const tree = build({}, { types });

      expect(tree.set_type('a', 'file')).toBe(true);

      expect(tree.get_type('a')).toBe('file');
      const icon = container.querySelector('#a .md-tree-themeicon') as HTMLElement;
      expect(icon.className).toContain('file-icon');
      expect(icon.className).not.toContain('folder-icon');
    });

    it('should refuse a type that is not configured', () => {
      const tree = build({}, { types });

      expect(tree.set_type('a', 'unknown')).toBe(false);
      expect(tree.get_type('a')).toBe('folder');
    });

    it('should accept an array of nodes', () => {
      const tree = build({}, { types });

      expect(tree.set_type(['a', 'b'], 'folder')).toBe(true);
      expect([tree.get_type('a'), tree.get_type('b')]).toEqual(['folder', 'folder']);
    });
  });

  describe('get_theme_variant', () => {
    it('should be false until a variant is set', () => {
      const tree = build();

      expect(tree.get_theme_variant()).toBe(false);
    });

    it('should report the variant set by set_theme_variant', () => {
      const tree = build();

      tree.set_theme_variant('large');

      expect(tree.get_theme_variant()).toBe('large');
    });
  });

  describe('redraw_node', () => {
    it('should return the redrawn node element', () => {
      const tree = build();

      expect(tree.redraw_node('a')).toBe(container.querySelector('#a'));
    });

    it('should return false for an unknown node', () => {
      const tree = build();

      expect(tree.redraw_node('nope')).toBe(false);
    });
  });
});
