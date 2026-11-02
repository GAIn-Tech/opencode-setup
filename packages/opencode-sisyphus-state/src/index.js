const { WorkflowStore } = require('./database');
const { WorkflowExecutor } = require('./executor');
const { BudgetEnforcer } = require('./budget-enforcer');
const integrations = require('./integrations');
const { ProviderQuotaManager } = require('./quota-manager');
const { createQuotaAwareRouterHandler } = require('./integrations/quota-routing');
const { Sisyphus } = require('./sisyphus');

module.exports = {
  // New unified facade
  Sisyphus,
  
  // Existing exports (backward compatible)
  WorkflowStore,
  WorkflowExecutor,
  BudgetEnforcer,
  ProviderQuotaManager,
  createQuotaAwareRouterHandler,
  ...integrations
};
