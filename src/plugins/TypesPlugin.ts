import type { TreeNode, TreePlugin, TreePluginHost } from '../types';

/**
 * Maps `node.type` to a CSS icon class using the `types` config.
 *
 * Config shape:
 * ```
 * types: {
 *   "default": { icon: "md-tree-icon-folder" },
 *   "email":   { icon: "md-tree-icon-email" }
 * }
 * ```
 */
export class TypesPlugin implements TreePlugin {
  name = 'types';
  private typeMap: Record<string, { icon?: string | false }> = {};

  init(tree: TreePluginHost): void {
    this.typeMap = (tree.config.types ?? {}) as Record<string, { icon?: string | false }>;
  }

  destroy(): void {
    this.typeMap = {};
  }

  getIconForType(type: string): string | false {
    const typeConfig = this.typeMap[type] ?? this.typeMap['default'];
    if (!typeConfig) return 'md-tree-themeicon';
    if (typeConfig.icon === false) return false;
    return typeConfig.icon ?? 'md-tree-themeicon';
  }

  onNodeRender(node: TreeNode, element: HTMLElement): void {
    const icon = this.getIconForType(node.type);
    const iconEl = element.querySelector('.md-tree-themeicon') as HTMLElement | null;
    if (!iconEl) return;

    if (icon === false) {
      iconEl.classList.add('md-tree-themeicon-hidden');
    } else {
      iconEl.className = `md-tree-icon md-tree-themeicon ${icon} md-tree-themeicon-custom`;
    }
  }
}
