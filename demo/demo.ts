import { MDFolderTree } from '../src/index';
import type { TreeConfig, TreeNodeData } from '../src/types';
import '../src/styles.css';

// ============================================================
// Sample data
// ============================================================

const jsonData: TreeNodeData[] = [
  {
    id: 'root-inbox',
    text: 'Inbox',
    type: 'email',
    state: { opened: true },
    children: [
      { id: 'inbox-important', text: 'Important', type: 'email' },
      { id: 'inbox-social', text: 'Social', type: 'email' },
      {
        id: 'inbox-promotions',
        text: 'Promotions',
        type: 'email',
        children: [
          { id: 'promo-deals', text: 'Deals', type: 'documents' },
          { id: 'promo-newsletters', text: 'Newsletters', type: 'documents' },
        ],
      },
    ],
  },
  {
    id: 'root-sent',
    text: 'Sent',
    type: 'email',
  },
  {
    id: 'root-drafts',
    text: 'Drafts',
    type: 'documents',
    children: [
      { id: 'draft-1', text: 'Project proposal.docx', type: 'documents' },
      { id: 'draft-2', text: 'Meeting notes.md', type: 'notes' },
    ],
  },
  {
    id: 'root-calendar',
    text: 'Calendar',
    type: 'calendar',
    children: [
      { id: 'cal-personal', text: 'Personal', type: 'calendar' },
      { id: 'cal-work', text: 'Work', type: 'calendar' },
      { id: 'cal-holidays', text: 'Holidays', type: 'calendar' },
    ],
  },
  {
    id: 'root-contacts',
    text: 'Contacts',
    type: 'contacts',
    children: [
      { id: 'contacts-family', text: 'Family', type: 'contacts' },
      { id: 'contacts-friends', text: 'Friends', type: 'contacts' },
      { id: 'contacts-work', text: 'Colleagues', type: 'contacts' },
    ],
  },
  {
    id: 'root-tasks',
    text: 'Tasks',
    type: 'tasks',
    children: [
      { id: 'tasks-today', text: 'Today', type: 'tasks' },
      { id: 'tasks-week', text: 'This week', type: 'tasks' },
      { id: 'tasks-overdue', text: 'Overdue', type: 'tasks', state: { disabled: true } },
    ],
  },
  {
    id: 'root-journal',
    text: 'Journal',
    type: 'journal',
  },
  {
    id: 'root-trash',
    text: 'Trash',
    type: 'folder',
  },
];

// Simulated lazy-load data
const lazyChildren: Record<string, TreeNodeData[]> = {
  '#': [
    { id: 'lazy-c-drive', text: 'C:\\', type: 'drive', children: true as unknown as TreeNodeData[] },
    { id: 'lazy-d-drive', text: 'D:\\', type: 'drive', children: true as unknown as TreeNodeData[] },
  ],
  'lazy-c-drive': [
    { id: 'lazy-c-windows', text: 'Windows', type: 'folder', children: true as unknown as TreeNodeData[] },
    { id: 'lazy-c-users', text: 'Users', type: 'folder', children: true as unknown as TreeNodeData[] },
    { id: 'lazy-c-program', text: 'Program Files', type: 'folder' },
  ],
  'lazy-d-drive': [
    { id: 'lazy-d-data', text: 'Data', type: 'folder' },
    { id: 'lazy-d-backup', text: 'Backup', type: 'folder' },
  ],
  'lazy-c-windows': [
    { id: 'lazy-c-win-system32', text: 'System32', type: 'folder' },
    { id: 'lazy-c-win-temp', text: 'Temp', type: 'folder' },
  ],
  'lazy-c-users': [
    { id: 'lazy-c-users-admin', text: 'Administrator', type: 'user' },
    { id: 'lazy-c-users-default', text: 'Default', type: 'user' },
  ],
};

// ============================================================
// DOM references
// ============================================================

const treeTarget = document.getElementById('tree-target')!;
const eventLog = document.getElementById('event-log')!;
const stateSelected = document.getElementById('state-selected')!;
const stateOpen = document.getElementById('state-open')!;

