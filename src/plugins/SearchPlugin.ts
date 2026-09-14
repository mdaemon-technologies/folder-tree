import type { MDFolderTree } from '../MDFolderTree';
import type { NodeRef, TreeNode, TreePlugin, TreePluginHost, SearchConfig } from '../types';
import { createMatcher } from './vakataSearch';
import { isAjaxConfig, sendAjax } from '../ajax';

/**
 * Search plugin, as jstree's.
 *
 * `search(str, skip_async, show_only_matches, inside, append,
 * show_only_matches_children)` matches the descendants of `inside` (or of the
 * root) that have text and are not hidden — with `search_leaves_only`, only
 * loaded childless ones — through `search_callback`, called with the tree as
 * `this`, or jstree's matcher (`fuzzy` for approximate matching). Every
 * match's ancestors are opened, and `clear_search` closes the ones it opened
 * unless `close_opened_onclear` is false. With `show_only_matches`
 * everything else is hidden, and with `show_only_matches_children` the
 * matches' descendants stay shown. `search.ajax` may name nodes to load
 * before searching. `search` and `clear_search` are emitted with jstree's
 * payloads.
 *
 * Matches are held on the plugin and re-applied through `onNodeRender`, so a
 * full render cannot erase the highlighting.
 */
export class SearchPlugin implements TreePlugin {
  name = 'search';
  private tree!: TreePluginHost;
  private api!: MDFolderTree;
  private config: SearchConfig = {};

