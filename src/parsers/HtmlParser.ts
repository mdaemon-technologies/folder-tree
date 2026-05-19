import type { TreeNodeData } from '../types';

/**
 * Parse existing `<ul>/<li>` HTML with optional `data-md-tree` attributes
 * into TreeNodeData[].
 */
export class HtmlParser {
  parse(container: HTMLElement): TreeNodeData[] {
    const rootUl = container.querySelector('ul');
    if (!rootUl) return [];
    return this.parseChildren(rootUl);
  }

  private parseChildren(ul: HTMLElement): TreeNodeData[] {
    const nodes: TreeNodeData[] = [];

    for (const child of Array.from(ul.children)) {
      if (child.tagName === 'LI') {
        nodes.push(this.parseLi(child as HTMLElement));
      }
    }

    return nodes;
  }

  private parseLi(li: HTMLElement): TreeNodeData {
    const id = li.id || li.getAttribute('data-id') || '';

    // Parse data-md-tree attribute for state/icon config
    let mdTreeData: Record<string, unknown> = {};
    const dataAttr = li.getAttribute('data-md-tree');
    if (dataAttr) {
      try {
        mdTreeData = JSON.parse(dataAttr);
      } catch {
        // Ignore malformed JSON — never use eval()
      }
    }

    // Extract text from the first text node or <a> tag
    const anchor = li.querySelector(':scope > a');
    let text = '';
    if (anchor) {
      text = anchor.textContent?.trim() ?? '';
    } else {
      // Get direct text content (not from children <ul>)
      for (const child of Array.from(li.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent?.trim();
          if (t) {
            text = t;
            break;
          }
        }
      }
    }

    const node: TreeNodeData = {
      id,
      text,
      icon: (mdTreeData.icon as string | false) ?? undefined,
      type: (mdTreeData.type as string) ?? li.getAttribute('data-type') ?? 'default',
      state: {
        opened: li.classList.contains('md-tree-open') || (mdTreeData.opened as boolean) === true,
        selected: (mdTreeData.selected as boolean) === true,
        disabled: (mdTreeData.disabled as boolean) === true,
        checked: (mdTreeData.checked as boolean) === true,
      },
      li_attr: this.getAttributes(li),
      a_attr: anchor ? this.getAttributes(anchor as HTMLElement) : {},
    };

    // Parse nested <ul> children
    const childUl = li.querySelector(':scope > ul');
    if (childUl) {
      node.children = this.parseChildren(childUl as HTMLElement);
    }

    return node;
  }

  private getAttributes(el: HTMLElement): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (attr.name !== 'data-md-tree') {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }
}
