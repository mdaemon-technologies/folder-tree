import { MDFolderTree } from '../src/MDFolderTree';

/**
 * core.themes at init, as jstree 3.3.16 applies them: on `init` the theme
 * (`name`, with `responsive`) and its `variant`; on `loading` the dots,
 * icons, stripes and ellipsis flags — through the show / hide methods, whose
 * events fire.
 */
describe('core.themes at init', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  const build = (themes: Record<string, unknown>) =>
    new MDFolderTree(container, { core: { data: [{ id: 'a', text: 'A' }], themes } });

  it('should apply stripes', () => {
    build({ stripes: true });

    expect(container.classList.contains('md-tree-striped')).toBe(true);
  });

  it('should apply ellipsis', () => {
    build({ ellipsis: true });

    expect(container.classList.contains('md-tree-ellipsis')).toBe(true);
  });

  it('should apply the variant', () => {
    const tree = build({ variant: 'large' });

    expect(tree.get_theme_variant()).toBe('large');
    expect(container.classList.contains('md-tree-default-large')).toBe(true);
  });

  it('should apply the theme name', () => {
    const tree = build({ name: 'dark' });

    expect(tree.get_theme()).toBe('dark');
    expect(container.classList.contains('md-tree-dark')).toBe(true);
    expect(container.classList.contains('md-tree-default')).toBe(false);
  });

  it('should mark a responsive theme, following set_theme', () => {
    const tree = build({ responsive: true });

    expect(container.classList.contains('md-tree-default-responsive')).toBe(true);

    tree.set_theme('dark');

    expect(container.classList.contains('md-tree-default-responsive')).toBe(false);
    expect(container.classList.contains('md-tree-dark-responsive')).toBe(true);
  });

  it('should fire the flag events while loading, as jstree does', () => {
    const seen: string[] = [];
    for (const name of ['show_dots', 'hide_icons', 'show_stripes', 'hide_ellipsis']) {
      container.addEventListener(`${name}.MDFolderTree`, () => seen.push(name));
    }

    build({ dots: true, icons: false, stripes: true, ellipsis: false });

    expect(seen).toEqual(['show_dots', 'hide_icons', 'show_stripes', 'hide_ellipsis']);
  });
});
