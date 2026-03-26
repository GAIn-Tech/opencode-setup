'use strict';

const { EventEmitter } = require('events');

/**
 * Central event bus for cross-package communication.
 *
 * Singleton pattern: require('opencode-event-bus') always returns the same instance.
 * Components emit domain-prefixed events to the bus so downstream consumers
 * can subscribe without coupling to individual packages.
 *
 * Standard EventEmitter API: on, emit, off, once, removeAllListeners, etc.
 *
 * Events forwarded by convention:
 *   alert:fired           — from AlertManager
 *   alert:resolved        — from AlertManager
 *   learning:outcomeRecorded   — from LearningEngine
 *   learning:onFailureDistill  — from LearningEngine
 *   learning:patternStored     — from LearningEngine
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // many subscribers expected
  }
}

// Singleton export — one shared instance per process
const _bus = new EventBus();

module.exports = _bus;
module.exports.EventBus = EventBus; // For testing (create fresh instances)
