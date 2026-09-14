import type { TreeNode, TreePlugin } from './types';
import type { TreeNodeStore } from './TreeNode';

/**
 * DOM rendering engine. Produces md-tree-compatible class names so existing
 * CSS works without modification.
 *
 * All DOM construction uses `document.createElement` + `textContent` /
 * `setAttribute` — never `innerHTML`.
 */
export class TreeRenderer {
  private container: HTMLElement;
  /** Node lookup for a child list, which the store already keys by id. */
  private store: TreeNodeStore;
  private plugins: TreePlugin[] = [];
  private sanitizeAttrs: boolean;
  private computePositions: boolean;
  private themeName = 'default';
  private onError?: (error: Record<string, unknown>) => void;

  constructor(
    container: HTMLElement,
    store: TreeNodeStore,
    plugins: TreePlugin[] = [],
    sanitizeAttrs = true,
    onError?: (error: Record<string, unknown>) => void,
    computePositions = false,
  ) {
    this.container = container;
    this.store = store;
    this.plugins = plugins;
    this.sanitizeAttrs = sanitizeAttrs;
    this.onError = onError;
    this.computePositions = computePositions;
  }

  /**
   * Run a plugin render hook. A throwing plugin must not abort the render and
   * leave the tree half-drawn, so failures are reported and skipped.
   */
  private runHook(plugin: TreePlugin, hook: string, fn: () => void): void {
    try {
      fn();
    } catch (cause) {
      this.onError?.({ error: 'plugin_hook', hook, plugin: plugin.name, cause });
    }
  }

  /**
   * Event-handler attributes execute consumer-supplied strings as script, so
   * they are stripped unless `core.sanitize_attrs` is explicitly disabled.
   * Other attributes are inert on the tags this renderer emits
   * (`li`, `a`, `i`, `span`, `ul`), and `href` is never taken from `a_attr`.
   */
  private isUnsafeAttr(key: string): boolean {
    return /^on/i.test(key);
  }

  /**
   * Marks put on a node from outside the renderer, which nothing re-applies:
   * the cut marking on the node, and the focus ring and hover on its anchor.
   *
   * Each is tracked by node id -- the keyboard's focused id, the clipboard's
   * buffered nodes, the hovered anchor found by query -- so a mark restored
   * onto a new element still belongs to whoever set it.
   * `md-tree-context` is deliberately absent: the context menu holds the
   * anchor it marked and clears the mark through that reference, while its
   * items redraw the node before the menu closes, so a restored copy would
   * outlive the menu's ability to take it off. Search is absent too, the
   * plugin putting it back through `onNodeRender`, and the dnd marker sits on
   * the body rather than inside a node.
   */
  private static readonly NODE_MARKS = ['md-tree-cut'];
  private static readonly ANCHOR_MARKS = ['md-tree-focused', 'md-tree-hovered'];

  /**
   * The marks every node of a subtree carries, by id. A cascade redraws the
   * topmost ancestor, so a descendant's marks matter as much as the root's.
   */
  private captureMarks(root: Element): Map<string, string[]> {
    const marks = new Map<string, string[]>();
    for (const el of [root, ...Array.from(root.querySelectorAll('.md-tree-node'))]) {
      if (!el.id) continue;
      const anchor = el.querySelector(':scope > .md-tree-anchor');
      const held = [
        ...TreeRenderer.NODE_MARKS.filter((cls) => el.classList.contains(cls)),
        ...TreeRenderer.ANCHOR_MARKS.filter((cls) => anchor?.classList.contains(cls)),
      ];
      if (held.length) marks.set(el.id, held);
    }
    return marks;
  }

