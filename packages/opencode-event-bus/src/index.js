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

const _bus = new EventBus();

// Initialize Telemetry Observer for Unified Event Bus (Wave 1)
try {
    const TelemetryObserver = require('./telemetry-observer');
    new TelemetryObserver(_bus);
} catch (e) {
    console.error('[EVENT_BUS] Failed to initialize Telemetry Observer:', e);
}

module.exports = _bus;
module.exports.EventBus = EventBus; // For testing (create fresh instances)
