import type { TreePlugin, TreePluginHost, TreeNode, ContextMenuConfig, ContextMenuItem } from '../types';

const EVENT_NS = 'MDFolderTree';

/**
 * ContextMenuPlugin - shows a configurable context menu on right-click.
 * Mirrors jstree's "contextmenu" plugin.
 *
 * Config: `contextmenu: { select_node, show_at_node, items }`
 */
export class ContextMenuPlugin implements TreePlugin {
  readonly name = 'contextmenu';
  private tree!: TreePluginHost;
  private menuEl: HTMLElement | null = null;
  private contextHandler!: (e: MouseEvent) => void;
  private dismissHandler!: (e: MouseEvent) => void;
  private keyHandler!: (e: KeyboardEvent) => void;


  init(tree: TreePluginHost): void {
    this.tree = tree;

    this.contextHandler = (e: MouseEvent) => this.handleContextMenu(e);
    this.dismissHandler = (e: MouseEvent) => this.handleDismiss(e);
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide();
    };

    tree.getContainer().addEventListener('contextmenu', this.contextHandler);
  }

  destroy(): void {
    this.tree.getContainer().removeEventListener('contextmenu', this.contextHandler);
    this.hide();
  }

  show_contextmenu(node: TreeNode, x?: number, y?: number): void {
    const config = this.getConfig();

    // Select node on right-click if configured
    if (config.select_node !== false) {
      this.tree.selectNode(node.id);
    }

    const items = this.resolveItems(node);
    if (!items || Object.keys(items).length === 0) return;

    this.hide();
    this.menuEl = this.buildMenu(items);

    document.body.appendChild(this.menuEl);
    this.positionMenu(this.menuEl, x, y);

    // Bind dismiss handlers
    document.addEventListener('mousedown', this.dismissHandler, true);
    document.addEventListener('keydown', this.keyHandler, true);

    this.tree.emit(`show_contextmenu.${EVENT_NS}`, { node, x, y });
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    document.removeEventListener('mousedown', this.dismissHandler, true);
    document.removeEventListener('keydown', this.keyHandler, true);
  }

  private handleContextMenu(e: MouseEvent): void {
    const anchor = (e.target as HTMLElement).closest('.md-tree-anchor') as HTMLElement | null;
    if (!anchor) return;

    const li = anchor.closest('.md-tree-node') as HTMLElement | null;
    if (!li) return;

    const node = this.tree.getNode(li.id);
    if (!node) return;

    e.preventDefault();
    e.stopPropagation();

    const config = this.getConfig();
    if (config.show_at_node) {
      const rect = anchor.getBoundingClientRect();
      this.show_contextmenu(node, rect.left, rect.bottom);
    } else {
      this.show_contextmenu(node, e.clientX, e.clientY);
    }
  }

  private handleDismiss(e: MouseEvent): void {
    if (this.menuEl && !this.menuEl.contains(e.target as HTMLElement)) {
      this.hide();
    }
  }

  private resolveItems(node: TreeNode): Record<string, ContextMenuItem> {
    const config = this.getConfig();
    const itemsCfg = config.items;

    if (typeof itemsCfg === 'function') {
      let result: Record<string, ContextMenuItem> = {};
      const returned = itemsCfg(node, (items) => { result = items; });
      return returned || result;
    }

    if (itemsCfg && typeof itemsCfg === 'object') {
      return itemsCfg;
    }

    return this.getDefaultItems(node);
  }

  private getDefaultItems(node: TreeNode): Record<string, ContextMenuItem> {
    return {
      create: {
        label: 'Create',
        icon: false,
        action: () => {
          this.tree.createNode(node.id, { id: '', text: 'New node' });
        },
      },
      rename: {
        label: 'Rename',
        icon: false,
        action: () => {
          // Inline rename would need additional DOM support
          this.tree.emit(`rename_intent.${EVENT_NS}`, { node });
        },
      },
      remove: {
        label: 'Delete',
        icon: false,
        separator_before: true,
        action: () => {
          this.tree.deleteNode(node.id);
        },
      },
    };
  }

  private buildMenu(items: Record<string, ContextMenuItem>): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'md-tree-contextmenu';
    menu.setAttribute('role', 'menu');

    const ul = document.createElement('ul');

    for (const [key, item] of Object.entries(items)) {
      if (item.separator_before) {
        const sep = document.createElement('li');
        sep.className = 'md-tree-contextmenu-separator';
        sep.setAttribute('role', 'separator');
        ul.appendChild(sep);
      }

      const li = document.createElement('li');
      li.setAttribute('role', 'menuitem');

      const isDisabled = typeof item._disabled === 'function'
        ? item._disabled({ item, reference: this.tree.getContainer() })
        : !!item._disabled;

      if (isDisabled) {
        li.classList.add('md-tree-contextmenu-disabled');
      }

      const a = document.createElement('a');
      a.textContent = item.label ?? key;
      if (item.title) a.title = item.title;

      if (item.icon) {
        const icon = document.createElement('i');
        icon.className = typeof item.icon === 'string' ? item.icon : '';
        a.insertBefore(icon, a.firstChild);
      }

      if (!isDisabled && item.action) {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          item.action!({
            item,
            reference: this.tree.getContainer(),
            element: li,
            position: { x: 0, y: 0 },
          });
          this.hide();
        });
      }

      li.appendChild(a);

      // Submenu support
      if (item.submenu && Object.keys(item.submenu).length > 0) {
        li.classList.add('md-tree-contextmenu-has-submenu');
        const submenu = this.buildMenu(item.submenu);
        submenu.classList.add('md-tree-contextmenu-submenu');
        li.appendChild(submenu);
      }

      ul.appendChild(li);

      if (item.separator_after) {
        const sep = document.createElement('li');
        sep.className = 'md-tree-contextmenu-separator';
        sep.setAttribute('role', 'separator');
        ul.appendChild(sep);
      }
    }

    menu.appendChild(ul);
    return menu;
  }

  private positionMenu(menu: HTMLElement, x?: number, y?: number): void {
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';

    // Initial position
    const left = x ?? 0;
    const top = y ?? 0;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Adjust if overflows viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (rect.right > vw) {
        menu.style.left = `${Math.max(0, left - rect.width)}px`;
      }
      if (rect.bottom > vh) {
        menu.style.top = `${Math.max(0, top - rect.height)}px`;
      }
    });
  }

  private getConfig(): ContextMenuConfig {
    return this.tree.config.contextmenu ?? {};
  }
}
