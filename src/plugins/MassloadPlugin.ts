import type { TreePlugin, TreePluginHost, MassloadConfig } from '../types';

/**
 * MassloadPlugin - batches multiple lazy-load requests into a single request.
 * Mirrors jstree's "massload" plugin.
 *
 * When multiple nodes need to be loaded (e.g., after restoring state), this plugin
 * collects all pending node IDs and fires a single request instead of one per node.
 *
 * Config: `massload: { url, data, callback }`
 */
export class MassloadPlugin implements TreePlugin {
  readonly name = 'massload';
  private tree!: TreePluginHost;
  private pending: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  init(tree: TreePluginHost): void {
    this.tree = tree;
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pending.clear();
  }

  /**
   * Queue a node for batch loading. Call this instead of individual load_node requests.
   */
  queueLoad(nodeId: string): void {
    this.pending.add(nodeId);
    this.scheduleBatch();
  }

  /**
   * Queue multiple nodes for batch loading.
   */
  queueLoadMultiple(nodeIds: string[]): void {
    for (const id of nodeIds) {
      this.pending.add(id);
    }
    this.scheduleBatch();
  }

  private scheduleBatch(): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.executeBatch();
    }, 0);
  }

  private async executeBatch(): Promise<void> {
    if (this.pending.size === 0) return;

    const nodeIds = Array.from(this.pending);
    this.pending.clear();

    const config = this.getConfig();

    try {
      let response: unknown;

      if (config.url) {
        const body = config.data ? config.data(nodeIds) : { ids: nodeIds };
        const res = await fetch(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        response = await res.json();
      }

      if (config.callback && response !== undefined) {
        const nodeDataMap = config.callback(nodeIds, response);
        // Distribute loaded data to each node's children
        for (const [nodeId, children] of Object.entries(nodeDataMap)) {
          const node = this.tree.getNode(nodeId);
          if (node) {
            node.state.loaded = true;
            node.state.loading = false;
            for (const childData of children) {
              this.tree.createNode(nodeId, childData);
            }
          }
        }
        this.tree.redraw();
      }
    } catch {
      // Mark nodes as not loading on failure
      for (const id of nodeIds) {
        const node = this.tree.getNode(id);
        if (node) {
          node.state.loading = false;
        }
      }
    }
  }

  private getConfig(): MassloadConfig {
    return this.tree.config.massload ?? {};
  }
}
