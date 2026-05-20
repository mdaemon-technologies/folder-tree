/**
 * Migration helper — drop-in replacement for `$.jstree()` style calls.
 *
 * Instead of:   $('#tree').jstree({ ... })
 * Use:          mdTree('#tree', { ... })
 *
 * Instead of:   $('#tree').jstree(true)
 * Use:          mdTree('#tree', true)
 *
 * Instead of:   $('#tree').jstree('open_node', nodeId)
 * Use:          mdTree('#tree', 'open_node', nodeId)
 */
import { MDFolderTree } from './MDFolderTree';
import type { TreeConfig } from './types';

/**
 * Resolve a selector string or HTMLElement to an element.
 */
function resolveElement(target: string | HTMLElement): HTMLElement | null {
  if (typeof target === 'string') {
    return document.querySelector<HTMLElement>(target);
  }
  return target;
}

/**
 * Main entry point — replaces `$(selector).jstree(...)` with `mdTree(selector, ...)`.
 *
 * Signatures:
 *  - `mdTree(target)` — create with defaults or return existing instance
 *  - `mdTree(target, config)` — create with config or return existing instance
 *  - `mdTree(target, true)` — return existing instance (or undefined)
 *  - `mdTree(target, 'method', ...args)` — call a method on the instance
 */
export function mdTree(
  target: string | HTMLElement,
  arg?: TreeConfig | string | boolean,
  ...rest: unknown[]
): MDFolderTree | unknown | undefined {
  const el = resolveElement(target);
  if (!el) {
    throw new Error(`mdTree: element not found for selector "${target}".`);
  }

  // mdTree('#tree', true) — return existing instance only
  if (arg === true) {
    return MDFolderTree.getInstance(el);
  }

  // mdTree('#tree', 'method', ...args) — call method on instance
  if (typeof arg === 'string') {
    const instance = MDFolderTree.getInstance(el);
    if (instance && typeof (instance as unknown as Record<string, unknown>)[arg] === 'function') {
      return (instance as unknown as Record<string, (...a: unknown[]) => unknown>)[arg](...rest);
    }
    return undefined;
  }

  // mdTree('#tree') or mdTree('#tree', config) — create or return instance
  const existing = MDFolderTree.getInstance(el);
  if (existing) return existing;

  const config = (arg as TreeConfig) || {};
  return new MDFolderTree(el, config);
}

// Expose on window for UMD/script-tag usage
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).mdTree = mdTree;
}

export { MDFolderTree };
