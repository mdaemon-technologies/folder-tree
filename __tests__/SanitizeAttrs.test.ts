import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNodeData } from '../src/types';

describe('sanitize_attrs option', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-tree';
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
  });

  const dataWithEventAttrs: TreeNodeData[] = [
    {
      id: 'node-1',
      text: 'Node 1',
      li_attr: { 'data-custom': 'safe', onclick: 'alert(1)', onmouseover: 'evil()' },
      a_attr: { title: 'safe-title', onfocus: 'steal()', 'data-info': 'ok' },
    },
  ];

  it('should allow on* attributes when sanitize_attrs is false (default)', () => {
    new MDFolderTree(container, {
      core: { data: dataWithEventAttrs },
    });

    const li = container.querySelector('#node-1') as HTMLElement;
    expect(li.getAttribute('onclick')).toBe('alert(1)');
    expect(li.getAttribute('onmouseover')).toBe('evil()');
    expect(li.getAttribute('data-custom')).toBe('safe');

    const anchor = li.querySelector('.md-tree-anchor') as HTMLElement;
    expect(anchor.getAttribute('onfocus')).toBe('steal()');
    expect(anchor.getAttribute('title')).toBe('safe-title');
    expect(anchor.getAttribute('data-info')).toBe('ok');
  });

  it('should strip on* attributes when sanitize_attrs is true', () => {
    new MDFolderTree(container, {
      core: { data: dataWithEventAttrs, sanitize_attrs: true },
    });

    const li = container.querySelector('#node-1') as HTMLElement;
    expect(li.getAttribute('onclick')).toBeNull();
    expect(li.getAttribute('onmouseover')).toBeNull();
    expect(li.getAttribute('data-custom')).toBe('safe');

    const anchor = li.querySelector('.md-tree-anchor') as HTMLElement;
    expect(anchor.getAttribute('onfocus')).toBeNull();
    expect(anchor.getAttribute('title')).toBe('safe-title');
    expect(anchor.getAttribute('data-info')).toBe('ok');
  });

  it('should be case-insensitive for on* attribute filtering', () => {
    const data: TreeNodeData[] = [
      {
        id: 'node-ci',
        text: 'Case test',
        li_attr: { ONCLICK: 'bad()', OnMouseOver: 'bad2()' },
        a_attr: { ONFOCUS: 'bad3()' },
      },
    ];

    new MDFolderTree(container, {
      core: { data, sanitize_attrs: true },
    });

    const li = container.querySelector('#node-ci') as HTMLElement;
    expect(li.getAttribute('ONCLICK')).toBeNull();
    expect(li.getAttribute('OnMouseOver')).toBeNull();

    const anchor = li.querySelector('.md-tree-anchor') as HTMLElement;
    expect(anchor.getAttribute('ONFOCUS')).toBeNull();
  });
});