// Controls
const optTypes = document.getElementById('opt-types') as HTMLInputElement;
const optCheckbox = document.getElementById('opt-checkbox') as HTMLInputElement;
const optSearch = document.getElementById('opt-search') as HTMLInputElement;
const optChanged = document.getElementById('opt-changed') as HTMLInputElement;
const optConditionalselect = document.getElementById('opt-conditionalselect') as HTMLInputElement;
const optWholerow = document.getElementById('opt-wholerow') as HTMLInputElement;
const optSort = document.getElementById('opt-sort') as HTMLInputElement;
const optUnique = document.getElementById('opt-unique') as HTMLInputElement;
const optState = document.getElementById('opt-state') as HTMLInputElement;
const optContextmenu = document.getElementById('opt-contextmenu') as HTMLInputElement;
const optDnd = document.getElementById('opt-dnd') as HTMLInputElement;
const optMultiple = document.getElementById('opt-multiple') as HTMLInputElement;
const optDblclickToggle = document.getElementById('opt-dblclick-toggle') as HTMLInputElement;
const optDots = document.getElementById('opt-dots') as HTMLInputElement;
const optIcons = document.getElementById('opt-icons') as HTMLInputElement;
const optKeepSelectedStyle = document.getElementById('opt-keep-selected-style') as HTMLInputElement;
const optThreeState = document.getElementById('opt-three-state') as HTMLInputElement;
const optShowOnlyMatches = document.getElementById('opt-show-only-matches') as HTMLInputElement;
const optCaseSensitive = document.getElementById('opt-case-sensitive') as HTMLInputElement;
const optBlockDisabledText = document.getElementById('opt-block-disabled-text') as HTMLInputElement;
const optStateKey = document.getElementById('opt-state-key') as HTMLInputElement;
const optDndCopy = document.getElementById('opt-dnd-copy') as HTMLInputElement;
const optDndOpenTimeout = document.getElementById('opt-dnd-open-timeout') as HTMLInputElement;
const inputSearch = document.getElementById('input-search') as HTMLInputElement;
const searchBar = document.querySelector('.search-bar') as HTMLElement;

let tree: MDFolderTree | null = null;

// ============================================================
// Build config from controls
// ============================================================

function getConfig(): TreeConfig {
  const plugins: string[] = [];
  if (optTypes.checked) plugins.push('types');
  if (optCheckbox.checked) plugins.push('checkbox');
  if (optSearch.checked) plugins.push('search');
  if (optChanged.checked) plugins.push('changed');
  if (optConditionalselect.checked) plugins.push('conditionalselect');
  if (optWholerow.checked) plugins.push('wholerow');
  if (optSort.checked) plugins.push('sort');
  if (optUnique.checked) plugins.push('unique');
  if (optState.checked) plugins.push('state');
  if (optContextmenu.checked) plugins.push('contextmenu');
  if (optDnd.checked) plugins.push('dnd');

  const dataSource = (document.querySelector('input[name="data-source"]:checked') as HTMLInputElement)?.value ?? 'json';

  let data: TreeConfig['core'] extends { data?: infer D } ? D : never;
  if (dataSource === 'json') {
    data = jsonData;
  } else if (dataSource === 'callback') {
    data = (node: any, callback: (d: TreeNodeData[]) => void) => {
      const id = node.id;
      // Simulate async
      setTimeout(() => {
        callback(lazyChildren[id] ?? []);
      }, 300);
    };
  } else {
    data = false;
  }

  // Sort comparator based on radio selection
  const sortMode = (document.querySelector('input[name="sort-mode"]:checked') as HTMLInputElement)?.value ?? 'alpha';
  const sortFn = sortMode === 'reverse'
    ? (a: any, b: any) => b.text.localeCompare(a.text, undefined, { sensitivity: 'base' })
    : (a: any, b: any) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });

  // Conditionalselect callback
  const conditionalFn = optBlockDisabledText.checked
    ? (node: any) => !node.text.includes('Overdue')
    : undefined;

  return {
    core: {
      data: data as any,
      multiple: optMultiple.checked,
      dblclick_toggle: optDblclickToggle.checked,
      check_callback: true,
      themes: {
        dots: optDots.checked,
        icons: optIcons.checked,
      },
    },
    types: {
      default: { icon: 'md-tree-icon-documents' },
      email: { icon: 'md-tree-icon-email' },
      calendar: { icon: 'md-tree-icon-calendar' },
      contacts: { icon: 'md-tree-icon-contacts' },
      journal: { icon: 'md-tree-icon-journal' },
      tasks: { icon: 'md-tree-icon-tasks' },
      notes: { icon: 'md-tree-icon-notes' },
      documents: { icon: 'md-tree-icon-documents' },
      folder: { icon: 'md-tree-icon-hidden' },
      drive: { icon: 'md-tree-icon-drive' },
      user: { icon: 'md-tree-icon-user' },
    },
    checkbox: {
      keep_selected_style: optKeepSelectedStyle.checked,
      three_state: optThreeState.checked,
    },
    search: {
      show_only_matches: optShowOnlyMatches.checked,
      case_sensitive: optCaseSensitive.checked,
    },
    sort: sortFn,
    conditionalselect: conditionalFn,
    unique: {
      case_sensitive: false,
      trim_whitespace: true,
    },
    state: {
      key: optStateKey.value || 'demo-tree-state',
      events: 'changed.MDFolderTree open_node.MDFolderTree close_node.MDFolderTree',
    },
    contextmenu: {
      select_node: true,
      show_at_node: false,
    },
    dnd: {
      copy: optDndCopy.checked,
      open_timeout: parseInt(optDndOpenTimeout.value, 10) || 500,
    },
    plugins,
  };
}

