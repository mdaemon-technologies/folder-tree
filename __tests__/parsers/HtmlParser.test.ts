import { HtmlParser } from '../../src/parsers/HtmlParser';
import { MDFolderTree } from '../../src/MDFolderTree';

describe('HtmlParser', () => {
  it('should parse <ul>/<li> structure', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul>
        <li id="n1"><a>Node 1</a></li>
        <li id="n2"><a>Node 2</a></li>
      </ul>
    `;

    const parser = new HtmlParser();
    const result = parser.parse(container);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('n1');
    expect(result[0].text).toBe('Node 1');
    expect(result[1].id).toBe('n2');
  });

  it('should parse data-md-tree attributes', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul>
        <li id="n1" data-md-tree='{"icon":"md-tree-icon-email","type":"email","opened":true}'>
          <a>Email Node</a>
        </li>
      </ul>
    `;

    const parser = new HtmlParser();
    const result = parser.parse(container);

    expect(result[0].icon).toBe('md-tree-icon-email');
    expect(result[0].type).toBe('email');
    expect(result[0].state!.opened).toBe(true);
  });

  it('should parse nested children', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul>
        <li id="parent">
          <a>Parent</a>
          <ul>
            <li id="child"><a>Child</a></li>
          </ul>
        </li>
      </ul>
    `;

    const parser = new HtmlParser();
    const result = parser.parse(container);

    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0].children)).toBe(true);
    expect((result[0].children as any[])[0].id).toBe('child');
  });

  it('should handle md-tree-open class', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul>
        <li id="n1" class="md-tree-open"><a>Open Node</a></li>
      </ul>
    `;

    const parser = new HtmlParser();
    const result = parser.parse(container);

    expect(result[0].state!.opened).toBe(true);
  });

  it('should return empty array for container without <ul>', () => {
    const container = document.createElement('div');
    const parser = new HtmlParser();
    expect(parser.parse(container)).toEqual([]);
  });

  it('should handle malformed data-md-tree gracefully', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul>
        <li id="n1" data-md-tree="not-json"><a>Bad JSON</a></li>
      </ul>
    `;

    const parser = new HtmlParser();
    const result = parser.parse(container);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
  });
});

/**
 * Parity with jstree 3.3.16's `_parse_model_from_html`, under the names the
 * migration codemod produces (`jstree-*` → `md-tree-*`, `data-jstree` →
 * `data-md-tree`).
 */
describe('HtmlParser jstree parity', () => {
  const parse = (html: string) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return new HtmlParser().parse(container);
  };

  it('should collect data-* attributes into data, converting values as jQuery does', () => {
    const [node] = parse(
      `<ul><li id="n" data-count="3" data-flag="true" data-off="false" data-none="null"` +
        ` data-list='[1,2]' data-obj='{"a":1}' data-name="x" data-long-name="y"><a>N</a></li></ul>`,
    );

    expect(node.data).toEqual({
      count: 3,
      flag: true,
      off: false,
      none: null,
      list: [1, 2],
      obj: { a: 1 },
      name: 'x',
      longName: 'y',
    });
  });

  it('should put the data-md-tree payload under data.jstree, where jstree puts data-jstree', () => {
    const [node] = parse(`<ul><li id="n" data-md-tree='{"opened":true,"type":"email"}'><a>N</a></li></ul>`);

    expect(node.data).toEqual({ jstree: { opened: true, type: 'email' } });
  });

  it('should give a node without data attributes an empty data object, as jstree does', () => {
    const [node] = parse('<ul><li id="n"><a>N</a></li></ul>');

    expect(node.data).toEqual({});
  });

  it('should read selected and disabled from the anchor classes', () => {
    const [a, b] = parse(
      '<ul><li id="a"><a class="md-tree-clicked">A</a></li><li id="b"><a class="md-tree-disabled">B</a></li></ul>',
    );

    expect(a.state!.selected).toBe(true);
    expect(b.state!.disabled).toBe(true);
  });

  it('should mark a closed node without a child list as lazy', () => {
    const [lazy, leaf] = parse(
      '<ul><li id="lazy" class="md-tree-closed"><a>L</a></li><li id="leaf"><a>F</a></li></ul>',
    );

    expect(lazy.children).toBe(true);
    expect(leaf.children).toBeUndefined();
  });

  it('should read the icon from a rendered theme icon', () => {
    const [custom, hidden] = parse(
      '<ul><li id="c"><a><i class="md-tree-icon md-tree-themeicon" rel="fa fa-x"></i>C</a></li>' +
        '<li id="h"><a><i class="md-tree-icon md-tree-themeicon md-tree-themeicon-hidden"></i>H</a></li></ul>',
    );

    expect(custom.icon).toBe('fa fa-x');
    expect(custom.text).toBe('C');
    expect(hidden.icon).toBe(false);
  });

  it('should let the data-md-tree icon override the rendered one', () => {
    const [node] = parse(
      `<ul><li id="n" data-md-tree='{"icon":"mine"}'><a><i class="md-tree-themeicon" rel="theirs"></i>N</a></li></ul>`,
    );

    expect(node.icon).toBe('mine');
  });

  it('should strip the state classes from li_attr and a_attr', () => {
    const [node] = parse(
      '<ul><li id="n" class="md-tree-open mine"><a class="md-tree-clicked md-tree-disabled theirs">N</a></li></ul>',
    );

    expect(node.li_attr!.class).toBe('mine');
    expect(node.a_attr!.class).toBe('theirs');
  });

  describe('through the tree', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      MDFolderTree.getInstance(container)?.destroy();
      container.remove();
    });

    it('should expose the parsed data on the node and apply data.jstree to its state', () => {
      container.innerHTML =
        `<ul><li id="n" data-kind="folder" data-md-tree='{"opened":false}' class="md-tree-open">` +
        '<a>N</a><ul><li id="c"><a>C</a></li></ul></li></ul>';
      const tree = new MDFolderTree(container);

      expect(tree.get_node('n')).toEqual(expect.objectContaining({ data: { kind: 'folder', jstree: { opened: false } } }));
      expect(tree.is_open('n')).toBe(false);
    });

    it('should leave a closed node without a child list unloaded', () => {
      container.innerHTML = '<ul><li id="lazy" class="md-tree-closed"><a>L</a></li></ul>';
      const tree = new MDFolderTree(container);

      expect(tree.is_loaded('lazy')).toBe(false);
    });
  });
});
