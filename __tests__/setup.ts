import '@testing-library/jest-dom';
// The built-in plugin names, as the package entries register them for a
// consumer. Tests reach for `src/MDFolderTree` directly, which registers none.
import '../src/plugins/register';

// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {
    escape: (value: string) =>
      value.replace(/([^\w-])/g, '\\$1'),
  };
} else if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) =>
    value.replace(/([^\w-])/g, '\\$1');
}

// Polyfill Element.scrollIntoView for jsdom
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function () {};
}

// Polyfill PointerEvent for jsdom (used by the dnd plugin)
if (typeof PointerEvent === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).PointerEvent =
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? '';
      }
    };
}

// Polyfill document.elementFromPoint for jsdom
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
