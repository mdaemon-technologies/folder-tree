import type { TreeNodeData } from '../types';

/**
 * Parse a flat or nested JSON array into TreeNodeData[].
 */
export class JsonParser {
  private readonly generateId: () => string;

  /**
   * @param generateId Supplies ids for nodes that lack one. The tree injects
   * its own minter so generated ids cannot collide with nodes already stored.
   */
  constructor(generateId?: () => string) {
    let counter = 0;
    this.generateId = generateId ?? (() => `mdft_${++counter}`);
  }

  parse(data: TreeNodeData[]): TreeNodeData[] {
    // Ids explicitly present in this payload are reserved up front: they are
    // not in the store yet, so the generator cannot otherwise see them.
    this.taken = new Set();
    this.collectIds(data);
    return data.map((item) => this.normalizeNode(item));
  }

  private taken: Set<string> = new Set();

  private collectIds(data: TreeNodeData[]): void {
    for (const raw of data) {
      if (raw.id) this.taken.add(raw.id);
      if (Array.isArray(raw.children)) this.collectIds(raw.children);
    }
  }

  private nextId(): string {
    let candidate = this.generateId();
    while (this.taken.has(candidate)) {
      candidate = this.generateId();
    }
    this.taken.add(candidate);
    return candidate;
  }

  private normalizeNode(raw: TreeNodeData): TreeNodeData {
    const node: TreeNodeData = {
      id: raw.id || this.nextId(),
      text: raw.text ?? '',
      icon: raw.icon,
      type: raw.type ?? 'default',
      state: {
        opened: raw.state?.opened ?? false,
        selected: raw.state?.selected ?? false,
        disabled: raw.state?.disabled ?? false,
        checked: raw.state?.checked ?? false,
      },
      li_attr: raw.li_attr ?? {},
      a_attr: raw.a_attr ?? {},
      data: raw.data ?? {},
    };

    if (Array.isArray(raw.children)) {
      node.children = raw.children.map((child) => this.normalizeNode(child));
    } else {
      node.children = raw.children ?? false;
    }

    // Preserve extra properties
    for (const key of Object.keys(raw)) {
      if (!(key in node)) {
        node[key] = raw[key];
      }
    }

    return node;
  }
}
