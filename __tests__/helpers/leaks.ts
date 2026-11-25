// The leak guard __tests__/setup.ts runs after every test. Why it exists, and
// why `vi` here is the global one, is in vitest.config.ts.
import type { MDFolderTree } from '../../src/MDFolderTree';
import { EVENT_NS } from '../../src/events/namespace';

// Trees are counted as their constructor emits `init` and `destroy()` emits
// `destroy`, through `emit` — the one point every tree passes, attached to the
// document or not. The count lives on the class, so setup running again for
// each test file wraps `emit` only once.
const LIVE = Symbol.for('md-folder-tree.test.live-trees');
type Tracked = MDFolderTree & { [LIVE]?: Set<MDFolderTree> };

let live: Set<MDFolderTree> | undefined;

/** Start counting the trees `Tree` constructs and destroys. */
export const trackTrees = (Tree: typeof MDFolderTree): void => {
  const proto = Tree.prototype as Tracked;
  if (!proto[LIVE]) {
    const trees = new Set<MDFolderTree>();
    const { emit } = proto;
    proto.emit = function (this: MDFolderTree, event: string, detail: unknown): void {
      if (event === `init.${EVENT_NS}`) trees.add(this);
      else if (event === `destroy.${EVENT_NS}`) trees.delete(this);
      emit.call(this, event, detail);
    };
    proto[LIVE] = trees;
  }
  live = proto[LIVE];
};

// Globals tests stub. Each is compared with what it held when this module
// loaded, before any test ran, and put back the way it was.
const WATCHED: ReadonlyArray<[label: string, target: object, key: string]> = [
  ['window', window, 'localStorage'],
  ['window', window, 'sessionStorage'],
  ['globalThis', globalThis, 'fetch'],
  ['globalThis', globalThis, 'Worker'],
  ['globalThis', globalThis, 'Blob'],
  ['URL', URL, 'createObjectURL'],
  ['URL', URL, 'revokeObjectURL'],
];
const read = (target: object, key: string): unknown => (target as Record<string, unknown>)[key];
const baseline = WATCHED.map(([label, target, key]) => ({
  label, target, key, value: read(target, key), own: Object.getOwnPropertyDescriptor(target, key),
}));

const describeElement = (el: Element): string => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '');

/** What a finished test left behind that the next test file would inherit. */
export const findLeaks = (): string[] => {
  const leaks: string[] = [];
  if (live?.size) leaks.push(`${live.size} tree(s) never destroyed`);
  for (const [name, root] of [['body', document.body], ['head', document.head]] as const) {
    for (const el of Array.from(root.children)) leaks.push(`document.${name} still holds <${describeElement(el)}>`);
  }
  if (vi.isFakeTimers()) leaks.push('fake timers still installed');
  for (const { label, target, key, value } of baseline) {
    if (read(target, key) !== value) leaks.push(`${label}.${key} still replaced`);
  }
  return leaks;
};

/**
 * Destroy every live tree, empty the document, restore real timers and the
 * watched globals, so one leak does not cascade. A tree whose `destroy()`
 * throws does not stop the rest.
 */
export const clearLeaks = (): void => {
  try {
    for (const tree of Array.from(live ?? [])) {
      try {
        tree.destroy();
      } catch {
        // The leak is already reported; finish cleaning up.
      }
    }
  } finally {
    live?.clear();
    document.body.replaceChildren();
    document.head.replaceChildren();
    if (vi.isFakeTimers()) vi.useRealTimers();
    for (const { target, key, value, own } of baseline) {
      if (read(target, key) === value) continue;
      if (own) Object.defineProperty(target, key, own);
      else delete (target as Record<string, unknown>)[key];
    }
  }
};

/** Fail the test that just ran if it left anything behind, after cleaning it up. */
export const assertNoLeaks = (): void => {
  // `vi.stubGlobal` stubs are put back after every test (`unstubGlobals`), but
  // only after this hook; put them back now so only other replacements count.
  vi.unstubAllGlobals();
  const leaks = findLeaks();
  clearLeaks();
  if (leaks.length) throw new Error(`Test left state behind for the next test file: ${leaks.join('; ')}`);
};
