import type { TreeNodeData } from '../types';
import { buildModel } from '../model';

/**
 * Parse a flat or nested JSON array into normalized TreeNodeData[] — the
 * normalization the tree applies to every payload (see `buildModel`).
 */
export class JsonParser {
  private readonly generateId: (() => string) | undefined;
  private counter = 0;

  /**
   * @param generateId Supplies ids for nodes that lack one; by default they
   * are `mdft_1`, `mdft_2`, and so on.
   */
  constructor(generateId?: () => string) {
    this.generateId = generateId;
  }

  parse(data: TreeNodeData[]): TreeNodeData[] {
    const out = buildModel({
      data,
      parent: '#',
      existing: [],
      counter: this.counter,
      prefix: 'mdft',
      mint: this.generateId,
    });
    this.counter = out.counter;
    return out.normalized;
  }
}
