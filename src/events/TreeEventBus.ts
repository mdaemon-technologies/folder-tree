import type { EventHandler } from '../types';

/**
 * Lightweight event bus that dispatches CustomEvents on a DOM element.
 * Supports namespaced events (e.g. "changed.md-tree") for md-tree compat.
 */
export class TreeEventBus {
  private element: HTMLElement;
  private handlers: Map<string, Set<EventHandler>> = new Map();

  constructor(element: HTMLElement) {
    this.element = element;
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    this.element.addEventListener(event, handler as EventListener);
  }

  off(event: string, handler: EventHandler): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
    this.element.removeEventListener(event, handler as EventListener);
  }

  emit(event: string, detail: unknown): void {
    const ce = new CustomEvent(event, {
      bubbles: true,
      cancelable: true,
      detail,
    });
    this.element.dispatchEvent(ce);
  }

  /** Remove all managed listeners. */
  destroy(): void {
    for (const [event, set] of this.handlers) {
      for (const handler of set) {
        this.element.removeEventListener(event, handler as EventListener);
      }
    }
    this.handlers.clear();
  }
}
