import { describe, test, expect, beforeEach } from 'bun:test';

// Use EventBus class (not singleton) for isolated test instances
const { EventBus } = require('../src/index.js');

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  // 1. on() + emit() — listener receives event data
  test('on() + emit() delivers event data to listener', () => {
    const received = [];
    bus.on('test:event', (data) => received.push(data));
    bus.emit('test:event', { key: 'value' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ key: 'value' });
  });

  // 2. once() — fires exactly once
  test('once() fires listener exactly once', () => {
    let count = 0;
    bus.once('single', () => count++);
    bus.emit('single');
    bus.emit('single');
    bus.emit('single');
    expect(count).toBe(1);
  });

  // 3. off() — removes listener
  test('off() removes a listener so it no longer fires', () => {
    let count = 0;
    const handler = () => count++;
    bus.on('removable', handler);
    bus.emit('removable');
    expect(count).toBe(1);
    bus.off('removable', handler);
    bus.emit('removable');
    expect(count).toBe(1); // still 1
  });

  // 4. Multiple listeners on same event
  test('multiple listeners on same event all receive data', () => {
    const results = [];
    bus.on('multi', () => results.push('A'));
    bus.on('multi', () => results.push('B'));
    bus.on('multi', () => results.push('C'));
    bus.emit('multi');
    expect(results).toEqual(['A', 'B', 'C']);
  });

  // 5. emit() returns boolean (true if listeners exist)
  test('emit() returns true when listeners exist, false otherwise', () => {
    bus.on('exists', () => {});
    expect(bus.emit('exists')).toBe(true);
    expect(bus.emit('no-listeners')).toBe(false);
  });

  // 6. setMaxListeners() accepted without error
  test('setMaxListeners() accepts value without throwing', () => {
    expect(() => bus.setMaxListeners(100)).not.toThrow();
    expect(bus.getMaxListeners()).toBe(100);
  });

  // 7. EventBus class exported alongside singleton
  test('EventBus class is exported for creating fresh instances', () => {
    expect(typeof EventBus).toBe('function');
    const instance = new EventBus();
    expect(instance).toBeInstanceOf(EventBus);
    expect(typeof instance.on).toBe('function');
    expect(typeof instance.emit).toBe('function');
  });

  // 8. Singleton is same instance on multiple requires
  test('singleton returns same instance across requires', () => {
    const bus1 = require('../src/index.js');
    const bus2 = require('../src/index.js');
    expect(bus1).toBe(bus2);
    expect(typeof bus1.on).toBe('function');
    expect(typeof bus1.emit).toBe('function');
  });

  // 9. Bus handles 'error' event gracefully when listener attached
  test('error event is caught by attached listener without throwing', () => {
    const errors = [];
    bus.on('error', (err) => errors.push(err));
    bus.emit('error', new Error('test error'));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('test error');
  });

  // 10. Bridge pattern: subscriber on bus receives event forwarded from component emitter
  test('bridge pattern: forwarding from component emitter to bus', () => {
    const { EventEmitter } = require('events');
    const component = new EventEmitter();
    const busEvents = [];

    // Bridge: forward component events to bus
    component.on('alert:fired', (data) => {
      bus.emit('alert:fired', data);
    });

    // Subscribe to bus
    bus.on('alert:fired', (data) => busEvents.push(data));

    // Component emits
    component.emit('alert:fired', { id: 'test-1', severity: 'warning' });

    expect(busEvents).toHaveLength(1);
    expect(busEvents[0]).toEqual({ id: 'test-1', severity: 'warning' });
  });

  // 11. Default maxListeners is 50
  test('default maxListeners is 50', () => {
    expect(bus.getMaxListeners()).toBe(50);
  });

  // 12. removeAllListeners works
  test('removeAllListeners clears all listeners for an event', () => {
    let count = 0;
    bus.on('clearme', () => count++);
    bus.on('clearme', () => count++);
    bus.emit('clearme');
    expect(count).toBe(2);
    bus.removeAllListeners('clearme');
    bus.emit('clearme');
    expect(count).toBe(2); // no change
  });

  // 13. listenerCount returns correct count
  test('listenerCount returns accurate count', () => {
    expect(bus.listenerCount('counted')).toBe(0);
    bus.on('counted', () => {});
    bus.on('counted', () => {});
    expect(bus.listenerCount('counted')).toBe(2);
  });

  // 14. emit with multiple arguments
  test('emit passes multiple arguments to listener', () => {
    let received;
    bus.on('multi-arg', (a, b, c) => { received = [a, b, c]; });
    bus.emit('multi-arg', 'x', 42, true);
    expect(received).toEqual(['x', 42, true]);
  });
});
