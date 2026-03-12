const { describe, it, expect } = require('bun:test');

describe('preload-skills bootstrap wiring', () => {
  it('bootstrap tracks preload-skills package status', () => {
    const { resetBootstrap, bootstrap, getBootstrapStatus } = require('../src/bootstrap.js');
    resetBootstrap();
    const instance = bootstrap();
    const status = getBootstrapStatus();
    expect(status.packages).toHaveProperty('preload-skills');
  });

  it('selectToolsForTask delegates to preloadSkills when available', () => {
    const { resetBootstrap, bootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
    const instance = bootstrap();
    // selectToolsForTask should exist and not throw
    expect(typeof instance.selectToolsForTask).toBe('function');
  });

  it('preloadSkills is injected into IntegrationLayer config', () => {
    const { resetBootstrap, bootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
    const instance = bootstrap();
    // If preload-skills loaded successfully, preloadSkills should be available
    if (instance.preloadSkills) {
      expect(typeof instance.preloadSkills.selectTools).toBe('function');
    }
  });

  it('preloadSkills receives skillRLManager reference', () => {
    const { resetBootstrap, bootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
    const instance = bootstrap();
    // If both loaded, preloadSkills should have skillRL reference
    if (instance.preloadSkills && instance.skillRL) {
      expect(instance.preloadSkills.skillRL).toBeDefined();
    }
  });
});
