import { HtmlParser } from '../../src/parsers/HtmlParser';

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