  // The current search, as jstree keeps it in `_data.search`.
  private str = '';
  private res: string[] = [];
  private matched = new Set<string>();
  private opened: string[] = [];
  private som = false;
  private smc = false;
  private hidden: string[] = [];
  private request: AbortController | null = null;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.api = tree as unknown as MDFolderTree;
    this.config = tree.config.search ?? {};
  }

  destroy(): void {
    this.request?.abort();
    this.request = null;
    this.str = '';
    this.res = [];
    this.matched.clear();
    this.opened = [];
    this.hidden = [];
  }

  onNodeRender(node: TreeNode, element: HTMLElement): void {
    if (!this.matched.has(node.id)) return;
    const anchor = element.querySelector(':scope > .md-tree-anchor');
    if (anchor) anchor.classList.add('md-tree-search');
  }

  /** jstree's `search`; returns the ids this call matched. */
  search(
    str: string | false,
    skipAsync = false,
    showOnlyMatches?: boolean,
    inside?: NodeRef | null,
    append = false,
    showOnlyMatchesChildren?: boolean,
  ): string[] {
    if (str === false || String(str).trim() === '') {
      this.clearSearch();
      return [];
    }
    const query = String(str);
    const insideNode = inside === undefined || inside === null ? false : this.api.get_node(inside);
    const insideId = insideNode && (insideNode as TreeNode).id !== '#' ? (insideNode as TreeNode).id : null;
    const s = this.config;

    if (this.res.length && !append) this.clearSearch();
    const som = showOnlyMatches ?? s.show_only_matches ?? false;
    const smc = showOnlyMatchesChildren ?? s.show_only_matches_children ?? false;

    if (!skipAsync && s.ajax) {
      // search.ajax names the nodes to load; once they have, search again.
      const proceed = (answer: unknown): void => {
        const payload = answer && (answer as { d?: unknown }).d ? (answer as { d: unknown }).d : answer;
        const ids = Array.isArray(payload) ? [...new Set(payload.map(String))] : [];
        this.api.load_node(ids, () => {
          this.search(query, true, som, inside, append, smc);
        });
      };
      if (typeof s.ajax === 'function') {
        s.ajax.call(this.api, query, proceed, insideId);
        return [];
      }
      if (isAjaxConfig(s.ajax)) {
        // As jstree: the string (and `inside`) join the config's data, and a
        // new search abandons the previous request.
        const config = s.ajax;
        const base = config.data && typeof config.data === 'object' ? (config.data as Record<string, unknown>) : {};
        const data = { ...base, str: query, ...(insideId ? { inside: insideId } : {}) };
        const url = typeof config.url === 'function' ? config.url.call(this.api, query) : config.url;
        this.request?.abort();
        this.request = new AbortController();
        sendAjax(config, url, data, {
          success: proceed,
          fail: () =>
            this.api.reportError({
              error: 'ajax',
              plugin: 'search',
              id: 'search_01',
              reason: 'Could not load search parents',
              data: JSON.stringify({ ...config, data }),
            }),
        }, this.request.signal);
        return [];
      }
    }

    if (!append) {
      this.str = query;
      this.res = [];
      this.opened = [];
      this.som = som;
      this.smc = smc;
    }

    const matches = createMatcher(query, { caseSensitive: s.case_sensitive, fuzzy: s.fuzzy });
    const found: string[] = [];
    const parents = new Set<string>();
    for (const id of this.candidates(insideId)) {
      const node = this.tree.getNode(id);
      if (!node || !node.text || node.state.hidden) continue;
      if (s.search_leaves_only && !(node.state.loaded && node.children.length === 0)) continue;
      const hit = s.search_callback ? s.search_callback.call(this.api, query, node) : matches(node.text);
      if (!hit) continue;
      found.push(id);
      for (const parent of node.parents) parents.add(parent);
    }

    if (found.length) {
      // Reveal every match, remembering which nodes this search opened.
      for (const id of parents) {
        const parent = id === '#' ? null : this.tree.getNode(id);
        if (!parent || parent.state.opened) continue;
        this.tree.openNode(id, false, 0);
        if (parent.state.opened) this.opened.push(id);
      }
      this.res = append ? [...new Set([...this.res, ...found])] : found;
    }
    this.matched = new Set(this.res);
    this.tree.redraw();

    this.tree.emit('search.MDFolderTree', {
      nodes: this.elements(this.res),
      str: query,
      res: this.res,
      show_only_matches: som,
    });
    if (this.som && this.res.length) this.showOnlyMatches();
    return found;
  }

  /** jstree's `clear_search`. */
  clearSearch(): void {
    if (this.config.close_opened_onclear !== false) {
      for (const id of this.opened) this.tree.closeNode(id, false, 0);
    }
    this.tree.emit('clear_search.MDFolderTree', {
      nodes: this.elements(this.res),
      str: this.str,
      res: this.res,
    });
    if (this.som && this.res.length) this.api.show_node(this.hidden);
    this.str = '';
    this.res = [];
    this.matched.clear();
    this.opened = [];
    this.hidden = [];
    this.tree.redraw();
  }

  /** The descendants of `insideId`, or of the root, in tree order. */
  private candidates(insideId: string | null): string[] {
    if (insideId) return this.tree.getNode(insideId)?.children_d ?? [];
    const ids: string[] = [];
    for (const root of this.tree.getRootNodeIds()) {
      ids.push(root, ...(this.tree.getNode(root)?.children_d ?? []));
    }
    return ids;
  }

  /**
   * jstree's show_only_matches: hide everything, then show the visible
   * matches, their ancestors and — with show_only_matches_children — their
   * visible descendants.
   */
  private showOnlyMatches(): void {
    const keep = new Set<string>();
    for (const id of this.res) {
      const node = this.tree.getNode(id);
      if (!node || node.state.hidden) continue;
      keep.add(id);
      for (const parent of node.parents) keep.add(parent);
      if (this.smc) {
        for (const child of node.children_d) {
          if (!this.tree.getNode(child)?.state.hidden) keep.add(child);
        }
      }
    }
    keep.delete('#');
    this.hidden = this.tree.getAllNodes().filter((n) => !n.state.hidden).map((n) => n.id);
    this.api.hide_all();
    this.api.show_node([...keep]);
    this.tree.redraw();
  }

  private elements(ids: string[]): Element[] {
    const container = this.tree.getContainer();
    return ids
      .map((id) => container.querySelector(`#${CSS.escape(id)}`))
      .filter((el): el is Element => el !== null);
  }
}
