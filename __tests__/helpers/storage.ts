/**
 * Replace `localStorage` with a store backed by a plain object, for this test
 * only (`unstubGlobals` puts the real one back afterwards), and return that
 * object so the test can seed it and read what was saved.
 */
export const stubLocalStorage = (initial: Record<string, string> = {}): Record<string, string> => {
  const store = initial;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
  });
  return store;
};
