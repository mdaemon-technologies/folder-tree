import type { TreeNode } from './types';

/**
 * Internal store for TreeNode objects, keyed by ID for O(1) lookup.
 */
export class TreeNodeStore {
  private nodes: Map<string, TreeNode> = new Map();

  set(id: string, node: TreeNode): void {
    this.nodes.set(id, node);
  }

  get(id: string): TreeNode | null {
    return this.nodes.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  delete(id: string): void {
    this.nodes.delete(id);
  }

  clear(): void {
    this.nodes.clear();
  }

  getAllIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  getAll(): TreeNode[] {
    return Array.from(this.nodes.values());
  }

  size(): number {
    return this.nodes.size;
  }
}
