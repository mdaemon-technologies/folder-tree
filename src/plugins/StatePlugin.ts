import type { MDFolderTree } from '../MDFolderTree';
import type { TreePlugin, TreePluginHost, StateConfig, TreeState, LegacyTreeState, EventHandler } from '../types';

const DEFAULT_EVENTS =
  'changed.MDFolderTree open_node.MDFolderTree close_node.MDFolderTree check_node.MDFolderTree uncheck_node.MDFolderTree';

/**
 * State plugin, as jstree's. It saves `get_state()` — as
 * `{ state, ttl, sec }` under `state.key` ('jstree' by default) — 100ms after
 * any of `state.events`, and restores it through `set_state` once the tree
 * is ready, emitting `restore_state`; saving starts after that, with
 * `state_ready`. `core.loaded` is kept only with `preserve_loaded`; `filter`
 * (called with the tree as `this`) adjusts the state being restored; a state
 * older than its `ttl` is ignored. States saved by earlier releases —
 * `{ opened, selected }` with `expires` — still restore.
 */
export class StatePlugin implements TreePlugin {
  readonly name = 'state';
  private tree!: TreePluginHost;
  private api!: MDFolderTree;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saveHandler!: EventHandler;
  private readyHandler!: EventHandler;
  private restoredHandler: EventHandler | null = null;
  private saving = false;

  init(tree: TreePluginHost): void {
    this.tree = tree;
    this.api = tree as unknown as MDFolderTree;

    this.saveHandler = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.save_state();
      }, 100);
    };
    this.readyHandler = () => {
      // As jstree: start saving once the restored state has been applied.
      this.restoredHandler = () => this.startSaving();
      this.tree.on('restore_state.MDFolderTree', this.restoredHandler);
      if (!this.restore_state()) this.startSaving();
    };
    tree.on('ready.MDFolderTree', this.readyHandler);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.tree.off('ready.MDFolderTree', this.readyHandler);
    if (this.restoredHandler) this.tree.off('restore_state.MDFolderTree', this.restoredHandler);
    if (this.saving) {
      for (const evt of this.events()) this.tree.off(evt, this.saveHandler);
    }
  }

  /** jstree's `save_state`. */
  save_state(): void {
    const cfg = this.config();
    const state = this.api.get_state();
    if (!cfg.preserve_loaded && state.core) delete state.core.loaded;
    try {
      localStorage.setItem(cfg.key, JSON.stringify({ state, ttl: cfg.ttl, sec: Date.now() }));
    } catch {
      // localStorage may be unavailable or full
    }
  }

  /** jstree's `restore_state`: true when a state was found and applied. */
  restore_state(): boolean {
    const cfg = this.config();
    let raw: string | null;
    try {
      raw = localStorage.getItem(cfg.key);
    } catch {
      return false;
    }
    if (!raw) return false;

    // Storage is shared, user-writable and may predate the current shape.
    let stored: unknown;
    try {
      stored = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!stored || typeof stored !== 'object') return false;
    const saved = stored as { state?: unknown; ttl?: unknown; sec?: unknown; expires?: unknown };
    if (typeof saved.ttl === 'number' && typeof saved.sec === 'number' && Date.now() - saved.sec > saved.ttl) return false;
    if (typeof saved.expires === 'number' && Date.now() > saved.expires) return false;

    let state = (saved.state ?? saved) as TreeState | LegacyTreeState;
    if (typeof cfg.filter === 'function') state = cfg.filter.call(this.api, state as TreeState);
    if (!state || typeof state !== 'object' || !this.hasContent(state)) return false;
    const core = (state as TreeState).core;
    if (!cfg.preserve_loaded && core && typeof core === 'object') delete core.loaded;

    const restored = JSON.parse(JSON.stringify(state));
    const announce: EventHandler = () => {
      this.tree.off('set_state.MDFolderTree', announce);
      this.tree.emit('restore_state.MDFolderTree', { state: restored });
    };
    this.tree.on('set_state.MDFolderTree', announce);
    this.api.set_state(state);
    return true;
  }

  /** jstree's `clear_state`. */
  clear_state(): void {
    try {
      localStorage.removeItem(this.config().key);
    } catch {
      // Ignore
    }
  }

  private startSaving(): void {
    if (this.restoredHandler) {
      this.tree.off('restore_state.MDFolderTree', this.restoredHandler);
      this.restoredHandler = null;
    }
    if (this.saving) return;
    this.saving = true;
    for (const evt of this.events()) this.tree.on(evt, this.saveHandler);
    this.tree.emit('state_ready.MDFolderTree', {});
  }

  /** Whether a stored state has anything set_state would apply. */
  private hasContent(state: object): boolean {
    return ['core', 'opened', 'selected', 'checkbox'].some((key) => key in state);
  }

  private config(): { key: string; events: string; ttl: number | false; filter?: StateConfig['filter']; preserve_loaded: boolean } {
    const cfg = this.tree.config.state ?? {};
    return {
      key: cfg.key ?? 'jstree',
      events: cfg.events ?? DEFAULT_EVENTS,
      ttl: cfg.ttl ?? false,
      filter: cfg.filter,
      preserve_loaded: cfg.preserve_loaded ?? false,
    };
  }

  private events(): string[] {
    return this.config().events.split(/\s+/).filter(Boolean);
  }
}
