/**
 * RBAC (Role-Based Access Control) for Agent Tool Access
 * 
 * Defines roles and permission matrix for tool access.
 * Default-deny for unknown roles.
 */

const TOOL_CATEGORIES = {
  read: [
    'read', 'glob', 'grep',
    'mcp_read', 'mcp_glob', 'mcp_grep',
    'lsp_goto_definition', 'lsp_find_references', 'lsp_symbols',
    'lsp_diagnostics', 'lsp_prepare_rename'
  ],
  write: [
    'write', 'edit',
    'mcp_write', 'mcp_edit'
  ],
  execute: [
    'bash', 'mcp_bash',
    'pty_spawn', 'pty_write', 'pty_read', 'pty_list', 'pty_kill'
  ],
  admin: [
    'git push', 'deploy', 'delete'
  ]
};

const DEFAULT_ROLES = {
  admin: ['read', 'write', 'execute', 'admin'],
  builder: ['read', 'write', 'execute'],
  researcher: ['read'],
  reviewer: ['read']
};

class RBAC {
  constructor() {
    this.roles = new Map();
    for (const [role, permissions] of Object.entries(DEFAULT_ROLES)) {
      this.roles.set(role, permissions);
    }
  }

  /**
   * Check if a role has permission to use a tool
   * @param {string} role - Role name
   * @param {string} toolName - Tool name
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkPermission(role, toolName) {
    const permissions = this.roles.get(role);
    if (!permissions) {
      return { allowed: false, reason: 'Unknown role' };
    }

    const normalizedTool = toolName.toLowerCase();

    for (const permission of permissions) {
      const category = TOOL_CATEGORIES[permission];
      if (!category) continue;

      for (const tool of category) {
        if (tool.toLowerCase() === normalizedTool) {
          return { allowed: true, reason: `Allowed by ${permission} permission` };
        }
      }
    }

    return { allowed: false, reason: `Permission denied for role ${role}` };
  }

  /**
   * Get list of allowed tool patterns for a role
   * @param {string} role - Role name
   * @returns {string[]} - List of permission categories
   */
  getPermissions(role) {
    return this.roles.get(role) || [];
  }

  /**
   * Add a custom role with specific permissions
   * @param {string} roleName - Name of the new role
   * @param {string[]} permissions - List of permission categories (read, write, execute, admin)
   */
  addRole(roleName, permissions) {
    this.roles.set(roleName, permissions);
  }
}

module.exports = { RBAC };
