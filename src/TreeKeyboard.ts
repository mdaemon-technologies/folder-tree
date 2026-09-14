import type { MDFolderTree } from './MDFolderTree';
import { comboFromEvent, normalizeCombo } from './keyboard';
import type { KeyboardHandler } from './types';
import { isNodeVisible } from './dom';

/**
 * Keyboard navigation, and the virtual focus it moves.
 *
 * jstree gives the anchor itself the focus; here it is virtual -- the
 * container carries `aria-activedescendant` and the focused anchor carries
 * `md-tree-focused` -- so a keydown is presented to handlers as though it had
 * been delegated to that anchor, and runs with the tree as `this`, which is
 * what `core.keyboard` handlers are written against.
 *
 * It reaches its tree through the public API; the container listeners are
 * registered with the tree's own signal, so `destroy()` still takes them off.
 */
export class TreeKeyboard {
  private focusedId: string | null = null;

  constructor(private readonly tree: MDFolderTree) {}

  /**
   * @param signal The tree's listener signal, so teardown stays in one place.
   * @param isDestroyed Guards a keystroke that arrives as the tree goes away.
   */
  bind(signal: AbortSignal, isDestroyed: () => boolean): void {
    const container = this.tree.getContainer();
    container.setAttribute('tabindex', '0');
    const defaults = this.defaultKeyboard();

    container.addEventListener('keydown', (e: KeyboardEvent) => {
      if (isDestroyed()) return;
      // As jstree does, leave keystrokes typed into an input (inline rename).
      if (e.target instanceof HTMLInputElement) return;

      const handler = this.keyboardHandlerFor(e, defaults);
      // A jQuery handler returning false prevents default and stops
      // propagation; jstree's keyboard contract relies on that.
      if (handler && handler.call(this.tree, this.delegatedKeyEvent(e)) === false) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { signal });

    // jstree's restore_focus: returning to the tree resumes at the last
    // focused node, which the virtual focus here keeps on its own. With it
    // off, leaving the tree forgets that node.
    container.addEventListener('focusout', (e: FocusEvent) => {
      if (this.tree.config.core?.restore_focus !== false) return;
      const next = e.relatedTarget as Node | null;
      if (next && container.contains(next)) return;
      this.setFocused(null);
    }, { signal });
  }

  /** Move the virtual focus, marking the anchor and scrolling it into view. */
  setFocused(id: string | null): void {
    const container = this.tree.getContainer();
    if (this.focusedId) {
      container.querySelector(`#${CSS.escape(this.focusedId)} > .md-tree-anchor`)?.classList.remove('md-tree-focused');
    }

    this.focusedId = id;

    if (id) {
      const anchor = container.querySelector(`#${CSS.escape(id)} > .md-tree-anchor`) as HTMLElement | null;
      if (anchor) {
        anchor.classList.add('md-tree-focused');
        if (anchor.scrollIntoView) anchor.scrollIntoView({ block: 'nearest' });
      }
      container.setAttribute('aria-activedescendant', id);
    } else {
      container.removeAttribute('aria-activedescendant');
    }
  }

  private getFirstVisibleNodeId(): string | null {
    const nodes = Array.from(this.tree.getContainer().querySelectorAll('.md-tree-node'));
    return nodes.find((el) => isNodeVisible(el))?.id ?? null;
  }

  private getLastVisibleNodeId(): string | null {
    const nodes = Array.from(this.tree.getContainer().querySelectorAll('.md-tree-node'));
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (isNodeVisible(nodes[i])) return nodes[i].id;
    }
    return null;
  }

