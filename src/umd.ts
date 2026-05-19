/**
 * UMD entry point — bundles core + mdTree bridge for drop-in replacement
 * of jstree.js in script tags.
 */
export { MDFolderTree } from './MDFolderTree';
export { mdTree } from './jquery-bridge';
export type {
  TreeConfig,
  TreeNode,
  TreeNodeData,
  TreePlugin,
  TreePluginHost,
  EventHandler,
} from './types';