  /** Put those marks back on the subtree that replaces it. */
  private restoreMarks(root: Element, marks: Map<string, string[]>): void {
    if (marks.size === 0) return;
    for (const el of [root, ...Array.from(root.querySelectorAll('.md-tree-node'))]) {
      const held = marks.get(el.id);
      if (!held) continue;
      const anchor = el.querySelector(':scope > .md-tree-anchor');
      for (const cls of held) {
        if (TreeRenderer.NODE_MARKS.includes(cls)) el.classList.add(cls);
        else anchor?.classList.add(cls);
      }
    }
  }

  /** Render the full tree from the root nodes. */
  render(nodes: TreeNode[]): void {
    // Apply plugin pre-render hooks
    let processedNodes = nodes;
    for (const plugin of this.plugins) {
      if (!plugin.onBeforeRender) continue;
      this.runHook(plugin, 'onBeforeRender', () => {
        processedNodes = plugin.onBeforeRender!(processedNodes);
      });
    }

    // Clear existing content
    this.container.innerHTML = '';

    // Set up root container classes
    this.container.classList.add('md-tree', `md-tree-${this.themeName}`);
    this.container.setAttribute('role', 'tree');

    // Create root <ul>
    const rootUl = document.createElement('ul');
    rootUl.className = 'md-tree-container-ul md-tree-children';
    rootUl.setAttribute('role', 'group');

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < processedNodes.length; i++) {
      fragment.appendChild(this.renderNode(processedNodes[i], i, processedNodes.length));
    }
    rootUl.appendChild(fragment);
    this.container.appendChild(rootUl);
  }

  /** Re-render a single node and its children in-place. */
  renderSingleNode(node: TreeNode): void {
    const existing = this.container.querySelector(`#${CSS.escape(node.id)}`);
    if (!existing) return;

    const parent = existing.parentElement;
    if (!parent) return;

    // The node's place among its siblings, which aria-posinset reports.
    const siblings = Array.from(parent.children).filter((el) => el.classList.contains('md-tree-node'));
    const index = siblings.indexOf(existing);
    // Drawing replaces the whole subtree, so the marks it does not own are
    // taken off the old one and put back on the new.
    const marks = this.captureMarks(existing);
    const newEl = this.renderNode(node, index === -1 ? 0 : index, siblings.length);
    this.restoreMarks(newEl, marks);
    parent.replaceChild(newEl, existing);
  }

  /** Add a space-separated class list, as jstree does for li_attr / a_attr. */
  private addClasses(el: HTMLElement, classes: string | undefined): void {
    if (classes) el.classList.add(...classes.split(/\s+/).filter(Boolean));
  }

  /**
   * Render one node. `index` and `total` are its place among its siblings,
   * which `aria-posinset` / `aria-setsize` report and `md-tree-last` uses.
   */
  private renderNode(node: TreeNode, index: number, total: number): HTMLElement {
    const isLast = index === total - 1;
    const li = document.createElement('li');
    li.id = node.id;
    // As in jstree, the anchor is the treeitem; the <li> only groups it.
    li.setAttribute('role', 'none');

    // State classes
    const hasChildren = node.children.length > 0 || node.state.loading || !node.state.loaded;
    if (hasChildren) {
      li.className = node.state.opened ? 'md-tree-node md-tree-open' : 'md-tree-node md-tree-closed';
    } else {
      li.className = 'md-tree-node md-tree-leaf';
    }
    if (isLast) {
      li.classList.add('md-tree-last');
    }
    if (node.state.hidden) {
      li.classList.add('md-tree-hidden');
    }
    // As in jstree, a node reports that it is loading for as long as it is.
    if (node.state.loading) {
      li.classList.add('md-tree-loading');
    }
    // As in jstree, li_attr.class adds to the node's own classes.
    this.addClasses(li, node.li_attr.class);

    // li_attr
    for (const [key, value] of Object.entries(node.li_attr)) {
      if (key !== 'id' && key !== 'class') {
        if (this.sanitizeAttrs && this.isUnsafeAttr(key)) continue;
        li.setAttribute(key, value);
      }
    }

    // Open/close toggle icon
    const ocl = document.createElement('i');
    ocl.className = 'md-tree-icon md-tree-ocl';
    ocl.setAttribute('role', 'presentation');
    li.appendChild(ocl);

    // Anchor
    const anchor = document.createElement('a');
    anchor.className = 'md-tree-anchor';
    anchor.setAttribute('href', '#');
    anchor.setAttribute('tabindex', '-1');
    // As in jstree, every aria attribute lives on the anchor: the level always,
    // expansion only for a node that can hold children, and the positions only
    // when core.compute_elements_positions asks for them.
    anchor.setAttribute('role', 'treeitem');
    anchor.setAttribute('aria-selected', String(node.state.selected));
    anchor.setAttribute('aria-level', String(node.parents.length));
    if (hasChildren) {
      anchor.setAttribute('aria-expanded', String(node.state.opened && node.state.loaded));
    }
    if (node.state.disabled) {
      anchor.setAttribute('aria-disabled', 'true');
    }
    if (node.state.loading) {
      anchor.setAttribute('aria-busy', 'true');
    }
    if (this.computePositions) {
      anchor.setAttribute('aria-setsize', String(total));
      anchor.setAttribute('aria-posinset', String(index + 1));
    }
    if (node.state.selected) {
      anchor.classList.add('md-tree-clicked');
    }
    // jstree marks a disabled node on its anchor.
    if (node.state.disabled) {
      anchor.classList.add('md-tree-disabled');
    }
    this.addClasses(anchor, node.a_attr.class);

    // a_attr
    for (const [key, value] of Object.entries(node.a_attr)) {
      if (key !== 'class' && key !== 'href') {
        if (this.sanitizeAttrs && this.isUnsafeAttr(key)) continue;
        anchor.setAttribute(key, value);
      }
    }

    // Icon, as jstree renders it: true is the theme icon, false hides it, a
    // string containing '/' or '.' is an image URL, and any other string is a
    // class list (such as Font Awesome's 'fa fa-folder').
    const themeIcon = document.createElement('i');
    themeIcon.className = 'md-tree-icon md-tree-themeicon';
    if (node.icon === false) {
      themeIcon.classList.add('md-tree-themeicon-hidden');
    } else if (typeof node.icon === 'string' && node.icon) {
      if (node.icon.includes('/') || node.icon.includes('.')) {
        themeIcon.style.backgroundImage = `url("${node.icon.replace(/["\\]/g, '\\$&')}")`;
      } else {
        this.addClasses(themeIcon, node.icon);
      }
      themeIcon.classList.add('md-tree-themeicon-custom');
      // jstree keeps a custom icon in `rel`, which show_icon reads back.
      themeIcon.setAttribute('rel', node.icon);
    }
    themeIcon.setAttribute('role', 'presentation');
    anchor.appendChild(themeIcon);

    // Node text — uses textContent (XSS safe)
    const textSpan = document.createElement('span');
    textSpan.textContent = node.text;
    anchor.appendChild(textSpan);

    li.appendChild(anchor);

    // Plugin node-render hooks
    for (const plugin of this.plugins) {
      if (!plugin.onNodeRender) continue;
      this.runHook(plugin, 'onNodeRender', () => plugin.onNodeRender!(node, li));
    }

    // Children
    if (node.children.length > 0) {
      const childUl = document.createElement('ul');
      childUl.className = 'md-tree-children';
      childUl.setAttribute('role', 'group');

      for (let i = 0; i < node.children.length; i++) {
        const childNode = this.store.get(node.children[i]);
        if (childNode) {
          childUl.appendChild(this.renderNode(childNode, i, node.children.length));
        }
      }
      li.appendChild(childUl);
    }

    return li;
  }

  /** The theme class re-applied on every full render. */
  setThemeName(name: string): void {
    this.themeName = name;
  }

  setPlugins(plugins: TreePlugin[]): void {
    this.plugins = plugins;
  }
}
