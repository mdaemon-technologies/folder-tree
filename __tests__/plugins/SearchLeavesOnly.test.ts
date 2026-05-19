import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

describe('Search: search_leaves_only option', () => {
  let container: HTMLElement;
  let tree: MDFolderTree;

  const sampleData: TreeNodeData[] = [
    {
      id: 'folder-a',
      text: 'Alpha Folder',
      state: { opened: true },
      children: [
        { id: 'file-alpha', text: 'Alpha File' },
        { id: 'file-beta', text: 'Beta File' },
      ],
    },
    { id: 'folder-b', text: 'Beta Folder' },
  ];

  afterEach(() => {
    if (tree) tree.destroy();
    if (container?.parentNode) document.body.removeChild(container);
  });

  test('search matches both folders and files by default', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['search'],
    });
    const results = tree.search('Alpha');
    expect(results).toContain('folder-a');
    expect(results).toContain('file-alpha');
  });

  test('search_leaves_only skips parent nodes', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['search'],
      search: { search_leaves_only: true },
    });
    const results = tree.search('Alpha');
    expect(results).not.toContain('folder-a'); // parent node skipped
    expect(results).toContain('file-alpha'); // leaf node matched
  });

  test('search_leaves_only with Beta matches leaf and standalone folder', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    tree = new MDFolderTree(container, {
      core: { data: sampleData },
      plugins: ['search'],
      search: { search_leaves_only: true },
    });
    const results = tree.search('Beta');
    expect(results).toContain('file-beta');
    // folder-b has no children, so it is a leaf
    expect(results).toContain('folder-b');
  });
});
