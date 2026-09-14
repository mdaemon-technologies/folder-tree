import type { MDFolderTree } from '../MDFolderTree';
import type { TreePlugin, TreePluginHost, TreeNode, NodeRef, ContextMenuConfig, ContextMenuItem } from '../types';
import { EVENT_NS } from '../events/namespace';

/** The data an item's `action`, `_disabled` and `label` receive, as jstree's. */
interface ItemData {
  item: ContextMenuItem | string;
  reference: HTMLElement | null;
  element: HTMLElement | null;
  position?: { x: number; y: number };
}

/**
 * Context menu, as jstree's contextmenu plugin with its `$.vakata.context`
 * menu.
 *
 * Right-clicking a node (or pressing it for 750ms on touch) activates it,
 * with `select_node`, and shows the menu — at the node with `show_at_node`
 * (the default), otherwise at the pointer — built from `items`: an object, or
 * `items(node, callback)`, called with the tree as `this`, answering at once
 * or through the callback. The menu is a `ul.vakata-context` of jstree's
 * markup; an item's `action` receives `{ item, reference, element, position }`
 * with the node's anchor as `reference`. A disabled item does nothing, and an
 * action returning false keeps the menu open. The menu is navigated with the
 * arrows, Enter / Space and Escape, and items' `shortcut` keys; it closes on a
 * click outside it or on a node. `show_contextmenu` fires on the tree, and
 * `context_show` / `context_hide` on the document, as jstree fires them.
 */
export class ContextMenuPlugin implements TreePlugin {
  readonly name = 'contextmenu';
  private tree!: TreePluginHost;
  private api!: MDFolderTree;
  private menu: HTMLElement | null = null;
  private reference: HTMLElement | null = null;
  private items: ContextMenuItem[] = [];
  private position = { x: 0, y: 0 };
  private lastCtrl = 0;
  private touchTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStart = { x: 0, y: 0 };

  private contextHandler!: (e: MouseEvent) => void;
  private clickHandler!: (e: MouseEvent) => void;
  private pointerDownHandler!: (e: PointerEvent) => void;
  private pointerMoveHandler!: (e: PointerEvent) => void;
  private pointerEndHandler!: () => void;
  private dismissHandler!: (e: MouseEvent) => void;
  private escapeHandler!: (e: KeyboardEvent) => void;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.api = tree as unknown as MDFolderTree;
    const container = tree.getContainer();

