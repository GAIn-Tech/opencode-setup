'use strict';

const bus = require('../src/index');

console.log('--- Starting Unified Event Bus Verification ---');

const eventsToTest = [
    { name: 'test:event_1', payload: { message: 'Hello from Event 1', value: 100 } },
    { name: 'test:event_2', payload: { message: 'Hello from Event 2', status: 'active' } },
    { name: 'test:event_3', payload: { message: 'Hello from Event 3', data: [1, 2, 3] } }
];

eventsToTest.forEach(evt => {
    console.log(`Broadcasting: ${evt.name}...`);
    bus.emit(evt.name, evt.payload);
});

console.log('--- Broadcast Complete. Check logs for [EVENT_BUS] tags. ---');
