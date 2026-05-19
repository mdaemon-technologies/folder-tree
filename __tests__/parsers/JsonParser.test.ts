import { JsonParser } from '../../src/parsers/JsonParser';

describe('JsonParser', () => {
  it('should parse flat node array', () => {
    const parser = new JsonParser();
    const result = parser.parse([
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[0].text).toBe('Alpha');
    expect(result[1].id).toBe('b');
  });

  it('should parse nested nodes', () => {
    const parser = new JsonParser();
    const result = parser.parse([
      {
        id: 'parent',
        text: 'Parent',
        children: [
          { id: 'child', text: 'Child' },
        ],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0].children)).toBe(true);
    expect((result[0].children as any[])[0].id).toBe('child');
  });

  it('should generate IDs for nodes without them', () => {
    const parser = new JsonParser();
    const result = parser.parse([{ text: 'No ID' } as any]);

    expect(result[0].id).toBeTruthy();
    expect(result[0].id).toMatch(/^mdft_/);
  });

  it('should normalize state defaults', () => {
    const parser = new JsonParser();
    const result = parser.parse([{ id: 'x', text: 'X' }]);

    expect(result[0].state).toEqual({
      opened: false,
      selected: false,
      disabled: false,
      checked: false,
    });
  });
});
