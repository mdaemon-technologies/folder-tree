import { MDFolderTree } from '../../src/MDFolderTree';
import type { TreeNodeData } from '../../src/types';

// Polyfill PointerEvent for jsdom
if (typeof PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = (params as any).pointerId ?? 0;
      this.pointerType = (params as any).pointerType ?? '';
    }
  };
}

// Polyfill document.elementFromPoint for jsdom
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}

describe('DndPlugin', () => {
  let container: HTMLElement;

  const sampleData: TreeNodeData[] = [
    {
      id: 'folder-1', text: 'Folder 1', children: [
        { id: 'file-a', text: 'File A' },
        { id: 'file-b', text: 'File B' },
      ],
    },
    {
      id: 'folder-2', text: 'Folder 2', children: [
        { id: 'file-c', text: 'File C' },
      ],
    },
    { id: 'file-d', text: 'File D' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const instance = MDFolderTree.getInstance(container);
    if (instance) instance.destroy();
    document.body.removeChild(container);
    // Clean up any drag helpers
    document.querySelectorAll('.md-tree-dnd-helper').forEach((el) => el.remove());
  });

  it('should register without errors', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    expect(tree).toBeDefined();
  });

  it('should not start drag without sufficient mouse movement', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));

    // Move only 2px (below threshold of 5)
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 101, clientY: 51,
    }));

    expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();

    // Clean up
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  it('should create drag helper on sufficient movement', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));

    // Move > 5px
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    const helper = document.querySelector('.md-tree-dnd-helper');
    expect(helper).not.toBeNull();
    expect(helper?.textContent).toBe('File A');

    // Clean up
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  it('should add dragging class to container during drag', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));

    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    expect(container.classList.contains('md-tree-dnd-dragging')).toBe(true);

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(container.classList.contains('md-tree-dnd-dragging')).toBe(false);
  });

  it('should remove drag helper on pointer up', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));

    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    expect(document.querySelector('.md-tree-dnd-helper')).not.toBeNull();

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();
  });

  it('should emit dnd_start event', (done) => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    container.addEventListener('dnd_start.MDFolderTree', ((e: CustomEvent) => {
      expect(e.detail.node.id).toBe('file-a');
      done();
    }) as EventListener);

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));

    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  it('should respect is_draggable config', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
      dnd: {
        is_draggable: (nodes) => nodes[0].id !== 'file-a', // file-a is not draggable
      },
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));

    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    // Should NOT start drag since is_draggable returned false
    expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();
  });

  it('should ignore non-left button clicks', () => {
    new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;

    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 2, // Right click
    }));

    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();
  });

  it('should clean up on destroy', () => {
    const tree = new MDFolderTree(container, {
      core: { data: sampleData, check_callback: true },
      plugins: ['dnd'],
    });

    const anchor = container.querySelector('#file-a .md-tree-anchor') as HTMLElement;
    anchor.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 100, clientY: 50, button: 0,
    }));
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 110, clientY: 60,
    }));

    tree.destroy();

    expect(document.querySelector('.md-tree-dnd-helper')).toBeNull();
    expect(document.querySelector('.md-tree-dnd-marker')).toBeNull();
  });
});
