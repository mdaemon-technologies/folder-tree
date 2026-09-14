import type { TreeNodeData } from '../types';

/** State classes that jstree reads from the markup rather than keeping. */
const LI_STATE_CLASSES = ['md-tree-open', 'md-tree-closed'];
const A_STATE_CLASSES = ['md-tree-clicked', 'md-tree-disabled'];

/**
 * Parse existing `<ul>/<li>` HTML into TreeNodeData[], as jstree's
 * `_parse_model_from_html` does, under the names the migration codemod
 * produces (`jstree-*` → `md-tree-*`, `data-jstree` → `data-md-tree`):
 *
 * - `md-tree-open` on the `<li>` opens it; `md-tree-closed` on an `<li>`
 *   without a child list makes it lazy (`children: true`).
 * - `md-tree-clicked` / `md-tree-disabled` on the anchor select / disable it.
 * - A rendered `.md-tree-themeicon` gives the icon: its `rel`, or false when
 *   hidden.
 * - `data-*` attributes become `data`, converted as jQuery's `.data()` does,
 *   with the `data-md-tree` payload under `data.jstree` — which, as in jstree,
 *   overrides the state and icon read from the markup.
 */
export class HtmlParser {
  parse(container: HTMLElement): TreeNodeData[] {
    const rootUl = container.querySelector('ul');
    if (!rootUl) return [];
    return this.parseChildren(rootUl);
  }

  /**
   * Parse an HTML string as jstree's `_append_html_data` does: the items of
   * any top-level `<ul>`, otherwise every top-level element. The markup is
   * parsed in an inert document, so nothing in it loads or runs.
   */
  parseFragment(html: string): TreeNodeData[] {
    const inert = document.implementation.createHTMLDocument('');
    inert.body.innerHTML = html;
    const top = Array.from(inert.body.children) as HTMLElement[];
    const lists = top.filter((el) => el.tagName === 'UL');
    if (lists.length === 0) return top.map((el) => this.parseLi(el));
    const items: TreeNodeData[] = [];
    for (const ul of lists) items.push(...this.parseChildren(ul));
    return items;
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
    const anchor = li.querySelector(':scope > a') as HTMLElement | null;
    const payload = this.readPayload(li);

    // Extract text from the <a> tag, or the first text node
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

    // A rendered theme icon gives the icon, and the payload's icon overrides it.
    let icon: string | boolean | undefined;
    const themeIcon = anchor?.querySelector(':scope > .md-tree-themeicon');
    if (themeIcon) {
      icon = themeIcon.classList.contains('md-tree-themeicon-hidden') ? false : themeIcon.getAttribute('rel') ?? undefined;
    }
    if (payload?.icon !== undefined) icon = payload.icon as string | boolean;

    const node: TreeNodeData = {
      id,
      text,
      icon,
      type: (payload?.type as string) ?? li.getAttribute('data-type') ?? 'default',
      // The state the markup shows, with the payload over it as in jstree. The
      // model layers a node's own state over data.jstree, so the payload is
      // folded in here to keep jstree's order for markup.
      state: {
        opened: li.classList.contains('md-tree-open'),
        selected: anchor?.classList.contains('md-tree-clicked') === true,
        disabled: anchor?.classList.contains('md-tree-disabled') === true,
        ...payload,
      },
      li_attr: this.getAttributes(li, LI_STATE_CLASSES),
      a_attr: anchor ? this.getAttributes(anchor, A_STATE_CLASSES) : {},
      data: this.readData(li, payload),
    };

    // Parse nested <ul> children; a closed node without any is lazy.
    const childUl = li.querySelector(':scope > ul');
    if (childUl) {
      node.children = this.parseChildren(childUl as HTMLElement);
    } else if (li.classList.contains('md-tree-closed')) {
      node.children = true;
    }

    return node;
  }

  /** The data-md-tree payload (jstree's data-jstree), when it is a JSON object. */
  private readPayload(el: HTMLElement): Record<string, unknown> | null {
    const raw = el.getAttribute('data-md-tree');
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      // Ignore malformed JSON — never use eval()
      return null;
    }
  }

  /**
   * The element's data-* attributes, converted as jQuery's `.data()` does,
   * with the data-md-tree payload under `jstree`.
   */
  private readData(el: HTMLElement, payload: Record<string, unknown> | null): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(el.dataset)) {
      if (key !== 'mdTree') data[key] = convertDataValue(value ?? '');
    }
    if (payload) data.jstree = payload;
    return data;
  }

  private getAttributes(el: HTMLElement, stateClasses: string[]): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'data-md-tree') continue;
      if (attr.name === 'class') {
        // As in jstree, the state classes are read into the state, not kept.
        const kept = attr.value.split(/\s+/).filter((c) => c && !stateClasses.includes(c)).join(' ');
        if (kept) attrs.class = kept;
        continue;
      }
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
}

/** jQuery's `.data()` conversion of a data-* attribute string. */
function convertDataValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === String(+value)) return +value;
  if (/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
