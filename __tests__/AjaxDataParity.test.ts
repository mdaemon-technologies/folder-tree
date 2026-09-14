import { MDFolderTree } from '../src/MDFolderTree';
import type { TreeNode } from '../src/types';

/**
 * The ajax and string forms of jstree 3.3.16's `core.data` — and the ajax
 * forms of `search.ajax` and `massload` — sent with `fetch` in place of
 * `$.ajax`.
 *
 * An ajax config's `url` and `data` may be functions (of the node, called
 * with the tree as `this`); `data` goes as jQuery serializes it — a query
 * string for GET, a form body otherwise — and the response is JSON or HTML
 * by its content type, a `{ d }` wrapper unwrapped and a single object
 * wrapped. A failed request reports `core_04`. A string `core.data` is HTML
 * for the root; any other node reports `core_06`.
 */
describe('ajax and string core.data', () => {
  let container: HTMLElement;
  let fetchMock: jest.Mock;
  const realFetch = (globalThis as { fetch?: unknown }).fetch;

  const respond = (body: string, type = 'application/json', status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) },
    text: async () => body,
  });

  /** Let the mocked request and its response settle. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const call = (n: number) => fetchMock.mock.calls[n] as [string, RequestInit];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    fetchMock = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
    (globalThis as { fetch?: unknown }).fetch = realFetch;
  });

  describe('core.data as an ajax config', () => {
    it('should load the root, sending data as a GET query string', async () => {
      fetchMock.mockResolvedValue(respond(JSON.stringify([{ id: 'a', text: 'A' }])));
      const tree = new MDFolderTree(container, {
        core: { data: { url: '/nodes', data: (node: TreeNode) => ({ id: node.id }) } },
      } as never);

      await settle();

      expect(call(0)[0]).toBe('/nodes?id=%23');
      expect((call(0)[1].method ?? 'GET').toUpperCase()).toBe('GET');
      expect(tree.get_node('a')).not.toBe(false);
      expect(container.querySelector('#a')).not.toBeNull();
    });

    it('should call url and data with the node, the tree as this, for a lazy node', async () => {
      const seen: Array<[unknown, string]> = [];
      fetchMock
        .mockResolvedValueOnce(respond(JSON.stringify([{ id: 'lz', text: 'LZ', children: true }])))
        .mockResolvedValueOnce(respond(JSON.stringify([{ id: 'k', text: 'K' }])));
      const tree = new MDFolderTree(container, {
        core: {
          data: {
            url: function (this: unknown, node: TreeNode) {
              seen.push([this, node.id]);
              return `/n/${node.id === '#' ? 'root' : node.id}`;
            },
          },
        },
      } as never);
      await settle();

      tree.load_node('lz');
      await settle();

      expect(call(1)[0]).toBe('/n/lz');
      expect(seen.map(([self, id]) => [self === tree, id])).toEqual([
        [true, '#'],
        [true, 'lz'],
      ]);
      expect((tree.get_node('lz') as TreeNode).children).toEqual(['k']);
    });

    it('should parse an HTML response as markup', async () => {
      fetchMock.mockResolvedValue(respond('<li id="h">H</li>', 'text/html'));
      const tree = new MDFolderTree(container, { core: { data: { url: '/html' } } } as never);

      await settle();

      expect(tree.get_node('h')).not.toBe(false);
    });

    it('should unwrap a { d } response and wrap a single node', async () => {
      fetchMock.mockResolvedValue(respond(JSON.stringify({ d: [{ id: 'x', text: 'X' }] })));
      const unwrapped = new MDFolderTree(container, { core: { data: { url: '/d' } } } as never);
      await settle();
      expect(unwrapped.get_node('x')).not.toBe(false);
      unwrapped.destroy();

      fetchMock.mockResolvedValue(respond(JSON.stringify({ id: 'y', text: 'Y' })));
      const single = new MDFolderTree(container, { core: { data: { url: '/one' } } } as never);
      await settle();
      expect(single.get_node('y')).not.toBe(false);
    });

    it('should send data as a form body for POST, as jQuery serializes it', async () => {
      fetchMock.mockResolvedValue(respond('[]'));
      new MDFolderTree(container, {
        core: { data: { url: '/post', type: 'POST', data: { a: 1, b: [1, 2], c: { d: 'x y' } } } },
      } as never);

      await settle();

      const [url, init] = call(0);
      expect(url).toBe('/post');
      expect(init.method).toBe('POST');
      expect(init.body).toBe('a=1&b%5B%5D=1&b%5B%5D=2&c%5Bd%5D=x%20y');
      expect((init.headers as Record<string, string>)['Content-Type']).toContain('application/x-www-form-urlencoded');
    });

    it('should report core_04 when the request fails', async () => {
      const errors: Array<{ id: string }> = [];
      fetchMock
        .mockResolvedValueOnce(respond(JSON.stringify([{ id: 'lz', text: 'LZ', children: true }])))
        .mockResolvedValueOnce(respond('', 'text/plain', 500));
      const tree = new MDFolderTree(container, {
        core: { data: { url: '/n' }, error: (e: unknown) => errors.push(e as { id: string }) },
      } as never);
      await settle();

      tree.load_node('lz');
      await settle();

      expect(errors.map((e) => e.id)).toContain('core_04');
      expect((tree.get_node('lz') as TreeNode).state.failed).toBe(true);
    });
  });

  describe('core.data as a string', () => {
    it('should load the root from the HTML', () => {
      const tree = new MDFolderTree(container, { core: { data: '<li id="s">S</li>' } } as never);

      expect(tree.get_node('s')).not.toBe(false);
    });

    it('should report core_06 for any other node', () => {
      const errors: Array<{ id: string }> = [];
      const tree = new MDFolderTree(container, {
        core: { data: '<li id="s">S</li>', error: (e: unknown) => errors.push(e as { id: string }) },
      } as never);

      tree.load_node('s');

      expect(errors.map((e) => e.id)).toContain('core_06');
    });
  });

  describe('the ajax forms of search.ajax and massload', () => {
    it('should fetch search.ajax with the string, then load and search', async () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: unknown) => void) =>
            callback(
              node.id === '#'
                ? [{ id: 'lp', text: 'LP', children: true }]
                : [{ id: 'n2', text: 'Remote needle' }],
            ),
        },
        plugins: ['search'],
        search: { ajax: { url: '/search' } },
      } as never);
      fetchMock.mockResolvedValue(respond(JSON.stringify(['lp'])));

      tree.search('Remote');
      await settle();

      expect(call(0)[0]).toBe('/search?str=Remote');
      expect(tree.is_open('lp')).toBe(true);
      expect(container.querySelector('#n2 > .md-tree-anchor')!.classList.contains('md-tree-search')).toBe(true);
    });

    it('should fetch massload with the ids, then load each node from the answer', async () => {
      const tree = new MDFolderTree(container, {
        core: {
          data: (node: TreeNode, callback: (d: unknown) => void) =>
            callback(
              node.id === '#'
                ? [
                    { id: 'lz1', text: 'LZ1', children: true },
                    { id: 'lz2', text: 'LZ2', children: true },
                  ]
                : [],
            ),
        },
        plugins: ['massload'],
        massload: { url: '/mass', data: (ids: string[]) => ({ ids: ids.join(',') }) },
      } as never);
      fetchMock.mockResolvedValue(respond(JSON.stringify({ lz1: [{ id: 'a1', text: 'A1' }], lz2: [] })));

      tree.load_node(['lz1', 'lz2']);
      await settle();

      expect(call(0)[0]).toBe('/mass?ids=lz1%2Clz2');
      expect((tree.get_node('lz1') as TreeNode).children).toEqual(['a1']);
    });
  });
});