    this.contextHandler = (e) => this.onContextMenu(e);
    this.clickHandler = (e) => this.onClick(e);
    this.pointerDownHandler = (e) => this.onPointerDown(e);
    this.pointerMoveHandler = (e) => this.onPointerMove(e);
    this.pointerEndHandler = () => this.clearTouch();
    this.dismissHandler = (e) => {
      if (this.menu && !this.menu.contains(e.target as Node)) this.hide();
    };
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') this.hide();
    };

    // jstree marks the tree for its contextmenu styles.
    container.classList.add('md-tree-contextmenu');
    container.addEventListener('contextmenu', this.contextHandler);
    container.addEventListener('click', this.clickHandler);
    container.addEventListener('pointerdown', this.pointerDownHandler);
    container.addEventListener('pointermove', this.pointerMoveHandler);
    container.addEventListener('pointerup', this.pointerEndHandler);
    container.addEventListener('pointercancel', this.pointerEndHandler);
  }

  destroy(): void {
    const container = this.tree.getContainer();
    container.classList.remove('md-tree-contextmenu');
    container.removeEventListener('contextmenu', this.contextHandler);
    container.removeEventListener('click', this.clickHandler);
    container.removeEventListener('pointerdown', this.pointerDownHandler);
    container.removeEventListener('pointermove', this.pointerMoveHandler);
    container.removeEventListener('pointerup', this.pointerEndHandler);
    container.removeEventListener('pointercancel', this.pointerEndHandler);
    this.clearTouch();
    this.hide();
  }

  /**
   * jstree's `show_contextmenu(obj, x, y, e)`: false for a missing node or the
   * root.
   */
  show_contextmenu(obj: NodeRef, x?: number, y?: number, e?: Event): boolean | void {
    const node = this.api.get_node(obj) as TreeNode | false;
    if (!node || node.id === '#') return false;
    const config = this.getConfig();
    const anchor = this.anchorOf(node.id);

    let left = x;
    let top = y;
    if (config.show_at_node !== false || left === undefined || top === undefined) {
      const rect = anchor?.getBoundingClientRect();
      left = (rect?.left ?? 0) + window.scrollX;
      top = (rect?.top ?? 0) + window.scrollY + (rect?.height || 24);
    }
    if (config.select_node !== false && !node.state.selected) {
      this.api.activate_node(node, (e ?? {}) as never);
    }

    const items = config.items ?? this.defaultItems();
    if (typeof items === 'function') {
      const answered = items.call(this.api, node, (later) => this.showMenu(node, left!, top!, later));
      if (answered && typeof answered === 'object') this.showMenu(node, left, top, answered);
      return;
    }
    if (items && typeof items === 'object') this.showMenu(node, left, top, items);
  }

  /** `$.vakata.context.hide()`: close the menu. */
  hide(): void {
    if (!this.menu) return;
    const detail = this.eventDetail();
    this.menu.remove();
    this.menu = null;
    this.reference?.classList.remove('md-tree-context');
    document.removeEventListener('mousedown', this.dismissHandler, true);
    document.removeEventListener('keydown', this.escapeHandler, true);
    document.dispatchEvent(new CustomEvent('context_hide.vakata', { detail }));
    this.reference = null;
  }

  // ---- Opening ----

  private onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    const anchor = target.closest('.md-tree-anchor') as HTMLElement | null;
    const li = anchor?.parentElement;
    if (!anchor || !li || !this.tree.getContainer().contains(anchor)) return;
    e.preventDefault();
    // jstree works around ctrl+click opening the menu on macOS.
    this.lastCtrl = e.ctrlKey ? Date.now() : 0;
    const node = this.tree.getNode(li.id);
    if (!node || node.state.loading) return;
    this.show_contextmenu(node, e.clientX + window.scrollX, e.clientY + window.scrollY, e);
  }

  /** A click on a node closes the menu, unless it is the ctrl+click that opened it. */
  private onClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.md-tree-anchor')) return;
    if (this.menu && (!this.lastCtrl || Date.now() - this.lastCtrl > 250)) this.hide();
    this.lastCtrl = 0;
  }

  /** jstree opens the menu on a 750ms touch press, cancelled by moving 10px. */
  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const anchor = (e.target as HTMLElement).closest('.md-tree-anchor') as HTMLElement | null;
    const li = anchor?.parentElement;
    if (!anchor || !li) return;
    this.clearTouch();
    this.touchStart = { x: e.clientX, y: e.clientY };
    this.touchTimer = setTimeout(() => {
      this.touchTimer = null;
      // The click that ends the press must not close the menu it opened.
      this.lastCtrl = Date.now() + 10000;
      const node = this.tree.getNode(li.id);
      if (node && !node.state.loading) {
        this.show_contextmenu(node, this.touchStart.x + window.scrollX, this.touchStart.y + window.scrollY, e);
      }
    }, 750);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.touchTimer) return;
    if (Math.abs(e.clientX - this.touchStart.x) > 10 || Math.abs(e.clientY - this.touchStart.y) > 10) {
      this.clearTouch();
      this.hide();
    }
  }

  private clearTouch(): void {
    if (this.touchTimer) clearTimeout(this.touchTimer);
    this.touchTimer = null;
  }

  // ---- The menu ($.vakata.context) ----

  /** jstree's `_show_contextmenu` with `$.vakata.context.show`. */
  private showMenu(node: TreeNode, x: number, y: number, items: Record<string, ContextMenuItem>): void {
    this.hide();
    this.reference = this.anchorOf(node.id);
    this.position = { x, y };
    this.items = [];

    const menu = document.createElement('ul');
    menu.className = `vakata-context md-tree-contextmenu md-tree-${this.api.get_theme()}-contextmenu`;
    menu.setAttribute('role', 'menu');
    this.menu = menu;
    if (!this.fill(menu, items)) {
      this.menu = null;
      return;
    }

    document.body.appendChild(menu);
    for (const sub of Array.from(menu.querySelectorAll('ul'))) (sub as HTMLElement).style.display = 'none';
    for (const li of Array.from(menu.querySelectorAll('li'))) {
      if (li.querySelector(':scope > ul')) li.querySelector(':scope > a')?.classList.add('vakata-context-parent');
    }

    // Placed at x / y, kept inside the viewport.
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const right = window.innerWidth + window.scrollX;
    const bottom = window.innerHeight + window.scrollY;
    const left = width && x + width + 20 > right ? right - (width + 20) : x;
    const top = height && y + height + 20 > bottom ? bottom - (height + 20) : y;
    menu.style.position = 'absolute';
    menu.style.zIndex = '10000';
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.addEventListener('click', (e) => this.onMenuClick(e));
    menu.addEventListener('keydown', (e) => this.onMenuKey(e));
    menu.addEventListener('mouseover', (e) => this.onMenuHover(e));

    const first = menu.querySelector(':scope > li:not(.vakata-context-separator)');
    first?.classList.add('vakata-context-hover');
    (first?.querySelector(':scope > a') as HTMLElement | null)?.focus();

    this.reference?.classList.add('md-tree-context');
    document.addEventListener('mousedown', this.dismissHandler, true);
    document.addEventListener('keydown', this.escapeHandler, true);
    document.dispatchEvent(new CustomEvent('context_show.vakata', { detail: this.eventDetail() }));
    this.tree.emit(`show_contextmenu.${EVENT_NS}`, { node, x, y });
  }

  /** jstree's `$.vakata.context._parse`: draw the items into `ul`; false if there were none. */
  private fill(ul: HTMLElement, items: Record<string, ContextMenuItem>): boolean {
    let justSeparated = false;
    let drawn = 0;
    for (const [key, item] of Object.entries(items)) {
      if (!item) continue;
      const index = this.items.push(item) - 1;
      if (!justSeparated && item.separator_before) ul.appendChild(this.separator());
      justSeparated = false;

      const li = document.createElement('li');
      li.setAttribute('role', 'menuitem');
      if (item._class) li.className = String(item._class);
      if (this.isDisabled(item)) {
        li.classList.add('vakata-contextmenu-disabled');
        li.setAttribute('aria-disabled', 'true');
      }
      if (item.shortcut) li.setAttribute('data-shortcut', String(item.shortcut));

      const a = document.createElement('a');
      a.href = '#';
      a.setAttribute('rel', String(index));
      if (item.title) a.title = String(item.title);
      const icon = document.createElement('i');
      if (typeof item.icon === 'string' && item.icon) {
        if (item.icon.includes('/') || item.icon.includes('.')) {
          icon.style.background = `url("${item.icon.replace(/["\\]/g, '\\$&')}") center center no-repeat`;
        } else {
          icon.classList.add(...item.icon.split(/\s+/).filter(Boolean));
        }
      }
      const spacer = document.createElement('span');
      spacer.className = 'vakata-contextmenu-sep';
      spacer.innerHTML = '&#160;';
      // Labels are text here, unlike jstree's HTML (see force_text in PLAN).
      const label = typeof item.label === 'function' ? item.label(this.itemData(key)) : item.label ?? '';
      a.append(icon, spacer, document.createTextNode(String(label)));
      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = `vakata-contextmenu-shortcut vakata-contextmenu-shortcut-${item.shortcut}`;
        shortcut.textContent = String(item.shortcut_label ?? '');
        a.append(document.createTextNode(' '), shortcut);
      }
      li.appendChild(a);

      if (item.submenu) {
        const sub = document.createElement('ul');
        if (this.fill(sub, item.submenu)) li.appendChild(sub);
      }
      ul.appendChild(li);
      drawn++;

      if (item.separator_after) {
        ul.appendChild(this.separator());
        justSeparated = true;
      }
    }
    return drawn > 0;
  }

  private separator(): HTMLElement {
    const li = document.createElement('li');
    li.className = 'vakata-context-separator';
    li.setAttribute('role', 'separator');
    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML = '&#160;';
    li.appendChild(a);
    return li;
  }

  private isDisabled(item: ContextMenuItem): boolean {
    return item._disabled === true || (typeof item._disabled === 'function' && Boolean(item._disabled(this.itemData(item))));
  }

  /** jstree's `_execute`: run an item's action unless it is disabled; false if none ran. */
  private execute(index: number): unknown {
    const item = this.items[index];
    if (!item || this.isDisabled(item) || typeof item.action !== 'function') return false;
    return item.action.call(null, { ...this.itemData(item), position: { ...this.position } } as never);
  }

  private onMenuClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || !this.menu?.contains(a)) return;
    e.preventDefault();
    if (a.parentElement?.classList.contains('vakata-context-separator')) return;
    if (this.execute(Number(a.getAttribute('rel'))) !== false) this.hide();
  }

  private onMenuHover(e: MouseEvent): void {
    const li = (e.target as HTMLElement).closest('li');
    if (!li || !this.menu?.contains(li) || li.classList.contains('vakata-context-separator')) return;
    this.hover(li);
  }

  /** Mark `li` (and the items leading to it) hovered, and show its submenu. */
  private hover(li: Element): void {
    if (!this.menu) return;
    for (const el of Array.from(this.menu.querySelectorAll('.vakata-context-hover'))) el.classList.remove('vakata-context-hover');
    for (const sibling of Array.from(li.parentElement?.children ?? [])) {
      if (sibling !== li) sibling.querySelector(':scope > ul')?.setAttribute('style', 'display: none');
    }
    for (let el: Element | null = li; el && el !== this.menu; el = el.parentElement) {
      if (el.tagName === 'LI') el.classList.add('vakata-context-hover');
    }
    const sub = li.querySelector(':scope > ul') as HTMLElement | null;
    if (sub) sub.style.display = '';
  }

  /** jstree's menu keys: Enter / Space, the arrows, Escape, and item shortcuts. */
  private onMenuKey(e: KeyboardEvent): void {
    if (!this.menu) return;
    const menu = this.menu;
    const hovered = Array.from(menu.querySelectorAll('.vakata-context-hover'));
    const deepest = hovered[hovered.length - 1] as HTMLElement | undefined;
    const visibleList = (): Element => {
      const lists = [menu, ...Array.from(menu.querySelectorAll('ul'))].filter(
        (ul) => ul === menu || (ul as HTMLElement).style.display !== 'none',
      );
      return lists[lists.length - 1];
    };
    const choices = (list: Element) =>
      Array.from(list.children).filter((li) => !li.classList.contains('vakata-context-separator'));
    const focus = (li: Element | undefined) => {
      if (!li) return;
      this.hover(li);
      (li.querySelector(':scope > a') as HTMLElement | null)?.focus();
    };

    switch (e.key) {
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const target = (e.target as HTMLElement).closest('a') ?? deepest?.querySelector(':scope > a');
        target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const parent = deepest?.parentElement?.closest('li');
        if (parent && menu.contains(parent)) {
          (deepest!.parentElement as HTMLElement).style.display = 'none';
          focus(parent);
        }
        return;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const list = visibleList();
        const options = choices(list);
        const current = options.findIndex((li) => li.classList.contains('vakata-context-hover'));
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next = current === -1 ? (step === 1 ? 0 : options.length - 1) : (current + step + options.length) % options.length;
        focus(options[next]);
        return;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const sub = deepest?.querySelector(':scope > ul') as HTMLElement | null;
        if (sub) {
          sub.style.display = '';
          focus(choices(sub)[0]);
        }
        return;
      }
      case 'Escape':
        e.preventDefault();
        this.hide();
        return;
      default: {
        // An item's shortcut key clicks it.
        const code = e.keyCode || e.which;
        const shortcut = code ? menu.querySelector(`.vakata-contextmenu-shortcut-${code}`) : null;
        const li = shortcut?.closest('li');
        if (li && !li.classList.contains('vakata-contextmenu-disabled')) {
          e.preventDefault();
          li.querySelector(':scope > a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }
    }
  }

  private itemData(item: ContextMenuItem | string): ItemData {
    return { item, reference: this.reference, element: this.menu };
  }

  private eventDetail(): Record<string, unknown> {
    return { reference: this.reference, element: this.menu, position: { ...this.position } };
  }

  private anchorOf(id: string): HTMLElement | null {
    return this.tree.getContainer().querySelector(`#${CSS.escape(id)} > .md-tree-anchor`);
  }

  // ---- jstree's default items ----

  /** jstree's default items: Create, Rename, Delete and the Edit submenu (cut, copy, paste). */
  private defaultItems(): Record<string, ContextMenuItem> {
    const at = (data: ItemData) => {
      const container = data.reference?.closest('.md-tree');
      const inst =
        ((container as unknown as { __mdFolderTree?: MDFolderTree } | null)?.__mdFolderTree ?? this.api) as MDFolderTree;
      return { inst, obj: inst.get_node(data.reference as HTMLElement) as TreeNode };
    };
    return {
      create: {
        separator_before: false,
        separator_after: true,
        _disabled: false,
        label: 'Create',
        action: (data) => {
          const { inst, obj } = at(data as ItemData);
          inst.create_node(obj, {} as never, 'last', (created) => inst.edit(created));
        },
      },
      rename: {
        separator_before: false,
        separator_after: false,
        _disabled: false,
        label: 'Rename',
        action: (data) => {
          const { inst, obj } = at(data as ItemData);
          inst.edit(obj);
        },
      },
      remove: {
        separator_before: false,
        icon: false,
        separator_after: false,
        _disabled: false,
        label: 'Delete',
        action: (data) => {
          const { inst, obj } = at(data as ItemData);
          if (inst.is_selected(obj)) inst.delete_node(inst.get_selected());
          else inst.delete_node(obj);
        },
      },
      ccp: {
        separator_before: true,
        icon: false,
        separator_after: false,
        label: 'Edit',
        action: false,
        submenu: {
          cut: {
            separator_before: false,
            separator_after: false,
            label: 'Cut',
            action: (data) => {
              const { inst, obj } = at(data as ItemData);
              inst.cut(inst.is_selected(obj) ? inst.get_top_selected() : obj);
            },
          },
          copy: {
            separator_before: false,
            icon: false,
            separator_after: false,
            label: 'Copy',
            action: (data) => {
              const { inst, obj } = at(data as ItemData);
              inst.copy(inst.is_selected(obj) ? inst.get_top_selected() : obj);
            },
          },
          paste: {
            separator_before: false,
            icon: false,
            _disabled: (data) => !at(data as ItemData).inst.can_paste(),
            separator_after: false,
            label: 'Paste',
            action: (data) => {
              const { inst, obj } = at(data as ItemData);
              inst.paste(obj);
            },
          },
        },
      },
    };
  }

  private getConfig(): ContextMenuConfig {
    return this.tree.config.contextmenu ?? {};
  }
}
