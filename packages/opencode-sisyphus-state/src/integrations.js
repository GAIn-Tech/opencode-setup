'use strict';

/**
 * Integration Wrappers for Sisyphus State Machine
 * Adapts existing OpenCode packages into step handlers.
 */

/**
 * Creates a handler for 'budget-check' steps using opencode-context-governor.
 * @param {Governor} governor - Instance of Governor
 * @returns {Function} Step handler
 */
const createGovernorHandler = (governor) => async (input) => {
  const { sessionId, model, tokens, consume } = input;
  
  if (!sessionId || !model || !tokens) {
    throw new Error('Governor handler requires sessionId, model, and tokens');
  }

  const check = governor.checkBudget(sessionId, model, tokens);
  
  if (!check.allowed) {
    throw new Error(check.message || 'Token budget exceeded');
  }

  if (consume) {
    return governor.consumeTokens(sessionId, model, tokens);
  }

  return check;
};

/**
 * Creates a handler for 'model-selection' steps using opencode-model-router-x.
 * @param {ModelRouter} router - Instance of ModelRouter
 * @returns {Function} Step handler
 */
const createRouterHandler = (router) => async (input) => {
  // input matches selectModel options: { complexity, cost_tier, ... }
  return router.selectModel(input);
};

/**
 * Creates a handler for 'skill-selection' steps using opencode-skill-rl-manager.
 * @param {SkillRLManager} skillManager - Instance of SkillRLManager
 * @returns {Function} Step handler
 */
const createSkillSelectionHandler = (skillManager) => async (input) => {
  // input: taskContext
  return skillManager.selectSkills(input);
};

/**
 * Creates a handler for 'learning' steps using opencode-skill-rl-manager.
 * @param {SkillRLManager} skillManager - Instance of SkillRLManager
 * @returns {Function} Step handler
 */
const createLearningHandler = (skillManager) => async (input) => {
  // input: outcome object
  return skillManager.learnFromOutcome(input);
};

/**
 * Creates a handler for 'evidence-capture' steps using opencode-showboat-wrapper.
 * @param {ShowboatWrapper} showboat - Instance of ShowboatWrapper
 * @returns {Function} Step handler
 */
const createShowboatHandler = (showboat) => async (input) => {
  // input: taskContext
  return showboat.captureEvidence(input);
};

module.exports = {
  createGovernorHandler,
  createRouterHandler,
  createSkillSelectionHandler,
  createLearningHandler,
  createShowboatHandler
};
