import '@testing-library/jest-dom';

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