// ============================================================
// Tree lifecycle
// ============================================================

function buildTree(): void {
  // Destroy existing
  if (tree) {
    tree.destroy();
    tree = null;
  }

  const dataSource = (document.querySelector('input[name="data-source"]:checked') as HTMLInputElement)?.value ?? 'json';

  // If HTML source, clone the hidden HTML into the target
  if (dataSource === 'html') {
    const source = document.getElementById('html-source')!;
    treeTarget.innerHTML = source.innerHTML;
  } else {
    treeTarget.innerHTML = '';
  }

  const config = getConfig();
  tree = new MDFolderTree(treeTarget, config);

  // Show/hide search bar based on search plugin
  searchBar.style.display = optSearch.checked ? '' : 'none';

  // Bind event listeners
  bindTreeEvents();
  updateState();
  logEvent('system', 'Tree created', config.plugins?.join(', ') ?? 'no plugins');
}

function bindTreeEvents(): void {
  const events = [
    'select_node.MDFolderTree',
    'deselect_node.MDFolderTree',
    'changed.MDFolderTree',
    'open_node.MDFolderTree',
    'close_node.MDFolderTree',
    'ready.MDFolderTree',
    'dblclick.MDFolderTree',
    'move_node.MDFolderTree',
    'copy_node.MDFolderTree',
    'delete_node.MDFolderTree',
    'create_node.MDFolderTree',
    'rename_node.MDFolderTree',
    'show_contextmenu.MDFolderTree',
    'dnd_start.MDFolderTree',
    'dnd_stop.MDFolderTree',
    'state_ready.MDFolderTree',
    'cut.MDFolderTree',
    'copy.MDFolderTree',
    'paste.MDFolderTree',
    'edit.MDFolderTree',
    'refresh.MDFolderTree',
    'load_node.MDFolderTree',
    'hide_node.MDFolderTree',
    'show_node.MDFolderTree',
  ];

  for (const evt of events) {
    treeTarget.addEventListener(evt, ((e: CustomEvent) => {
      const shortName = evt.replace('.MDFolderTree', '');
      const detail = e.detail;
      let info = '';

      if (detail?.node) {
        info = `node: "${detail.node.text}" (${detail.node.id})`;
      }
      if (detail?.selected) {
        info += ` | selected: [${detail.selected.join(', ')}]`;
      }
      if (detail?.action) {
        info += ` | action: ${detail.action}`;
      }
      if (detail?.changed) {
        if (detail.changed.selected?.length) info += ` | +[${detail.changed.selected.join(', ')}]`;
        if (detail.changed.deselected?.length) info += ` | -[${detail.changed.deselected.join(', ')}]`;
      }
      if (detail?.parent) {
        info += ` | parent: ${detail.parent}`;
      }
      if (detail?.is_copy !== undefined) {
        info += ` | copy: ${detail.is_copy}`;
      }
      if (detail?.position !== undefined && typeof detail.position === 'string') {
        info += ` | pos: ${detail.position}`;
      }

      logEvent(shortName, info);
      updateState();
    }) as EventListener);
  }
}

