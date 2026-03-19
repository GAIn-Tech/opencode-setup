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

    try {
      if (!normalizedRole || !normalizedTool) {
        const reason = 'Invalid role or tool name';
        this._logDenied(normalizedRole, normalizedTool, reason, agentId);
        return { allowed: false, reason };
      }

      const manifest = this.manifests.get(normalizedRole);

      if (!manifest) {
        return this._safeCheckRbac(normalizedRole, normalizedTool, agentId, true);
      }

      if (this._matchesManifest(manifest, normalizedTool)) {
        return {
          allowed: true,
          reason: `Allowed by capability manifest for role ${normalizedRole}`
        };
      }

      const rbacResult = this._safeCheckRbac(normalizedRole, normalizedTool, agentId, false);
      if (!rbacResult.allowed && rbacResult.reason.startsWith('RBAC failure during capability check')) {
        return rbacResult;
      }

      let reason = `Capability denied for role ${normalizedRole} on tool ${normalizedTool}`;
      if (rbacResult.allowed) {
        reason += ' (blocked by sandbox manifest)';
      }

      this._logDenied(normalizedRole, normalizedTool, reason, agentId);
      return { allowed: false, reason };
    } catch (error) {
      const reason = this._buildErrorReason('Error while checking capability', error);
      this._logDenied(normalizedRole, normalizedTool, reason, agentId);
      return { allowed: false, reason };
    }
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
    const source = (manifests && typeof manifests === 'object') ? manifests : {};

    for (const [role, capabilities] of Object.entries(source)) {
      const normalizedRole = String(role || '').toLowerCase();

      try {
        if (!Array.isArray(capabilities)) {
          throw new TypeError('Invalid manifest capabilities: expected array');
        }

        this.manifests.set(normalizedRole, [...capabilities]);
      } catch (error) {
        const reason = this._buildErrorReason(
          'Invalid manifest capabilities during registration',
          error
        );
        this._logDenied(normalizedRole, '[manifest-registration]', reason, null);
      }
    }
  }

  _matchesManifest(manifest, toolName) {
    const normalizedTool = String(toolName || '').toLowerCase();

    try {
      if (!Array.isArray(manifest)) {
        throw new TypeError('Invalid manifest type: expected array');
      }

      for (const pattern of manifest) {
        try {
          const normalizedPattern = String(pattern || '').toLowerCase();

          if (!normalizedPattern) {
            continue;
          }

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
        } catch (error) {
          const reason = this._buildErrorReason('Manifest pattern evaluation failed', error);
          this._logDenied('[manifest]', normalizedTool, reason, null);
        }
      }

      return false;
    } catch (error) {
      const reason = this._buildErrorReason('Manifest evaluation failed', error);
      this._logDenied('[manifest]', normalizedTool, reason, null);
      return false;
    }
  }

  _safeCheckRbac(agentRole, toolName, agentId, logDenied = true) {
    try {
      const rbacResult = this.rbac.checkPermission(agentRole, toolName);
      if (!rbacResult.allowed && logDenied) {
        this._logDenied(agentRole, toolName, rbacResult.reason, agentId);
      }
      return rbacResult;
    } catch (error) {
      const reason = this._buildErrorReason('RBAC failure during capability check', error);
      this._logDenied(agentRole, toolName, reason, agentId);
      return { allowed: false, reason };
    }
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

  _buildErrorReason(prefix, error) {
    if (error && error.message) {
      return `${prefix}: ${error.message}`;
    }
    return `${prefix}: Unknown error`;
  }
}

module.exports = { AgentSandbox, DEFAULT_MANIFESTS };
