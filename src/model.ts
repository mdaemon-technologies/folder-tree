import type { TreeNode, TreeNodeData } from './types';

/** What `buildModel` works from. */
export interface ModelInput {
  /** The nodes to build, nested or flat (with `parent`). */
  data: TreeNodeData[];
  /** The parent the top level of `data` goes under. */
  parent: string;
  /**
   * The ids already in the tree, which the payload may neither reuse nor be
   * given: an array (as sent to a worker) or anything with `has`.
   */
  existing: string[] | { has(id: string): boolean };
  /** The tree's id counter; generated ids are `${prefix}_${counter}`. */
  counter: number;
  prefix: string;
  /** Supplies ids in place of the counter (main thread only: not sent to a worker). */
  mint?: () => string;
}

/** What `buildModel` produces, for the tree to apply. */
export interface ModelOutput {
  /** The new nodes, in the order they were made, their `children` still empty. */
  nodes: TreeNode[];
  /** `[parent, child]` attachments, in order. */
  links: Array<[string, string]>;
  /** Nodes whose data selects them, in order. */
  selected: string[];
  /** Duplicate ids and missing parents met, in order, for `core.error`. */
  errors: Array<Record<string, unknown>>;
  /** The id counter after generating ids. */
  counter: number;
  /** The payload's top level as normalized. */
  normalized: TreeNodeData[];
}

/**
 * Build model nodes from JSON — the work jstree hands to a Web Worker
 * (`core.worker`). It normalizes the payload (reserving the ids it names,
 * generating the rest, letting `li_attr.id` stand in for a missing id, and
 * passing `state` through), materializes each node (jstree's state layering,
 * icon and attribute defaults), and links them, rejecting duplicate ids and
 * rescuing a node whose parent is missing to the root.
 *
 * It must stay self-contained — no imports, no outer references — because
 * the worker runs its source text; the main thread runs the same function.
 */
export function buildModel(input: ModelInput): ModelOutput {
  const existing = Array.isArray(input.existing) ? new Set(input.existing) : input.existing;
  const nodes: TreeNode[] = [];
  const links: Array<[string, string]> = [];
  const selected: string[] = [];
  const errors: Array<Record<string, unknown>> = [];
  const made = new Map<string, TreeNode>();
  let counter = input.counter;

  // Ids named in the payload are reserved up front: they are not in the tree
  // yet, so generated ids could otherwise collide with them.
  const taken = new Set<string>();
  const reserve = (list: TreeNodeData[]): void => {
    for (const raw of list) {
      const id = raw.id || raw.li_attr?.id;
      if (id) taken.add(id);
      if (Array.isArray(raw.children)) reserve(raw.children);
    }
  };
  const nextId = (): string => {
    let candidate: string;
    do {
      candidate = input.mint ? input.mint() : `${input.prefix}_${++counter}`;
    } while (taken.has(candidate) || (!input.mint && existing.has(candidate)));
    taken.add(candidate);
    return candidate;
  };

  const normalize = (raw: TreeNodeData): TreeNodeData => {
    const node: TreeNodeData = {
      // As in jstree, li_attr.id stands in for a missing id.
      id: raw.id || raw.li_attr?.id || nextId(),
      text: raw.text ?? '',
      icon: raw.icon,
      type: raw.type ?? 'default',
      // Passed through as given: materializing layers the defaults,
      // data.jstree and this state in jstree's order.
      state: raw.state ? { ...raw.state } : {},
      li_attr: raw.li_attr ?? {},
      a_attr: raw.a_attr ?? {},
    };
    node.children = Array.isArray(raw.children) ? raw.children.map(normalize) : raw.children ?? false;
    // Preserve extra properties
    for (const key of Object.keys(raw)) {
      if (!(key in node)) node[key] = raw[key];
    }
    return node;
  };

  const materialize = (raw: TreeNodeData, parentId: string): TreeNode => {
    // jstree layers a node's state: the defaults, then data.jstree, then the
    // node's own `state`; a lazy node (`children: true`) is never loaded.
    const data = raw.data || null;
    const overrides = data?.jstree && typeof data.jstree === 'object' ? (data.jstree as Record<string, unknown>) : {};
    const dataIcon = overrides.icon;
    const dataState: Record<string, unknown> = { ...overrides };
    delete dataState.icon;
    const state = {
      opened: false,
      selected: false,
      disabled: false,
      loaded: true,
      loading: false,
      checked: false,
      ...dataState,
      ...raw.state,
    } as TreeNode['state'];
    if (raw.children === true) state.loaded = false;

    return {
      id: raw.id,
      text: raw.text ?? '',
      // As in jstree, an unset, null or empty icon means the theme icon, and
      // an icon in data.jstree wins.
      icon: dataIcon
        ? (dataIcon as string | boolean)
        : raw.icon === undefined || raw.icon === null || raw.icon === ''
          ? true
          : raw.icon,
      type: raw.type ?? 'default',
      parent: parentId,
      parents: [],
      children: [],
      children_d: [],
      state,
      // As in jstree, li_attr.id defaults to the node id, a_attr.href to '#',
      // and the anchor id to <node id>_anchor.
      li_attr: { ...raw.li_attr, id: raw.li_attr?.id || raw.id },
      a_attr: { href: '#', ...raw.a_attr, id: raw.a_attr?.id || `${raw.id}_anchor` },
      data,
      original: raw,
    };
  };

  const known = (id: string): boolean => made.has(id) || existing.has(id);

  // Each level in two passes: make every node first, so a flat payload's
  // forward `parent` references resolve, then link them and descend.
  const build = (list: TreeNodeData[], parentId: string): void => {
    const accepted: TreeNodeData[] = [];
    for (const raw of list) {
      if (known(raw.id)) {
        errors.push({ error: 'duplicate_id', operation: 'load', id: raw.id, parent: parentId });
        continue;
      }
      const node = materialize(raw, (raw.parent as string) ?? parentId);
      made.set(node.id, node);
      nodes.push(node);
      accepted.push(raw);
    }
    for (const raw of accepted) {
      const node = made.get(raw.id)!;
      // A parent named but never supplied would leave the node attached to
      // nothing and silently unrenderable; rescue it to the root instead.
      if (node.parent !== '#' && !known(node.parent)) {
        errors.push({ error: 'missing_parent', operation: 'load', id: node.id, parent: node.parent });
        node.parent = '#';
      }
      links.push([node.parent, node.id]);
      if (node.state.selected) selected.push(node.id);
      if (Array.isArray(raw.children)) build(raw.children, node.id);
    }
  };

  reserve(input.data);
  const normalized = input.data.map(normalize);
  build(normalized, input.parent);
  return { nodes, links, selected, errors, counter, normalized };
}
