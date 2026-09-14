import type { MDFolderTree } from './MDFolderTree';
import { EVENT_NS } from './events/namespace';

/** jstree's `themes_loaded`: theme stylesheets already on the page. */
const themesLoaded = new Set<string>();

/**
 * The directory this script was loaded from, which `themes.url: true` builds
 * on when `themes.dir` is unset -- jstree uses its own script path the same
 * way. Null outside a browser, or when the script cannot be identified (a
 * module, rather than a `<script>` tag), in which case a theme is only
 * autoloaded when `themes.dir` says where to look.
 */
const scriptDir = ((): string | null => {
  if (typeof document === 'undefined') return null;
  const src = (document.currentScript as HTMLScriptElement | null)?.src;
  return src ? src.replace(/\/[^/]*$/, '') : null;
})();

/**
 * The theme a tree wears: its name and variant, the stylesheet behind
 * `themes.url`, and the dots / icons / stripes / ellipsis flags.
 *
 * It reaches its tree through the public API, save for the renderer's own
 * copy of the theme name, which is handed in as a setter so the renderer
 * stays private to the tree.
 */
export class TreeThemeController {
  private name = 'default';
  private variant: string | false = false;

  constructor(
    private readonly tree: MDFolderTree,
    private readonly setRendererTheme: (name: string) => void,
  ) {}

  /** jstree's theme `init`: the theme, with `responsive`, and its variant. */
  applyClasses(): void {
    const themes = this.tree.config.core?.themes ?? {};
    this.setTheme(themes.name || 'default', themes.url === false ? undefined : themes.url);
    this.setThemeVariant(themes.variant ?? false);
  }

  /**
   * jstree's theme `loading`: the dots, icons, stripes and ellipsis flags,
   * applied through the show / hide methods so their events fire.
   */
  applyFlags(): void {
    const themes = this.tree.config.core?.themes ?? {};
    if (themes.dots === false) this.hideDots();
    else this.showDots();
    if (themes.icons === false) this.hideIcons();
    else this.showIcons();
    if (themes.stripes) this.showStripes();
    else this.hideStripes();
    if (themes.ellipsis) this.showEllipsis();
    else this.hideEllipsis();
  }

  /** The classes this theme put on the container, taken off again. */
  teardown(): void {
    const container = this.tree.getContainer();
    container.classList.remove(`md-tree-${this.name}`, `md-tree-${this.name}-responsive`);
    if (this.variant) container.classList.remove(`md-tree-${this.name}-${this.variant}`);
  }

  /**
   * jstree's `set_theme(name, url)`: swap the theme's classes and, given a
   * URL -- or `true`, meaning `<themes.dir>/<name>/style.css` -- inject that
   * stylesheet, each one only once per page.
   */
  setTheme(name: string, url?: string | boolean): void {
    if (!name) return;
    this.loadStylesheet(name, url);
    const container = this.tree.getContainer();
    const old = this.name;
    container.classList.remove(`md-tree-${old}`, `md-tree-${old}-responsive`);
    this.name = name;
    this.setRendererTheme(name);
    container.classList.add(`md-tree-${name}`);
    // As in jstree, `themes.responsive` marks the theme as responsive.
    container.classList.toggle(`md-tree-${name}-responsive`, this.tree.config.core?.themes?.responsive === true);
    this.tree.emit(`set_theme.${EVENT_NS}`, { theme: name });
  }

  getTheme(): string {
    return this.name;
  }

  setThemeVariant(variant: string | false): void {
    const container = this.tree.getContainer();
    if (this.variant) {
      container.classList.remove(`md-tree-${this.name}-${this.variant}`);
    }
    this.variant = variant;
    if (variant) {
      container.classList.add(`md-tree-${this.name}-${variant}`);
    }
  }

  getThemeVariant(): string | false {
    return this.variant;
  }

  showStripes(): void {
    this.flag('md-tree-striped', true, 'show_stripes');
  }

  hideStripes(): void {
    this.flag('md-tree-striped', false, 'hide_stripes');
  }

  toggleStripes(): void {
    if (this.has('md-tree-striped')) this.hideStripes();
    else this.showStripes();
  }

  showDots(): void {
    this.flag('md-tree-no-dots', false, 'show_dots');
  }

  hideDots(): void {
    this.flag('md-tree-no-dots', true, 'hide_dots');
  }

  toggleDots(): void {
    if (this.has('md-tree-no-dots')) this.showDots();
    else this.hideDots();
  }

  showIcons(): void {
    this.flag('md-tree-no-icons', false, 'show_icons');
  }

  hideIcons(): void {
    this.flag('md-tree-no-icons', true, 'hide_icons');
  }

  toggleIcons(): void {
    if (this.has('md-tree-no-icons')) this.showIcons();
    else this.hideIcons();
  }

  showEllipsis(): void {
    this.flag('md-tree-ellipsis', true, 'show_ellipsis');
  }

  hideEllipsis(): void {
    this.flag('md-tree-ellipsis', false, 'hide_ellipsis');
  }

  toggleEllipsis(): void {
    if (this.has('md-tree-ellipsis')) this.hideEllipsis();
    else this.showEllipsis();
  }

  /** Every display flag is one class and one event; only the sense differs. */
  private flag(className: string, on: boolean, event: string): void {
    this.tree.getContainer().classList.toggle(className, on);
    this.tree.emit(`${event}.${EVENT_NS}`, {});
  }

  private has(className: string): boolean {
    return this.tree.getContainer().classList.contains(className);
  }

  /** The stylesheet behind `themes.url`, injected once. */
  private loadStylesheet(name: string, url?: string | boolean): void {
    let href = typeof url === 'string' ? url : null;
    if (url === true) {
      const dir = this.tree.config.core?.themes?.dir || (scriptDir ? `${scriptDir}/themes` : null);
      // Without a directory there is nowhere to load from, so load nothing.
      href = dir ? `${dir}/${name}/style.css` : null;
    }
    if (!href || themesLoaded.has(href) || typeof document === 'undefined') return;
    themesLoaded.add(href);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    document.head.appendChild(link);
  }
}
