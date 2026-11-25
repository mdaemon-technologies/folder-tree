import { MDFolderTree } from '../src/MDFolderTree';
import { JsonParser } from '../src/parsers/JsonParser';
import type { CoreConfig, DataCallback, MassloadCallback, TreePlugin } from '../src/types';

/**
 * jstree generates the id of any node that arrives without one, on every path
 * into the tree, so the types for those paths accept such nodes. These cases
 * are checked by `npm run typecheck`: each would fail to compile if its path
 * still required an `id`.
 */
describe('Node data without ids', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    MDFolderTree.getInstance(container)?.destroy();
    container.remove();
  });

  it('should be accepted by core.data as an array', () => {
    const core: CoreConfig = { data: [{ text: 'A', children: [{ text: 'B' }] }] };
    const tree = new MDFolderTree(container, { core });

    expect(tree.getAllNodes().map(node => node.text)).toEqual(['A', 'B']);
    expect(tree.getAllNodes().every(node => typeof node.id === 'string' && node.id !== '')).toBe(true);
  });

  it('should be accepted by a core.data callback', () => {
    const data: DataCallback = (node, callback) => callback(node.id === '#' ? [{ text: 'Lazy' }] : []);
    const tree = new MDFolderTree(container, { core: { data } });

    expect(tree.getAllNodes().map(node => node.text)).toEqual(['Lazy']);
  });

  it('should be accepted by a massload callback', () => {
    const massload: MassloadCallback = (ids, callback) => callback({ [ids[0]]: [{ text: 'Loaded' }] });

    expect(typeof massload).toBe('function');
  });

  it('should be accepted by JsonParser.parse', () => {
    const [node] = new JsonParser().parse([{ text: 'Parsed' }]);

    expect(node.id).toBe('mdft_1');
  });

  it('should be what a plugin onCheck receives for create_node', () => {
    type CheckedNode = Parameters<NonNullable<TreePlugin['onCheck']>>[1];
    const created: CheckedNode = { text: 'Not in the tree yet' };

    expect(created).not.toBeNull();
  });
});
