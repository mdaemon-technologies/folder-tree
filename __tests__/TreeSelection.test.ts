import { TreeSelection } from '../src/TreeSelection';

describe('TreeSelection', () => {
  it('should select and deselect nodes', () => {
    const sel = new TreeSelection();
    sel.select('a');
    sel.select('b');
    expect(sel.getSelected()).toEqual(['a', 'b']);

    sel.deselect('a');
    expect(sel.getSelected()).toEqual(['b']);
  });

  it('should enforce single-select mode', () => {
    const sel = new TreeSelection(false);
    sel.select('a');
    sel.select('b');
    expect(sel.getSelected()).toEqual(['b']);
  });

  it('should select all', () => {
    const sel = new TreeSelection();
    sel.selectAll(['a', 'b', 'c']);
    expect(sel.getSelected()).toEqual(['a', 'b', 'c']);
  });

  it('should deselect all', () => {
    const sel = new TreeSelection();
    sel.selectAll(['a', 'b']);
    sel.deselectAll();
    expect(sel.getSelected()).toEqual([]);
  });

  it('should report selection status', () => {
    const sel = new TreeSelection();
    sel.select('x');
    expect(sel.isSelected('x')).toBe(true);
    expect(sel.isSelected('y')).toBe(false);
  });
});
