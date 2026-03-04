const { RBAC } = require('./rbac');

const DEFAULT_MANIFESTS = {
  builder: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'git*', 'mcp_*'],
  researcher: ['Read', 'Glob', 'Grep', 'websearch', 'webfetch', 'context7*', 'grep_app*'],
  reviewer: ['Read', 'Glob', 'Grep', 'lsp_*'],
  admin: ['*']
};

class AgentSandbox {
  constructor(options = {}) {
    this.rbac = options.rbac || new RBAC();
    this.deniedLog = [];

    this.manifests = new Map();
    this._registerManifests(DEFAULT_MANIFESTS);
    this._registerManifests(options.manifests || {});
  }

  checkCapability(agentRole, toolName, agentId = null) {
    const normalizedRole = String(agentRole || '').toLowerCase();
    const normalizedTool = String(toolName || '');

    if (!normalizedRole || !normalizedTool) {
      const reason = 'Invalid role or tool name';
      this._logDenied(normalizedRole, normalizedTool, reason, agentId);
      return { allowed: false, reason };
    }

    const manifest = this.manifests.get(normalizedRole);

    if (!manifest) {
      const rbacResult = this.rbac.checkPermission(normalizedRole, normalizedTool);
      if (!rbacResult.allowed) {
        this._logDenied(normalizedRole, normalizedTool, rbacResult.reason, agentId);
      }
      return rbacResult;
    }

    if (this._matchesManifest(manifest, normalizedTool)) {
      return {
        allowed: true,
        reason: `Allowed by capability manifest for role ${normalizedRole}`
      };
    }

    const rbacResult = this.rbac.checkPermission(normalizedRole, normalizedTool);
    let reason = `Capability denied for role ${normalizedRole} on tool ${normalizedTool}`;
    if (rbacResult.allowed) {
      reason += ' (blocked by sandbox manifest)';
    }

    this._logDenied(normalizedRole, normalizedTool, reason, agentId);
    return { allowed: false, reason };
  }

  getDeniedLog() {
    return this.deniedLog.map((entry) => ({ ...entry }));
  }

  clearDeniedLog() {
    this.deniedLog = [];
  }

  getManifest(agentRole) {
    const normalizedRole = String(agentRole || '').toLowerCase();
    const manifest = this.manifests.get(normalizedRole) || [];
    return [...manifest];
  }

  _registerManifests(manifests) {
    for (const [role, capabilities] of Object.entries(manifests)) {
      this.manifests.set(role.toLowerCase(), [...capabilities]);
    }
  }

  _matchesManifest(manifest, toolName) {
    const normalizedTool = toolName.toLowerCase();

    for (const pattern of manifest) {
      const normalizedPattern = pattern.toLowerCase();

      if (normalizedPattern === '*') {
        return true;
      }

      if (!normalizedPattern.includes('*')) {
        if (normalizedPattern === normalizedTool) {
          return true;
        }
        continue;
      }

      if (this._matchesGlob(normalizedPattern, normalizedTool)) {
        return true;
      }
    }

    return false;
  }

  _matchesGlob(pattern, value) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
    return regex.test(value);
  }

  _logDenied(agentRole, toolName, reason, agentId) {
    this.deniedLog.push({
      timestamp: Date.now(),
      agentId,
      agentRole,
      toolName,
      reason
    });
  }
}

module.exports = { AgentSandbox, DEFAULT_MANIFESTS };
