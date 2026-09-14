import type { MDFolderTree } from '../MDFolderTree';
import type { CheckMore, TreeNode, TreeNodeData, TreePlugin, TreePluginHost, TypeConfig, EventHandler } from '../types';

/** jstree's rule defaults: -1 everywhere, meaning "no limit". */
const UNLIMITED = { max_children: -1, max_depth: -1, valid_children: -1 } as const;

/**
 * Types plugin, as jstree's: every node gets a configured type — an unknown
 * or missing type becomes 'default', and the root is always '#' — and a node
 * still showing the theme icon takes its type's icon, as its `li_attr` and
 * `a_attr` take the type's. This happens on the `model` event, before the
 * nodes render.
 *
 * A type's `max_children`, `valid_children` and `max_depth` join `check`,
 * refusing a create, move or copy that would break them.
 *
 * Config shape:
 * ```
 * types: {
 *   "default": { icon: "md-tree-folder" },
 *   "email":   { icon: "md-tree-icon-email", max_children: 10 }
 * }
 * ```
 * As in jstree, each type inherits any property it leaves unset from
 * `default`; the root type ('#') is left out of that merge.
 */
export class TypesPlugin implements TreePlugin {
  name = 'types';
  private tree!: TreePluginHost;
  private api!: MDFolderTree;
  private typeMap: Record<string, TypeConfig> = {};
  private modelHandler!: EventHandler;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.api = tree as unknown as MDFolderTree;
    const configured = (tree.config.types ?? {}) as Record<string, TypeConfig>;
    const base = configured['default'] ?? {};
    this.typeMap = { default: { ...base } };
    for (const [name, rule] of Object.entries(configured)) {
      // jstree leaves the root type ('#') out of the merge.
      this.typeMap[name] = name === '#' ? { ...rule } : { ...base, ...rule };
    }

    // As in jstree, the root carries the '#' type, so `types: { '#': ... }`
    // governs the top level.
    this.typeRoot();
    this.modelHandler = (e) => this.applyTypes((e.detail as { nodes: string[] }).nodes);
    tree.on('model.MDFolderTree', this.modelHandler);
  }

  destroy(): void {
    this.tree.off('model.MDFolderTree', this.modelHandler);
    this.typeMap = {};
  }

  /** A type's rules, with unset properties filled from 'default'. */
  rules(type: string): TypeConfig | undefined {
    return this.typeMap[type];
  }

  /** A type's rules with jstree's `-1` defaults, as `get_rules` reports them. */
  rulesWithDefaults(type: string): TypeConfig {
    return { ...UNLIMITED, ...(this.typeMap[type] ?? {}) };
  }

  /** The icon for a type, falling back to 'default'. Kept for compatibility. */
  getIconForType(type: string): string | false {
    const typeConfig = this.typeMap[type] ?? this.typeMap['default'];
    if (!typeConfig) return 'md-tree-themeicon';
    if (typeConfig.icon === false) return false;
    return typeof typeConfig.icon === 'string' ? typeConfig.icon : 'md-tree-themeicon';
  }

  /**
   * jstree's types `check`: a create, move or copy must respect the target
   * parent's `max_children` and `valid_children`, and the depth the moved
   * subtree would reach must fit every ancestor's `max_depth`. As in jstree,
   * a move of a node already among the parent's children — a reorder — skips
   * all three, while a copy into that same parent does not.
   */
  onCheck(
    chk: string,
    node: TreeNode | TreeNodeData | null,
    parent: TreeNode | null,
    _pos: unknown,
    _more: CheckMore,
  ): true | { id: string; reason: string } {
    if (!parent || !/^(create_node|move_node|copy_node)$/.test(chk)) return true;
    const moved = node as TreeNode | null;
    if (chk === 'move_node' && moved && parent.children.includes(moved.id)) return true;

    const rules = this.rulesWithDefaults(parent.type);
    // As in jstree, the comparison is an equality, so a parent already over
    // its limit is not made a special case.
    if (rules.max_children !== -1 && rules.max_children === parent.children.length) {
      return { id: 'types_01', reason: 'max_children prevents function: ' + chk };
    }
    if (Array.isArray(rules.valid_children) && !rules.valid_children.includes(node?.type ?? 'default')) {
      return { id: 'types_02', reason: 'valid_children prevents function: ' + chk };
    }

    // The depth the subtree itself adds: 1 for a leaf or a node being created.
    let depth = 1;
    if (moved?.children_d && moved.parents) {
      let deepest = 0;
      for (const id of moved.children_d) deepest = Math.max(deepest, this.tree.getNode(id)?.parents.length ?? 0);
      depth = Math.max(deepest - moved.parents.length + 1, 1);
    }
    for (let par: TreeNode | null = parent; par; ) {
      const ancestor = this.rulesWithDefaults(par.type);
      if (ancestor.max_depth !== -1 && (ancestor.max_depth as number) < depth) {
        return { id: 'types_03', reason: 'max_depth prevents function: ' + chk };
      }
      par = par.id === '#' ? null : ((this.api.get_node(par.parent) || null) as TreeNode | null);
      depth++;
    }
    return true;
  }

  /** jstree's model handler: settle each node's type, then its icon and attributes. */
  private applyTypes(ids: string[]): void {
    for (const id of ids) {
      const node = this.tree.getNode(id);
      if (!node) continue;

      let type = 'default';
      const declared = node.original?.type;
      if (declared && this.typeMap[declared]) type = declared;
      const fromData = (node.data?.jstree as { type?: unknown } | undefined)?.type;
      if (typeof fromData === 'string' && this.typeMap[fromData]) type = fromData;
      node.type = type;

      const rule = this.typeMap[type];
      if (node.icon === true && rule?.icon !== undefined) node.icon = rule.icon;
      this.applyAttrs(node.li_attr, rule?.li_attr);
      this.applyAttrs(node.a_attr, rule?.a_attr, true);
    }
    this.typeRoot();
  }

  /**
   * jstree's attribute merge: the type never supplies an `id`, a class list is
   * prepended to the node's own, an anchor's placeholder `href` ('#') gives
   * way to the type's, and anything the node does not set is copied over.
   */
  private applyAttrs(target: Record<string, string>, source: Record<string, string> | undefined, anchor = false): void {
    if (!source) return;
    for (const [key, value] of Object.entries(source)) {
      if (key === 'id') continue;
      if (target[key] === undefined) target[key] = value;
      else if (key === 'class') target[key] = `${value} ${target[key]}`;
      else if (anchor && key === 'href' && target[key] === '#') target[key] = value;
    }
  }

  /** The root's type, which jstree sets at init and after every model event. */
  private typeRoot(): void {
    const root = this.api.get_node('#') as TreeNode | false;
    if (root) root.type = '#';
  }
}
