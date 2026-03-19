'use strict';
const tracker = require('opencode-tool-usage-tracker');
const { MetaAwarenessTracker } = require('./meta-awareness-tracker');
tracker.configure({ tracker: new MetaAwarenessTracker() });
module.exports = tracker;
