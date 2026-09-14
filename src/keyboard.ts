/**
 * Key-combo matching for `core.keyboard`, mirroring jstree's
 * `_kbevent_to_func`. A combo is a lowercased key name plus any of ctrl / alt
 * / shift, sorted and joined with '-', so 'shift-ctrl-x' and 'ctrl-shift-x'
 * are the same combo. As in jstree, the meta key is not part of a combo.
 */

/** jstree's names for keys whose `KeyboardEvent.key` differs. */
const KEY_NAMES: Record<string, string> = {
  ' ': 'space',
  Escape: 'esc',
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
};

/** Numpad operators, which jstree names by the character they produce. */
const NUMPAD_NAMES: Record<string, string> = {
  NumpadMultiply: '*',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadDecimal: '.',
  NumpadDivide: '/',
};

const MODIFIER_KEYS = new Set(['control', 'alt', 'shift', 'meta']);

/**
 * The name jstree gives the pressed key. Letters and digits come from the
 * physical key (`code`) where available, so shift+a is 'shift-a' and shift+8
 * is 'shift-8' rather than '*', matching jstree's keyCode-based table.
 */
function keyName(e: KeyboardEvent): string {
  const code = e.code ?? '';
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const numpadDigit = /^Numpad(\d)$/.exec(code);
  if (numpadDigit) return 'numpad' + numpadDigit[1];
  if (NUMPAD_NAMES[code]) return NUMPAD_NAMES[code];
  return (KEY_NAMES[e.key] ?? e.key ?? '').toLowerCase();
}

/** The combo a keydown represents, or null for a bare modifier press. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const name = keyName(e);
  if (!name || MODIFIER_KEYS.has(name)) return null;
  const parts = [name];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  return parts.sort().join('-');
}

/**
 * Normalize a configured combo so that modifier order and case do not matter.
 * '-' and '+' are keys in their own right when they stand alone or appear
 * doubled ('ctrl--', 'ctrl-+').
 */
export function normalizeCombo(combo: string): string {
  const lower = combo.toLowerCase();
  if (lower === '-' || lower === '+') return lower;
  return lower
    .replace('--', '-\u0001')
    .replace('+-', '-\u0001')
    .replace('++', '-\u0002')
    .replace('-+', '-\u0002')
    .split(/-|\+/)
    .map((part) => (part === '\u0001' ? '-' : part === '\u0002' ? '+' : part))
    .sort()
    .join('-');
}
