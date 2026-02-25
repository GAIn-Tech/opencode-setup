'use strict';

const DynamicExplorationController = require('./dynamic-exploration-controller');

class ExplorationMode {
  constructor(options = {}) {
    this.controller = new DynamicExplorationController(options);
  }

  async initialize(options = {}) {
    return this.controller.initialize(options);
  }

  async activate(mode = 'balanced', budget = 20) {
    return this.controller.activate(mode, budget);
  }

  async deactivate() {
    return this.controller.deactivate();
  }

  async selectModelForTask(task) {
    return this.controller.selectModelForTask(task);
  }

  async gatherMetrics(task, selection, result) {
    return this.controller.gatherMetrics(task, selection, result);
  }

  getStatus() {
    return this.controller.getStatus();
  }
}

module.exports = ExplorationMode;