  /**
   * The keydown as a jstree handler sees it. jstree delegates keydown to the
   * focused anchor, so `target` and `currentTarget` are that anchor -- handlers
   * conventionally call `this.get_node(e.currentTarget)` -- and, being a jQuery
   * event, it carries the native one as `originalEvent`. Focus here is
   * virtual, on the container, so the event is presented that way: its
   * properties read from the native event, and its methods act on it.
   */
  private delegatedKeyEvent(e: KeyboardEvent): KeyboardEvent {
    const anchor = this.focusedId
      ? this.tree.getContainer().querySelector(`#${CSS.escape(this.focusedId)} > .md-tree-anchor`)
      : null;
    return new Proxy(e, {
      get: (native, prop) => {
        if (anchor && (prop === 'target' || prop === 'currentTarget')) return anchor;
        if (prop === 'originalEvent') return native;
        const value: unknown = Reflect.get(native, prop, native);
        return typeof value === 'function' ? value.bind(native) : value;
      },
    });
  }

  /**
   * Resolve a keydown to a handler: jstree's defaults with `core.keyboard`
   * merged over them, read on every keystroke as jstree does. `false`
   * disables every shortcut; a null entry disables one.
   */
  private keyboardHandlerFor(
    e: KeyboardEvent,
    defaults: Record<string, KeyboardHandler>,
  ): KeyboardHandler | null {
    const configured = this.tree.config.core?.keyboard;
    if (configured === false) return null;
    const combo = comboFromEvent(e);
    if (!combo) return null;

    const map = new Map<string, KeyboardHandler | null>();
    for (const [keys, handler] of Object.entries(defaults)) {
      map.set(normalizeCombo(keys), handler);
    }
    if (configured && typeof configured === 'object') {
      for (const [keys, handler] of Object.entries(configured)) {
        map.set(normalizeCombo(keys), handler);
      }
    }
    return map.get(combo) ?? null;
  }

  /** jstree 3.3's default shortcuts, ported to this tree's focus model. */
  private defaultKeyboard(): Record<string, KeyboardHandler> {
    const tree = this.tree;
    return {
      // aria defines space with ctrl only; plain space is left unbound.
      'ctrl-space': (e) => this.activateFocused(e),
      enter: (e) => this.activateFocused(e),
      left: (e) => {
        e.preventDefault();
        const id = this.focusedId;
        if (!id) return;
        if (tree.is_open(id)) {
          tree.close_node(id);
        } else {
          const parent = tree.get_parent(id);
          if (parent && parent !== '#') this.setFocused(parent);
        }
      },
      up: (e) => {
        e.preventDefault();
        this.focusStep(this.focusedId ? tree.get_prev_dom(this.focusedId) : null);
      },
      right: (e) => {
        e.preventDefault();
        const id = this.focusedId;
        if (!id) return;
        if (tree.is_closed(id)) {
          tree.open_node(id);
        } else if (tree.is_open(id)) {
          const nodeEl = tree.getContainer().querySelector(`#${CSS.escape(id)}`);
          const firstChild = tree.get_next_dom(id);
          if (firstChild && nodeEl?.contains(firstChild)) this.setFocused(firstChild.id);
        }
      },
      down: (e) => {
        e.preventDefault();
        this.focusStep(this.focusedId ? tree.get_next_dom(this.focusedId) : null);
      },
      // aria defines * (numpad) as open_all.
      '*': () => tree.open_all(),
      home: (e) => {
        e.preventDefault();
        this.setFocused(this.getFirstVisibleNodeId());
      },
      end: (e) => {
        e.preventDefault();
        this.setFocused(this.getLastVisibleNodeId());
      },
      f2: (e) => {
        e.preventDefault();
        if (this.focusedId) tree.edit(this.focusedId);
      },
    };
  }

  /** Arrow-key step: move to `target`, or to the first node when none is focused. */
  private focusStep(target: HTMLElement | null): void {
    if (!this.focusedId) {
      this.setFocused(this.getFirstVisibleNodeId());
    } else if (target) {
      this.setFocused(target.id);
    }
  }

  /** jstree's enter / ctrl-space: a click on the focused node, keeping modifiers. */
  private activateFocused(e: KeyboardEvent): void {
    if (this.focusedId) this.tree.activate_node(this.focusedId, e);
  }
}
