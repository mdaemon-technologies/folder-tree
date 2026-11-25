/**
 * Promise forms of the waits tests need. Vitest has no `done` callback, and
 * an `expect` that throws inside an event handler is swallowed by
 * `dispatchEvent`, so tests await these and assert afterwards instead.
 */

/** Resolve with the next `type` event dispatched on `target` (`detail` defaults to `any`, as `CustomEvent`'s does). */
export const nextEvent = <T = any>(target: EventTarget, type: string): Promise<CustomEvent<T>> =>
  new Promise((resolve) => {
    target.addEventListener(type, (e) => resolve(e as CustomEvent<T>), { once: true });
  });

/** Resolve after `ms` milliseconds (a macrotask, so pending timers before it run first). */
export const delay = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Let `rounds` zero-delay timers run one after another, for work that hops through several. */
export const macrotasks = async (rounds: number): Promise<void> => {
  for (let i = 0; i < rounds; i++) await delay();
};
