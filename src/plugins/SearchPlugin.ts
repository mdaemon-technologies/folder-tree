import type { TreeNode, TreePlugin, TreePluginHost, SearchConfig } from '../types';

/**
 * Text search / filter plugin. Matches are highlighted with `.md-tree-search`
 * and, with `show_only_matches`, non-matching branches are hidden.
 *
 * Matching runs against the model rather than the DOM, and results are held on
 * the plugin and re-applied through `onNodeRender`. Keeping them as DOM state
 * alone meant any full render — which clears `innerHTML` — erased the search.
 */
export class SearchPlugin implements TreePlugin {
  name = 'search';
  private tree!: TreePluginHost;
  private config: SearchConfig = {};
  private matches: Set<string> = new Set();
  private hiddenBySearch: Set<string> = new Set();
  private openedBySearch: Set<string> = new Set();

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.config = tree.config.search ?? {};
  }

  destroy(): void {
    this.matches.clear();
    this.hiddenBySearch.clear();
    this.openedBySearch.clear();
  }

  onNodeRender(node: TreeNode, element: HTMLElement): void {
    if (!this.matches.has(node.id)) return;
    const anchor = element.querySelector(':scope > .md-tree-anchor');
    if (anchor) anchor.classList.add('md-tree-search');
  }

  search(query: string): string[] {
    if (!query) {
      this.clearSearch();
      return [];
    }

    this.restoreVisibility();
    this.matches.clear();

    const caseSensitive = this.config.case_sensitive ?? false;
    const compareQuery = caseSensitive ? query : query.toLowerCase();
    const matchingIds: string[] = [];

    for (const node of this.tree.getAllNodes()) {
      if (this.config.search_leaves_only && node.children.length > 0) continue;

      const text = caseSensitive ? node.text : node.text.toLowerCase();
      const isMatch = this.config.search_callback
        ? this.config.search_callback(query, node)
        : text.includes(compareQuery);

      if (isMatch) {
        matchingIds.push(node.id);
        this.matches.add(node.id);
      }
    }

    if (this.config.show_only_matches ?? false) {
      this.hideNonMatches();
    }

    this.tree.redraw();
    return matchingIds;
  }

  clearSearch(): void {
    this.matches.clear();
    this.restoreVisibility();
    this.tree.redraw();
  }

  /** Hide everything that is neither a match nor an ancestor of one. */
  private hideNonMatches(): void {
    const keep = new Set<string>();
    for (const id of this.matches) {
      keep.add(id);
      const node = this.tree.getNode(id);
      if (!node) continue;
      for (const ancestorId of node.parents) {
        if (ancestorId !== '#') keep.add(ancestorId);
      }
    }

    for (const node of this.tree.getAllNodes()) {
      if (!keep.has(node.id)) {
        node.state.hidden = true;
        this.hiddenBySearch.add(node.id);
        continue;
      }
      // Reveal the path down to each match. Set directly rather than calling
      // openNode, which would trigger lazy loading as a side effect.
      if (node.children.length > 0 && !node.state.opened) {
        node.state.opened = true;
        this.openedBySearch.add(node.id);
      }
    }
  }

  private restoreVisibility(): void {
    for (const id of this.hiddenBySearch) {
      const node = this.tree.getNode(id);
      if (node) node.state.hidden = false;
    }
    this.hiddenBySearch.clear();

    if (this.config.close_opened_onclear) {
      for (const id of this.openedBySearch) {
        const node = this.tree.getNode(id);
        if (node) node.state.opened = false;
      }
    }
    this.openedBySearch.clear();
  }
}
