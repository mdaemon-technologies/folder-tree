import type { TreeNodeData } from '../types';

/**
 * Parse a flat or nested JSON array into TreeNodeData[].
 */
export class JsonParser {
  parse(data: TreeNodeData[]): TreeNodeData[] {
    return data.map((item) => this.normalizeNode(item));
  }

  private normalizeNode(raw: TreeNodeData): TreeNodeData {
    const node: TreeNodeData = {
      id: raw.id ?? this.generateId(),
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

  private counter = 0;
  private generateId(): string {
    return `mdft_${++this.counter}`;
  }
}
