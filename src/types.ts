// ============================================================
// Core tree interfaces & types
// ============================================================

/** Raw node data as provided by the consumer (JSON or parsed from HTML). */
export interface TreeNodeData {
  id: string;
  text: string;
  icon?: string | false;
  type?: string;
  children?: TreeNodeData[] | boolean;
  state?: {
    opened?: boolean;
    selected?: boolean;
    disabled?: boolean;
    checked?: boolean;
  };
  li_attr?: Record<string, string>;
  a_attr?: Record<string, string>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Internal node representation stored in the tree's flat map. */
export interface TreeNode {
  id: string;
  text: string;
  icon: string | false;
  type: string;
  parent: string;
  parents: string[];
  children: string[];
  children_d: string[];
  state: {
    opened: boolean;
    selected: boolean;
    disabled: boolean;
    loaded: boolean;
    loading: boolean;
    checked: boolean;
    hidden?: boolean;
  };
  li_attr: Record<string, string>;
  a_attr: Record<string, string>;
  original: TreeNodeData;
}

// ============================================================
// Configuration interfaces
// ============================================================

/** Callback for lazy-loading children (md-tree-compatible signature). */
export type DataCallback = (node: TreeNode, callback: (data: TreeNodeData[]) => void) => void;

export interface CoreConfig {
  data?: TreeNodeData[] | DataCallback | false;
  multiple?: boolean;
  animation?: number;
  themes?: ThemeConfig;
  check_callback?: boolean | ((operation: string, node: TreeNode, parent: TreeNode, position: number, more: unknown) => boolean);
  expand_selected_onload?: boolean;
  force_text?: boolean;
  dblclick_toggle?: boolean;
  worker?: boolean;
  strings?: Record<string, string>;
  error?: (error: unknown) => void;
  loaded_state?: boolean;
  restore_focus?: boolean;
  allow_reselect?: boolean;
  keyboard?: Record<string, (e: KeyboardEvent) => void> | boolean;
  sanitize_attrs?: boolean;
}

export interface ThemeConfig {
  name?: string | false;
  url?: string | false;
  dots?: boolean;
  icons?: boolean;
  ellipsis?: boolean;
  stripes?: boolean;
  variant?: string | false;
  responsive?: boolean;
}

export interface TypeConfig {
  icon?: string | false;
  [key: string]: unknown;
}

export interface CheckboxConfig {
  keep_selected_style?: boolean;
  visible?: boolean;
  three_state?: boolean;
  cascade?: string;
  tie_selection?: boolean;
  whole_node?: boolean;
  cascade_to_disabled?: boolean;
  cascade_to_hidden?: boolean;
}

export interface SearchConfig {
  show_only_matches?: boolean;
  show_only_matches_children?: boolean;
  close_opened_onclear?: boolean;
  case_sensitive?: boolean;
  fuzzy?: boolean;
  search_leaves_only?: boolean;
  search_callback?: (query: string, node: TreeNode) => boolean;
}

export interface ContextMenuItem {
  label?: string;
  title?: string;
  icon?: string | false;
  action?: (data: { item: ContextMenuItem; reference: HTMLElement; element: HTMLElement; position: { x: number; y: number } }) => void;
  separator_before?: boolean;
  separator_after?: boolean;
  _disabled?: boolean | ((data: { item: ContextMenuItem; reference: HTMLElement }) => boolean);
  submenu?: Record<string, ContextMenuItem>;
  [key: string]: unknown;
}

export interface ContextMenuConfig {
  select_node?: boolean;
  show_at_node?: boolean;
  items?: Record<string, ContextMenuItem> | ((node: TreeNode, callback: (items: Record<string, ContextMenuItem>) => void) => Record<string, ContextMenuItem>);
}

export interface DndConfig {
  copy?: boolean;
  open_timeout?: number;
  is_draggable?: (nodes: TreeNode[]) => boolean;
  check_while_dragging?: boolean;
  always_copy?: boolean;
  inside_pos?: number | 'first' | 'last';
  drag_selection?: boolean;
  touch?: boolean | 'selected';
  large_drop_target?: boolean;
  large_drag_target?: boolean | string;
  use_html5?: boolean;
  blank_space_drop?: boolean;
}

export interface MassloadConfig {
  url?: string;
  data?: (nodeIds: string[]) => unknown;
  callback?: (nodeIds: string[], response: unknown) => Record<string, TreeNodeData[]>;
}

export type SortComparator = (a: TreeNode, b: TreeNode) => number;

export interface StateConfig {
  key?: string;
  events?: string;
  ttl?: number;
  filter?: (state: TreeState) => TreeState;
  preserve_loaded?: boolean;
}

export interface TreeState {
  opened: string[];
  selected: string[];
}

export interface UniqueConfig {
  case_sensitive?: boolean;
  trim_whitespace?: boolean;
  duplicate?: (name: string, counter: number) => string;
}

export type ConditionalSelectCallback = (node: TreeNode, event?: Event) => boolean;

export interface TreeConfig {
  core?: CoreConfig;
  types?: Record<string, TypeConfig>;
  checkbox?: CheckboxConfig;
  search?: SearchConfig;
  contextmenu?: ContextMenuConfig;
  dnd?: DndConfig;
  massload?: MassloadConfig;
  sort?: SortComparator;
  state?: StateConfig;
  unique?: UniqueConfig;
  conditionalselect?: ConditionalSelectCallback;
  plugins?: string[];
}

// ============================================================
// Plugin interface
// ============================================================

export interface TreePlugin {
  name: string;
  init(tree: TreePluginHost): void;
  destroy(): void;
  onNodeRender?(node: TreeNode, element: HTMLElement): void;
  onBeforeRender?(nodes: TreeNode[]): TreeNode[];
  onBeforeActivate?(node: TreeNode, event?: Event): boolean;
}

/** Subset of MDFolderTree exposed to plugins. */
export interface TreePluginHost {
  config: TreeConfig;
  getNode(id: string): TreeNode | null;
  getAllNodes(): TreeNode[];
  getNodeChildren(id: string): TreeNode[];
  getSelectedIds(): string[];
  getOpenedIds(): string[];
  selectNode(id: string, suppress?: boolean): void;
  deselectNode(id: string, suppress?: boolean): void;
  openNode(id: string, suppress?: boolean): void;
  closeNode(id: string, suppress?: boolean): void;
  getContainer(): HTMLElement;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, detail: unknown): void;
  redrawNode(id: string): void;
  redraw(): void;
  moveNode(id: string, parentId: string, position: number): boolean;
  copyNode(id: string, parentId: string, position: number): string | false;
  renameNode(id: string, text: string): boolean;
  deleteNode(id: string): boolean;
  createNode(parentId: string, data: TreeNodeData, position?: number): TreeNode | false;
  reorderChildren(parentId: string, childIds: string[]): void;
  getRootNodeIds(): string[];
}

// ============================================================
// Event types
// ============================================================

export type EventHandler = (event: CustomEvent) => void;

export interface SelectNodeDetail {
  node: TreeNode;
  selected: string[];
  event?: Event;
}

export interface DeselectNodeDetail {
  node: TreeNode;
  selected: string[];
  event?: Event;
}

export interface ChangedDetail {
  action: string;
  node: TreeNode | null;
  selected: string[];
  old_selection: string[];
  changed?: {
    selected: string[];
    deselected: string[];
  };
}

export interface OpenNodeDetail {
  node: TreeNode;
}

export interface CloseNodeDetail {
  node: TreeNode;
}

export interface ReadyDetail {
  instance: unknown;
}

export interface DblClickDetail {
  node: TreeNode;
  event: MouseEvent;
}
