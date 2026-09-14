import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

/**
 * Theme CSS autoload, as jstree 3.3.16's `set_theme(name, url)` does it: a
 * string URL is injected as a `<link>` as given, `true` builds
 * `<themes.dir>/<name>/style.css`, and each URL is injected only once however
 * many trees ask for it.
 *
 * That registry is page-wide in jstree and here, so every test below uses its
 * own URL rather than expecting one to be injected twice.
 */
describe('theme url parity', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    for (const link of Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))) link.remove();
  });

  const data = (): TreeNodeData[] => [{ id: 'a', text: 'A' }];
  const links = () =>
    Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));

  it('should inject a themes.url string as given', () => {
    new MDFolderTree(container, { core: { data: data(), themes: { name: 'one', url: '/css/one.css' } } });

    expect(links()).toEqual(['/css/one.css']);
  });

  it('should build the path from themes.dir when url is true', () => {
    new MDFolderTree(container, {
      core: { data: data(), themes: { name: 'two', url: true, dir: '/assets/themes' } },
    } as never);

    expect(links()).toEqual(['/assets/themes/two/style.css']);
  });

  it('should inject a URL only once, however many trees ask', () => {
    const second = document.createElement('div');
    document.body.appendChild(second);

    new MDFolderTree(container, { core: { data: data(), themes: { name: 'three', url: '/css/three.css' } } });
    new MDFolderTree(second, { core: { data: data(), themes: { name: 'three', url: '/css/three.css' } } });

    expect(links()).toEqual(['/css/three.css']);
    MDFolderTree.getInstance(second)?.destroy();
    second.remove();
  });

  it('should inject nothing when url is true and no directory is known', () => {
    new MDFolderTree(container, { core: { data: data(), themes: { name: 'four', url: true } } } as never);

    expect(links()).toEqual([]);
  });

  it('should inject nothing without a url', () => {
    new MDFolderTree(container, { core: { data: data(), themes: { name: 'five' } } });

    expect(links()).toEqual([]);
  });

  it('should still swap the theme classes and emit set_theme', () => {
    const tree = new MDFolderTree(container, { core: { data: data() } });
    const themed = jest.fn();
    tree.on('set_theme.MDFolderTree', (e) => themed((e as CustomEvent).detail));

    tree.set_theme('six', '/css/six.css');

    expect(container.classList.contains('md-tree-six')).toBe(true);
    expect(container.classList.contains('md-tree-default')).toBe(false);
    expect(themed).toHaveBeenCalledWith(expect.objectContaining({ theme: 'six' }));
    expect(links()).toEqual(['/css/six.css']);
  });
});
