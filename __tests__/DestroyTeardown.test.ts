import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * `destroy()` previously left the click, dblclick, hover and keydown listeners
 * bound to the container: only handlers registered through the event bus were
 * removed. A destroyed instance kept intercepting events aimed at its
 * replacement.
 */
describe('destroy() teardown', () => {
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
    { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1' }] },
    { id: 'b', text: 'B' },
  ];

  /** Re-create a node in the emptied container to probe for stale listeners. */
  const plantNode = (id: string): HTMLElement => {
    const li = document.createElement('li');
    li.id = id;
    li.className = 'md-tree-node';
    const anchor = document.createElement('a');
    anchor.className = 'md-tree-anchor';
    li.appendChild(anchor);
    container.appendChild(li);
    return anchor;
  };

  describe('DOM listeners', () => {
    it('should not intercept clicks after destroy', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.destroy();

      const anchor = plantNode('b');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      anchor.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should not intercept open/close toggle clicks after destroy', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.destroy();

      const ocl = document.createElement('i');
      ocl.className = 'md-tree-icon md-tree-ocl';
      const li = document.createElement('li');
      li.id = 'a';
      li.className = 'md-tree-node';
      li.appendChild(ocl);
      container.appendChild(li);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      ocl.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should not apply hover classes after destroy', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.destroy();

      const anchor = plantNode('b');
      anchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(anchor.classList.contains('md-tree-hovered')).toBe(false);
    });

    it('should not respond to keyboard input after destroy', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.destroy();

      plantNode('b');
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));

      expect(container.getAttribute('aria-activedescendant')).toBeNull();
    });

    it('should let a replacement instance own the element cleanly', () => {
      const first = new MDFolderTree(container, { core: { data } });
      first.destroy();

      const second = new MDFolderTree(container, { core: { data } });
      const anchor = container.querySelector('#b > .md-tree-anchor') as HTMLElement;
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(second.get_selected()).toEqual(['b']);
    });
  });

  describe('instance state', () => {
    it('should clear the clipboard buffer on destroy', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      tree.copy('a');

      tree.destroy();

      // jstree reports an empty buffer with its fields false, not null.
      expect(tree.get_buffer().mode).toBe(false);
      expect(tree.can_paste()).toBe(false);
    });

    it('should clear the active descendant on destroy', () => {
      const tree = new MDFolderTree(container, { core: { data } });
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      expect(container.getAttribute('aria-activedescendant')).toBe('a');

      tree.destroy();

      expect(container.getAttribute('aria-activedescendant')).toBeNull();
    });

    it('should be safe to call destroy twice', () => {
      const tree = new MDFolderTree(container, { core: { data } });

      tree.destroy();

      expect(() => tree.destroy()).not.toThrow();
    });
  });

  describe('dnd plugin teardown', () => {
    it('should not continue a drag after the tree is destroyed', () => {
      const tree = new MDFolderTree(container, { core: { data }, plugins: ['dnd'] });
      const anchor = container.querySelector('#b > .md-tree-anchor') as HTMLElement;

      anchor.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
      );
      tree.destroy();

      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }),
      );

      expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();
    });

    it('should abandon a drag on pointercancel', () => {
      new MDFolderTree(container, { core: { data }, plugins: ['dnd'] });
      const anchor = container.querySelector('#b > .md-tree-anchor') as HTMLElement;

      anchor.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
      );
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }),
      );
      expect(document.querySelector('.md-tree-dnd-helper')).not.toBeNull();

      document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));

      expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();
    });
  });
});
