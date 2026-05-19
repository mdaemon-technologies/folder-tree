import type { TreePlugin, TreePluginHost } from '../types';

/**
 * ChangedPlugin - adds `changed.selected` and `changed.deselected` diff arrays
 * to the `changed.MDFolderTree` event data, matching jstree's "changed" plugin behavior.
 *
 * The core already emits `changed.MDFolderTree` with `selected` and `old_selection`.
 * This plugin is a no-op since the core now computes the diff inline.
 * It exists purely for API compatibility (consumers can include "changed" in plugins array).
 */
export class ChangedPlugin implements TreePlugin {
  readonly name = 'changed';
  init(_tree: TreePluginHost): void {
    // No-op: diff computation is handled in core's emitChanged
  }

  destroy(): void {
    // No-op: diff computation is handled in core's emitChanged
  }
}
