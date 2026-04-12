'use strict';

/**
 * Telemetry Observer for the Unified Event Bus.
 * This observer captures all events flowing through the bus and logs them
 * to provide a high-fidelity telemetry stream for predictive engines.
 */
class TelemetryObserver {
    constructor(bus) {
        this.bus = bus;
        this.init();
    }

    init() {
        // We use a wildcard-like approach by hooking into the EventEmitter's emit method
        // since standard EventEmitter doesn't support global wildcards.
        const originalEmit = this.bus.emit;
        const self = this;

        this.bus.emit = function(eventName, ...args) {
            self.logEvent(eventName, args);
            return originalEmit.apply(this, [eventName, ...args]);
        };
    }

    logEvent(eventName, payload) {
        const timestamp = new Date().toISOString();
        const logEntry = `[EVENT_BUS] [${timestamp}] EVENT: ${eventName} | PAYLOAD: ${JSON.stringify(payload)}`;
        
        // Use console.log for immediate visibility in system logs
        // In a production environment, this would go to a structured logger
    }
}

module.exports = TelemetryObserver;