// ============================================================
// Event log
// ============================================================

let logCount = 0;

function logEvent(type: string, message: string, extra?: string): void {
  logCount++;
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;

  const num = document.createElement('span');
  num.className = 'log-num';
  num.textContent = `#${logCount}`;

  const badge = document.createElement('span');
  badge.className = 'log-badge';
  badge.textContent = type;

  const msg = document.createElement('span');
  msg.className = 'log-message';
  msg.textContent = message + (extra ? ` (${extra})` : '');

  entry.appendChild(num);
  entry.appendChild(badge);
  entry.appendChild(msg);

  eventLog.insertBefore(entry, eventLog.firstChild);

  // Limit log entries
  while (eventLog.children.length > 100) {
    eventLog.removeChild(eventLog.lastChild!);
  }
}

// ============================================================
// State display
// ============================================================

function updateState(): void {
  if (!tree) {
    stateSelected.textContent = 'Tree destroyed';
    stateOpen.textContent = 'Tree destroyed';
    return;
  }

  const selected = tree.get_selected();
  stateSelected.textContent = selected.length > 0 ? selected.join(', ') : '(none)';

  // Show open nodes by checking state
  const openNodes: string[] = [];
  for (const id of getAllNodeIds()) {
    const node = tree.get_node(id);
    if (node && node.state.opened && node.children.length > 0) {
      openNodes.push(id);
    }
  }
  stateOpen.textContent = openNodes.length > 0 ? openNodes.join(', ') : '(none)';
}

function getAllNodeIds(): string[] {
  // Walk all .md-tree-node elements in the container
  const nodes = treeTarget.querySelectorAll('.md-tree-node');
  return Array.from(nodes).map((n) => n.id);
}

// ============================================================
// Button handlers
// ============================================================

document.getElementById('btn-rebuild')!.addEventListener('click', buildTree);

document.getElementById('btn-open-all')!.addEventListener('click', () => {
  if (tree) {
    tree.open_all();
    updateState();
    logEvent('action', 'open_all');
  }
});

document.getElementById('btn-close-all')!.addEventListener('click', () => {
  if (tree) {
    tree.close_all();
    updateState();
    logEvent('action', 'close_all');
  }
});

document.getElementById('btn-select-all')!.addEventListener('click', () => {
  if (tree) {
    tree.select_all(true);
    updateState();
    logEvent('action', 'select_all');
  }
});

document.getElementById('btn-deselect-all')!.addEventListener('click', () => {
  if (tree) {
    tree.deselect_all(true);
    updateState();
    logEvent('action', 'deselect_all');
  }
});

document.getElementById('btn-search')!.addEventListener('click', () => {
  if (tree) {
    const query = inputSearch.value;
    const results = tree.search(query);
    logEvent('action', `search("${query}")`, `${results.length} matches`);
  }
});

document.getElementById('btn-clear-search')!.addEventListener('click', () => {
  if (tree) {
    tree.clear_search();
    inputSearch.value = '';
    logEvent('action', 'clear_search');
  }
});

document.getElementById('btn-destroy')!.addEventListener('click', () => {
  if (tree) {
    tree.destroy();
    tree = null;
    updateState();
    logEvent('system', 'Tree destroyed');
  }
});

document.getElementById('btn-clear-log')!.addEventListener('click', () => {
  eventLog.innerHTML = '';
  logCount = 0;
});

