import type { MDFolderTree } from '../MDFolderTree';
import type { TreeNodeData, TreePlugin, TreePluginHost } from '../types';
import { isAjaxConfig, sendAjax } from '../ajax';

/**
 * Massload plugin, as jstree's. `massload(ids, callback)` — called with the
 * tree as `this` — fetches the children of several nodes in one call,
 * answering with a map of id to children (JSON, or an HTML string). The tree
 * asks it whenever it loads several nodes together — load_node with an array,
 * refresh_node, load_all — and each node then loads from the answer, or
 * through core.data when the answer leaves it out. A single load_node goes
 * straight to core.data, as in jstree.
 */
export class MassloadPlugin implements TreePlugin {
  readonly name = 'massload';
  private tree!: TreePluginHost;
  private answers = new Map<string, TreeNodeData[] | string>();

  init(tree: TreePluginHost): void {
    this.tree = tree;
  }

  destroy(): void {
    this.answers.clear();
  }

  /**
   * Fetch `ids` in one call — through the massload function, or its ajax
   * config (`url` / `data` may be functions of the ids) — then `proceed`; at
   * once without massload or ids, and without answers if the request fails.
   */
  prefetch(ids: string[], proceed: () => void): void {
    const massload = this.tree.config.massload;
    this.answers.clear();
    if (ids.length === 0 || !massload) {
      proceed();
      return;
    }
    const tree = this.tree as unknown as MDFolderTree;
    const store = (data: unknown): void => {
      if (data && typeof data === 'object') {
        for (const [id, children] of Object.entries(data)) {
          this.answers.set(id, children as TreeNodeData[] | string);
        }
      }
      proceed();
    };
    if (typeof massload === 'function') {
      massload.call(tree, ids, store);
      return;
    }
    if (isAjaxConfig(massload)) {
      const url = typeof massload.url === 'function' ? massload.url.call(tree, ids) : massload.url;
      const data =
        typeof massload.data === 'function'
          ? (massload.data as (this: MDFolderTree, ids: string[]) => unknown).call(tree, ids)
          : massload.data;
      sendAjax(massload, url, data, { success: store, fail: () => proceed() });
      return;
    }
    proceed();
  }

  /** The prefetched children of `id`, handed out once. */
  take(id: string): TreeNodeData[] | string | undefined {
    const answer = this.answers.get(id);
    this.answers.delete(id);
    return answer;
  }
}
