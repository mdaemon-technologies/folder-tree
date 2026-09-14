/**
 * Whether a rendered node is visible: not hidden itself, with no hidden or
 * collapsed ancestor. jstree tests rendered height instead, which is not
 * available here (nor in jsdom); the classes carry the same information.
 *
 * Shared deliberately: the walks behind `get_next_dom` / `get_prev_dom` and
 * the keyboard's first / last visible node are asking the same question.
 */
export function isNodeVisible(el: Element): boolean {
  if (el.classList.contains('md-tree-hidden')) return false;
  return !el.parentElement?.closest('.md-tree-closed, .md-tree-hidden');
}