document.getElementById('btn-create-node')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    const parentId = selected.length > 0 ? selected[0] : tree.getRootNodeIds()[0];
    const newName = prompt('New node name:', 'New Node');
    if (newName) {
      const result = tree.createNode(parentId, { id: '', text: newName });
      if (result) {
        logEvent('action', `create_node in "${parentId}"`, newName);
      }
    }
  }
});

document.getElementById('btn-rename-node')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) {
      logEvent('warn', 'No node selected to rename');
      return;
    }
    const node = tree.getNode(selected[0]);
    const newName = prompt('Rename node:', node?.text ?? '');
    if (newName && node) {
      tree.renameNode(node.id, newName);
      logEvent('action', `rename_node "${node.id}"`, newName);
    }
  }
});

document.getElementById('btn-delete-node')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) {
      logEvent('warn', 'No node selected to delete');
      return;
    }
    tree.deleteNode(selected[0]);
    logEvent('action', `delete_node "${selected[0]}"`);
    updateState();
  }
});

document.getElementById('btn-clear-state')!.addEventListener('click', () => {
  const key = optStateKey.value || 'demo-tree-state';
  localStorage.removeItem(key);
  logEvent('action', `Cleared state from localStorage ("${key}")`);
});

document.getElementById('btn-cut')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) { logEvent('warn', 'No node selected'); return; }
    tree.cut(selected[0]);
    logEvent('action', `cut "${selected[0]}"`);
  }
});

document.getElementById('btn-copy')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) { logEvent('warn', 'No node selected'); return; }
    tree.copy(selected[0]);
    logEvent('action', `copy "${selected[0]}"`);
  }
});

document.getElementById('btn-paste')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) { logEvent('warn', 'No node selected'); return; }
    tree.paste(selected[0]);
    logEvent('action', `paste into "${selected[0]}"`);
  }
});

document.getElementById('btn-edit')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) { logEvent('warn', 'No node selected'); return; }
    tree.edit(selected[0]);
    logEvent('action', `edit "${selected[0]}"`);
  }
});

document.getElementById('btn-refresh')!.addEventListener('click', () => {
  if (tree) {
    tree.refresh();
    logEvent('action', 'refresh');
  }
});

document.getElementById('btn-hide-node')!.addEventListener('click', () => {
  if (tree) {
    const selected = tree.get_selected();
    if (selected.length === 0) { logEvent('warn', 'No node selected'); return; }
    tree.hide_node(selected[0]);
    logEvent('action', `hide_node "${selected[0]}"`);
  }
});

document.getElementById('btn-show-all')!.addEventListener('click', () => {
  if (tree) {
    tree.show_all();
    logEvent('action', 'show_all');
  }
});

document.getElementById('btn-toggle-stripes')!.addEventListener('click', () => {
  if (tree) {
    tree.toggle_stripes();
    logEvent('action', 'toggle_stripes');
  }
});

document.getElementById('btn-toggle-ellipsis')!.addEventListener('click', () => {
  if (tree) {
    tree.toggle_ellipsis();
    logEvent('action', 'toggle_ellipsis');
  }
});

// Search on Enter
inputSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btn-search')!.click();
  }
});

// ============================================================
// Auto-rebuild when options change
// ============================================================

const allOptions = [
  optTypes, optCheckbox, optSearch, optChanged,
  optConditionalselect, optWholerow, optSort, optUnique,
  optState, optContextmenu, optDnd,
  optMultiple, optDblclickToggle, optDots, optIcons,
  optKeepSelectedStyle, optThreeState,
  optShowOnlyMatches, optCaseSensitive,
  optBlockDisabledText, optDndCopy,
];

for (const opt of allOptions) {
  opt.addEventListener('change', buildTree);
}

for (const radio of document.querySelectorAll('input[name="data-source"]')) {
  radio.addEventListener('change', buildTree);
}

for (const radio of document.querySelectorAll('input[name="sort-mode"]')) {
  radio.addEventListener('change', buildTree);
}

optDndOpenTimeout.addEventListener('change', buildTree);
optStateKey.addEventListener('change', buildTree);

// ============================================================
// Initial build
// ============================================================

buildTree();
