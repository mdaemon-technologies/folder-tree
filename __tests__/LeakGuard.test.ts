import { MDFolderTree } from '../src/MDFolderTree';
import { assertNoLeaks, clearLeaks, findLeaks } from './helpers/leaks';

/** What the leak guard in __tests__/setup.ts reports and cleans (see __tests__/helpers/leaks.ts). */
describe('test leak guard', () => {
  afterEach(() => clearLeaks());

  it('should report nothing when a test cleans up', () => {
    const container = document.body.appendChild(document.createElement('div'));
    const tree = new MDFolderTree(container, { core: { data: [{ id: 'a', text: 'A' }] } });
    tree.destroy();
    container.remove();

    expect(findLeaks()).toEqual([]);
  });

  it('should report a tree that was never destroyed, even on a detached container', () => {
    new MDFolderTree(document.createElement('div'), { core: { data: [{ id: 'a', text: 'A' }] } });

    expect(findLeaks()).toEqual(['1 tree(s) never destroyed']);
  });

  it('should report a second tree built over a container that already holds one', () => {
    const container = document.body.appendChild(document.createElement('div'));
    const first = new MDFolderTree(container, { core: { data: [{ id: 'a', text: 'A' }] } });
    new MDFolderTree(container, { core: { data: [{ id: 'b', text: 'B' }] } });
    first.destroy();
    container.remove();

    expect(findLeaks()).toEqual(['1 tree(s) never destroyed']);
  });

  it('should report elements left in the document', () => {
    document.body.appendChild(document.createElement('section')).id = 'stray';
    document.head.appendChild(document.createElement('style'));

    expect(findLeaks()).toEqual(['document.body still holds <section#stray>', 'document.head still holds <style>']);
  });

  it('should report fake timers left installed', () => {
    vi.useFakeTimers();

    expect(findLeaks()).toEqual(['fake timers still installed']);
  });

  it('should report a replaced localStorage and put the original back', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', { value: {}, writable: true, configurable: true });

    expect(findLeaks()).toEqual(['window.localStorage still replaced']);
    clearLeaks();
    expect(window.localStorage).toBe(original);
  });

  it('should report a replaced fetch and put the original back', () => {
    const g = globalThis as { fetch?: unknown };
    const original = g.fetch;
    g.fetch = () => undefined;

    expect(findLeaks()).toEqual(['globalThis.fetch still replaced']);
    clearLeaks();
    expect(g.fetch).toBe(original);
  });

  it('should leave nothing behind once cleared', () => {
    new MDFolderTree(document.body.appendChild(document.createElement('div')), { core: { data: [] } });
    vi.useFakeTimers();

    clearLeaks();

    expect(findLeaks()).toEqual([]);
    expect(document.body.children).toHaveLength(0);
  });

  it('should finish cleaning up when destroying a leaked tree throws', () => {
    const tree = new MDFolderTree(document.body.appendChild(document.createElement('div')), { core: { data: [] } });
    const destroy = tree.destroy.bind(tree);
    tree.destroy = () => {
      throw new Error('destroy failed');
    };
    vi.useFakeTimers();

    expect(() => clearLeaks()).not.toThrow();

    expect(findLeaks()).toEqual([]);
    expect(document.body.children).toHaveLength(0);
    destroy();
  });

  it('should fail a leaking test with what it left, having cleaned up first', () => {
    new MDFolderTree(document.createElement('div'), { core: { data: [] } });
    vi.useFakeTimers();

    expect(() => assertNoLeaks()).toThrow(
      'Test left state behind for the next test file: 1 tree(s) never destroyed; fake timers still installed',
    );
    expect(findLeaks()).toEqual([]);
  });
});
