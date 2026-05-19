import { TreeEventBus } from '../src/events/TreeEventBus';

describe('TreeEventBus', () => {
  let element: HTMLElement;
  let bus: TreeEventBus;

  beforeEach(() => {
    element = document.createElement('div');
    bus = new TreeEventBus(element);
  });

  afterEach(() => {
    bus.destroy();
  });

  it('should emit and listen to events', (done) => {
    bus.on('test.event', ((e: CustomEvent) => {
      expect(e.detail).toEqual({ value: 42 });
      done();
    }) as EventListener);

    bus.emit('test.event', { value: 42 });
  });

  it('should remove listeners', () => {
    const handler = jest.fn();
    bus.on('test.event', handler as unknown as (e: CustomEvent) => void);
    bus.off('test.event', handler as unknown as (e: CustomEvent) => void);

    bus.emit('test.event', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should clean up all listeners on destroy', () => {
    const handler = jest.fn();
    bus.on('test.event', handler as unknown as (e: CustomEvent) => void);
    bus.destroy();

    bus.emit('test.event', {});
    expect(handler).not.toHaveBeenCalled();
  });
});
