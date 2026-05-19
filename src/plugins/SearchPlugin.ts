import type { TreePlugin, TreePluginHost, SearchConfig } from '../types';

/**
 * Text search / filter plugin. Hides non-matching nodes and shows
 * matching branches. Adds `.md-tree-search` class to matches.
 */
export class SearchPlugin implements TreePlugin {
  name = 'search';
  private tree!: TreePluginHost;
  private config: SearchConfig = {};
  private openedBySearch: Set<string> = new Set();

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.config = tree.config.search ?? {};
  }

  destroy(): void {
    this.openedBySearch.clear();
  }

  search(query: string): string[] {
    const matchingIds: string[] = [];
    if (!query) {
      this.clearSearch();
      return matchingIds;
    }

    const container = this.tree.getContainer();
    const caseSensitive = this.config.case_sensitive ?? false;
    const compareQuery = caseSensitive ? query : query.toLowerCase();
    const showOnlyMatches = this.config.show_only_matches ?? false;

    // Find matching nodes
    const allNodes = container.querySelectorAll('.md-tree-node');
    for (const el of Array.from(allNodes)) {
      const anchor = el.querySelector(':scope > .md-tree-anchor');
      if (!anchor) continue;

      // Skip non-leaf nodes if search_leaves_only
      if (this.config.search_leaves_only) {
        const node = this.tree.getNode(el.id);
        if (node && node.children.length > 0) {
          anchor.classList.remove('md-tree-search');
          continue;
        }
      }

      const text = anchor.textContent ?? '';
      const compareText = caseSensitive ? text : text.toLowerCase();
      const isMatch = this.config.search_callback
        ? this.config.search_callback(query, this.tree.getNode(el.id)!)
        : compareText.includes(compareQuery);

      if (isMatch) {
        matchingIds.push(el.id);
        anchor.classList.add('md-tree-search');

        // Ensure parent nodes are visible
        if (showOnlyMatches) {
          (el as HTMLElement).style.display = '';
          this.showParents(el as HTMLElement);
        }
      } else {
        anchor.classList.remove('md-tree-search');
        if (showOnlyMatches) {
          (el as HTMLElement).style.display = 'none';
        }
      }
    }

    return matchingIds;
  }

  clearSearch(): void {
    const container = this.tree.getContainer();

    // Remove search highlighting
    const searched = container.querySelectorAll('.md-tree-search');
    for (const el of Array.from(searched)) {
      el.classList.remove('md-tree-search');
    }

    // Restore visibility
    const hidden = container.querySelectorAll('.md-tree-node[style*="display: none"]');
    for (const el of Array.from(hidden)) {
      (el as HTMLElement).style.display = '';
    }

    this.openedBySearch.clear();
  }

  private showParents(el: HTMLElement): void {
    let parent = el.parentElement?.closest('.md-tree-node') as HTMLElement | null;
    while (parent) {
      parent.style.display = '';
      if (!parent.classList.contains('md-tree-open')) {
        parent.classList.remove('md-tree-closed');
        parent.classList.add('md-tree-open');
        this.openedBySearch.add(parent.id);
      }
      parent = parent.parentElement?.closest('.md-tree-node') as HTMLElement | null;
    }
  }
}
