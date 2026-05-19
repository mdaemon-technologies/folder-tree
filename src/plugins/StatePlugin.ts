import type { TreePlugin, TreePluginHost, StateConfig, TreeState, EventHandler } from '../types';

/**
 * StatePlugin - saves and restores tree state (opened/selected nodes) using localStorage.
 * Mirrors jstree's "state" plugin.
 *
 * Config: `state: { key, events, ttl, filter, preserve_loaded }`
 */
export class StatePlugin implements TreePlugin {
  readonly name = 'state';
  private tree!: TreePluginHost;
  private saveHandler!: EventHandler;
  private readyHandler!: EventHandler;

  init(tree: TreePluginHost): void {
    this.tree = tree;

    this.saveHandler = () => this.save_state();
    this.readyHandler = () => {
      this.restore_state();
      this.tree.emit('state_ready.MDFolderTree', {});
    };

    // Listen for ready event to restore
    tree.on('ready.MDFolderTree', this.readyHandler);

    // Listen for state-changing events to auto-save
    const events = this.getEvents();
    for (const evt of events) {
      tree.on(evt, this.saveHandler);
    }
  }

  destroy(): void {
    this.tree.off('ready.MDFolderTree', this.readyHandler);
    const events = this.getEvents();
    for (const evt of events) {
      this.tree.off(evt, this.saveHandler);
    }
  }

  save_state(): void {
    const config = this.getConfig();
    let state: TreeState = {
      opened: this.tree.getOpenedIds(),
      selected: this.tree.getSelectedIds(),
    };

    if (config.filter) {
      state = config.filter(state);
    }

    const payload = config.ttl
      ? { state, expires: Date.now() + config.ttl }
      : { state };

    try {
      localStorage.setItem(config.key, JSON.stringify(payload));
    } catch {
      // localStorage may be unavailable or full
    }
  }

  restore_state(): void {
    const config = this.getConfig();

    let raw: string | null;
    try {
      raw = localStorage.getItem(config.key);
    } catch {
      return;
    }

    if (!raw) return;

    let stored: { state: TreeState; expires?: number };
    try {
      stored = JSON.parse(raw);
    } catch {
      return;
    }

    // Check TTL
    if (stored.expires && Date.now() > stored.expires) {
      this.clear_state();
      return;
    }

    let state = stored.state;
    if (config.filter) {
      state = config.filter(state);
    }

    // Restore opened nodes
    if (state.opened) {
      for (const id of state.opened) {
        this.tree.openNode(id, true);
      }
    }

    // Restore selected nodes
    if (state.selected) {
      for (const id of state.selected) {
        this.tree.selectNode(id, true);
      }
    }
  }

  clear_state(): void {
    const config = this.getConfig();
    try {
      localStorage.removeItem(config.key);
    } catch {
      // Ignore
    }
  }

  private getConfig(): Required<Omit<StateConfig, 'filter' | 'preserve_loaded'>> & Pick<StateConfig, 'filter' | 'preserve_loaded'> {
    const cfg = this.tree.config.state ?? {};
    return {
      key: cfg.key ?? 'md-tree-state',
      events: cfg.events ?? 'changed.MDFolderTree open_node.MDFolderTree close_node.MDFolderTree',
      ttl: cfg.ttl ?? 0,
      filter: cfg.filter,
      preserve_loaded: cfg.preserve_loaded ?? false,
    };
  }

  private getEvents(): string[] {
    const config = this.getConfig();
    return config.events.split(/\s+/).filter(Boolean);
  }
}
