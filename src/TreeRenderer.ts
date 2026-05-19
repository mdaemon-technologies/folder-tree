import type { TreeNode, TreePlugin } from './types';

/**
 * DOM rendering engine. Produces md-tree-compatible class names so existing
 * CSS works without modification.
 *
 * All DOM construction uses `document.createElement` + `textContent` /
 * `setAttribute` — never `innerHTML`.
 */
export class TreeRenderer {
  private container: HTMLElement;
  private plugins: TreePlugin[] = [];
  private sanitizeAttrs: boolean;

  constructor(container: HTMLElement, plugins: TreePlugin[] = [], sanitizeAttrs = false) {
    this.container = container;
    this.plugins = plugins;
    this.sanitizeAttrs = sanitizeAttrs;
  }

  private isUnsafeAttr(key: string): boolean {
    return /^on/i.test(key);
  }

  /** Render the full tree from the root nodes. */
  render(nodes: TreeNode[], nodeMap: Map<string, TreeNode>): void {
    // Apply plugin pre-render hooks
    let processedNodes = nodes;
    for (const plugin of this.plugins) {
      if (plugin.onBeforeRender) {
        processedNodes = plugin.onBeforeRender(processedNodes);
      }
    }

    // Clear existing content
    this.container.innerHTML = '';

    // Set up root container classes
    this.container.classList.add('md-tree', 'md-tree-default');
    this.container.setAttribute('role', 'tree');

    // Create root <ul>
    const rootUl = document.createElement('ul');
    rootUl.className = 'md-tree-container-ul md-tree-children';
    rootUl.setAttribute('role', 'group');

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < processedNodes.length; i++) {
      const isLast = i === processedNodes.length - 1;
      fragment.appendChild(this.renderNode(processedNodes[i], nodeMap, isLast));
    }
    rootUl.appendChild(fragment);
    this.container.appendChild(rootUl);
  }

  /** Re-render a single node and its children in-place. */
  renderSingleNode(node: TreeNode, nodeMap: Map<string, TreeNode>): void {
    const existing = this.container.querySelector(`#${CSS.escape(node.id)}`);
    if (!existing) return;

    const parent = existing.parentElement;
    if (!parent) return;

    const isLast = !existing.nextElementSibling;
    const newEl = this.renderNode(node, nodeMap, isLast);
    parent.replaceChild(newEl, existing);
  }

  private renderNode(node: TreeNode, nodeMap: Map<string, TreeNode>, isLast: boolean): HTMLElement {
    const li = document.createElement('li');
    li.id = node.id;
    li.setAttribute('role', 'treeitem');

    // State classes
    const hasChildren = node.children.length > 0 || node.state.loading;
    if (hasChildren) {
      li.className = node.state.opened ? 'md-tree-node md-tree-open' : 'md-tree-node md-tree-closed';
    } else {
      li.className = 'md-tree-node md-tree-leaf';
    }
    if (isLast) {
      li.classList.add('md-tree-last');
    }
    if (node.state.disabled) {
      li.classList.add('md-tree-disabled');
    }
    if (node.state.hidden) {
      li.classList.add('md-tree-hidden');
    }

    // Accessibility
    li.setAttribute('aria-expanded', String(node.state.opened));
    li.setAttribute('aria-selected', String(node.state.selected));
    if (node.state.disabled) {
      li.setAttribute('aria-disabled', 'true');
    }

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
    if (node.state.selected) {
      anchor.classList.add('md-tree-clicked');
    }

    // a_attr
    for (const [key, value] of Object.entries(node.a_attr)) {
      if (key !== 'class' && key !== 'href') {
        if (this.sanitizeAttrs && this.isUnsafeAttr(key)) continue;
        anchor.setAttribute(key, value);
      }
    }

    // Type icon
    const themeIcon = document.createElement('i');
    themeIcon.className = 'md-tree-icon md-tree-themeicon';
    if (node.icon !== false && node.icon) {
      themeIcon.classList.add(node.icon, 'md-tree-themeicon-custom');
    } else if (node.icon === false) {
      themeIcon.classList.add('md-tree-themeicon-hidden');
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
      if (plugin.onNodeRender) {
        plugin.onNodeRender(node, li);
      }
    }

    // Children
    if (node.children.length > 0) {
      const childUl = document.createElement('ul');
      childUl.className = 'md-tree-children';
      childUl.setAttribute('role', 'group');

      for (let i = 0; i < node.children.length; i++) {
        const childNode = nodeMap.get(node.children[i]);
        if (childNode) {
          const childIsLast = i === node.children.length - 1;
          childUl.appendChild(this.renderNode(childNode, nodeMap, childIsLast));
        }
      }
      li.appendChild(childUl);
    }

    return li;
  }

  setPlugins(plugins: TreePlugin[]): void {
    this.plugins = plugins;
  }
}
