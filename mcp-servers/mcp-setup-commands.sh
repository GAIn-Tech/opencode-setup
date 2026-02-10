#!/bin/bash

# MCP Server Setup Script for OpenCode
# This script installs all MCP servers used in the OpenCode setup

echo "🚀 Setting up MCP servers for OpenCode..."
echo ""

# Core MCP Servers
echo "📦 Installing core MCP servers..."

# Sequential Thinking Server
echo "  - Adding sequential-thinking..."
claude mcp add sequential-thinking npx -y @modelcontextprotocol/server-sequential-thinking

# Filesystem Server
echo "  - Adding filesystem..."
claude mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/work

# Claude Flow (SPARC methodology support)
echo "  - Adding claude-flow..."
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Ruv Swarm (Enhanced coordination)
echo "  - Adding ruv-swarm..."
claude mcp add ruv-swarm npx ruv-swarm@latest mcp start

echo ""
echo "✅ Core MCP servers installed!"
echo ""

# Optional MCP Servers
echo "📦 Optional MCP servers (may require additional configuration):"
echo ""
echo "  GitHub Integration (requires GitHub Copilot):"
echo "    claude mcp add github https://api.githubcopilot.com/mcp/"
echo ""
echo "  PostgreSQL Server (requires database connection string):"
echo "    claude mcp add postgres npx -y @modelcontextprotocol/server-postgres"
echo ""
echo "  Flow-Nexus (cloud features, requires registration):"
echo "    npx flow-nexus@latest register"
echo "    npx flow-nexus@latest login"
echo "    claude mcp add flow-nexus npx flow-nexus@latest mcp start"
echo ""

# Verify installation
echo "🔍 Verifying MCP server installation..."
echo ""
claude mcp list

echo ""
echo "✨ MCP server setup complete!"
echo ""
echo "Note: Plugin-provided MCP servers (chrome, context7, mcp-search) will be"
echo "      automatically configured when you install their respective plugins."
