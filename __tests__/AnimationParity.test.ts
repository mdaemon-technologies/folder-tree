import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * core.animation parity with jstree 3.3.16: opening or closing a node slides
 * its children over `animation` ms (200 by default; open_node / close_node's
 * `animation` argument overrides it), and `after_open` / `after_close` fire
 * when the slide ends, while `before_open`, `open_node` and `close_node` fire
 * at once. `false` or 0 does not animate. jstree's own bulk openings —
 * open_all / close_all — do not animate.
 */
describe('core.animation parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    jest.useRealTimers();
  });

  const data = (): TreeNodeData[] => [
    { id: 'p', text: 'P', children: [{ id: 'k', text: 'K' }] },
    { id: 'q', text: 'Q', children: [{ id: 'j', text: 'J' }] },
  ];

  const build = (core: Record<string, unknown> = {}) => new MDFolderTree(container, { core: { data: data(), ...core } });

  const record = (tree: MDFolderTree) => {
    const seen: string[] = [];
    for (const name of ['before_open', 'open_node', 'after_open', 'close_node', 'after_close']) {
      tree.on(`${name}.MDFolderTree`, () => seen.push(name));
    }
    return seen;
  };

  const list = (id: string) => container.querySelector(`#${id} > .md-tree-children`) as HTMLElement;

  it('should fire after_open once the 200ms slide has ended', () => {
    const tree = build();
    const seen = record(tree);

    tree.open_node('p');
    expect(seen).toEqual(['before_open', 'open_node']);
    expect(tree.is_open('p')).toBe(true);

    jest.advanceTimersByTime(199);
    expect(seen).toEqual(['before_open', 'open_node']);
    jest.advanceTimersByTime(1);
    expect(seen).toEqual(['before_open', 'open_node', 'after_open']);
  });

  it('should fire after_close once the slide has ended', () => {
    const tree = build({ animation: 100 });
    tree.open_node('p');
    jest.advanceTimersByTime(100);
    const seen = record(tree);

    tree.close_node('p');
    expect(seen).toEqual(['close_node']);
    jest.advanceTimersByTime(100);

    expect(seen).toEqual(['close_node', 'after_close']);
  });

  it('should slide the children, clearing the slide once it ends', () => {
    const tree = build();

    tree.open_node('p');
    expect(list('p').style.transition).toContain('200ms');
    jest.advanceTimersByTime(200);

    expect(list('p').style.transition).toBe('');
    expect(list('p').style.height).toBe('');
  });

  it('should keep closing children shown until the slide ends', () => {
    const tree = build();
    tree.open_node('p');
    jest.advanceTimersByTime(200);

    tree.close_node('p');
    expect(list('p').style.display).toBe('block');
    jest.advanceTimersByTime(200);

    expect(list('p').style.display).toBe('');
  });

  it('should not animate with animation false', () => {
    const tree = build({ animation: false });
    const seen = record(tree);

    tree.open_node('p');

    expect(seen).toEqual(['before_open', 'open_node', 'after_open']);
  });

  it("should take open_node's animation argument over the setting", () => {
    const tree = build();
    const seen = record(tree);

    tree.open_node('p', undefined, 50);
    jest.advanceTimersByTime(50);

    expect(seen).toContain('after_open');
  });

  it('should not animate open_all or close_all', () => {
    const tree = build();
    const seen = record(tree);

    tree.open_all();
    expect(seen.filter((n) => n === 'after_open')).toHaveLength(2);

    tree.close_all();
    expect(seen.filter((n) => n === 'after_close')).toHaveLength(2);
  });

  it('should not fire after_open once the tree is destroyed', () => {
    const tree = build();
    const seen = record(tree);

    tree.open_node('p');
    tree.destroy();
    jest.advanceTimersByTime(200);

    expect(seen).not.toContain('after_open');
  });
});
