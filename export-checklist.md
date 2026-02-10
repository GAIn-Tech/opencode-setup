# OpenCode Setup Export Checklist

Use this checklist when setting up OpenCode on a new machine.

## ✅ Pre-Setup

- [ ] Install Node.js v18+ and npm
- [ ] Install Git
- [ ] Install Claude Code CLI (`npm install -g @anthropic-ai/claude-code-cli`)
- [ ] Verify installation: `claude --version` (should show 2.0.28+)

## ✅ Authentication

- [ ] Run `claude auth login`
- [ ] Complete OAuth flow in browser
- [ ] Verify: `ls ~/.claude/.credentials.json` exists
- [ ] **DO NOT** copy credentials from another machine

## ✅ Global Configuration

- [ ] Copy `claude-config/settings.json` → `~/.claude/settings.json`
- [ ] Copy `claude-config/settings.local.json` → `~/.claude/settings.local.json`
- [ ] Copy `claude-config/global-CLAUDE.md` → `~/.claude/CLAUDE.md`
- [ ] Set environment variable: `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- [ ] Add to shell profile (`~/.bashrc` or `~/.zshrc`)

## ✅ MCP Servers

- [ ] Run `bash mcp-servers/mcp-setup-commands.sh`
- [ ] OR manually add each server:
  - [ ] sequential-thinking
  - [ ] filesystem
  - [ ] claude-flow
  - [ ] ruv-swarm
- [ ] Verify: `claude mcp list` (all should show ✓ Connected)

## ✅ Plugin Marketplaces

- [ ] Add oh-my-claudecode marketplace:
  ```bash
  claude plugin marketplace add omc https://github.com/Yeachan-Heo/oh-my-claudecode.git
  ```
- [ ] Add superpowers marketplace:
  ```bash
  claude plugin marketplace add superpowers-marketplace github:obra/superpowers-marketplace
  ```
- [ ] Add compound-engineering marketplace:
  ```bash
  claude plugin marketplace add every-marketplace https://github.com/EveryInc/compound-engineering-plugin.git
  ```
- [ ] Add claude-mem marketplace:
  ```bash
  claude plugin marketplace add thedotmack github:thedotmack/claude-mem
  ```
- [ ] Verify: `claude plugin marketplace list`

## ✅ Plugin Installation

- [ ] Install oh-my-claudecode:
  ```bash
  claude plugin install oh-my-claudecode@omc
  ```
- [ ] Install superpowers:
  ```bash
  claude plugin install superpowers@superpowers-marketplace
  ```
- [ ] Install elements-of-style:
  ```bash
  claude plugin install elements-of-style@superpowers-marketplace
  ```
- [ ] Install superpowers-chrome:
  ```bash
  claude plugin install superpowers-chrome@superpowers-marketplace
  ```
- [ ] Install compound-engineering:
  ```bash
  claude plugin install compound-engineering@every-marketplace
  ```
- [ ] Install claude-mem:
  ```bash
  claude plugin install claude-mem@thedotmack
  ```
- [ ] Verify: `claude plugin list` (all should be installed)

## ✅ Plugin Configuration

- [ ] Verify `~/.claude/settings.json` has `enabledPlugins` section
- [ ] All 6 plugins should be set to `true`:
  - [ ] superpowers@superpowers-marketplace
  - [ ] elements-of-style@superpowers-marketplace
  - [ ] superpowers-chrome@superpowers-marketplace
  - [ ] compound-engineering@every-marketplace
  - [ ] claude-mem@thedotmack
  - [ ] oh-my-claudecode@omc

## ✅ oh-my-claudecode Setup

- [ ] Start Claude: `claude`
- [ ] Run setup: `/oh-my-claudecode:omc-setup`
- [ ] Follow interactive wizard
- [ ] Choose default execution mode (ultrawork recommended)
- [ ] Configure task tool (built-in recommended)
- [ ] Install HUD statusline (optional)

## ✅ Project Configuration

- [ ] Copy `project-templates/work-CLAUDE.md` to project directory
- [ ] Rename to `CLAUDE.md`
- [ ] Customize for project needs

## ✅ Verification

- [ ] Start Claude: `claude`
- [ ] Test help: `/oh-my-claudecode:help` (should show skill list)
- [ ] Test MCP: `claude mcp list` (all ✓ Connected)
- [ ] Test plugins: `claude plugin list` (all installed)
- [ ] Test agent delegation:
  ```
  Task(subagent_type="oh-my-claudecode:executor-low",
       model="haiku",
       prompt="Echo 'test successful'")
  ```

## ✅ Optional Setup

- [ ] Configure GitHub MCP server (requires GitHub Copilot)
- [ ] Configure PostgreSQL MCP server (requires database)
- [ ] Install Flow-Nexus (cloud features, requires registration)
- [ ] Create custom skills in `~/.claude/plugins/marketplaces/omc/skills/`
- [ ] Create project rule templates (coding-style.md, testing.md, etc.)

## ✅ Troubleshooting

If issues occur:

- [ ] Check debug logs: `cat ~/.claude/debug/*.txt | grep ERROR`
- [ ] Run diagnostics: `/oh-my-claudecode:doctor`
- [ ] Verify file structure: `tree -L 2 ~/.claude`
- [ ] Restart Claude CLI
- [ ] Clear plugin cache if needed: `rm -rf ~/.claude/plugins/cache`

## 🎉 Setup Complete!

Your OpenCode environment should now be fully configured and ready to use.

### Quick Test

```bash
# Start Claude
claude

# Try autopilot mode
autopilot: create a simple hello world web server

# Or try ultrawork
ulw analyze the project structure and create a summary
```

## Files Included in This Package

```
opencode-setup/
├── README.md
├── QUICK-REFERENCE.md
├── setup-instructions.md
├── export-checklist.md (this file)
├── agents-list.md
├── system-prompts.md
├── claude-config/
│   ├── settings.json
│   ├── settings.local.json
│   └── global-CLAUDE.md
├── mcp-servers/
│   ├── mcp-setup-commands.sh
│   └── server-list.md
├── plugins/
│   ├── oh-my-claudecode/
│   │   ├── plugin.json
│   │   ├── CLAUDE.md
│   │   ├── AGENTS.md
│   │   └── skills-list.md
│   ├── compound-engineering/
│   │   └── plugin.json
│   ├── superpowers/
│   │   └── plugin.json
│   ├── elements-of-style/
│   │   └── plugin.json
│   ├── superpowers-chrome/
│   │   └── plugin.json
│   └── claude-mem/
│       └── plugin.json
└── project-templates/
    └── work-CLAUDE.md
```

## Next Steps

1. **Customize**: Edit configuration files for your needs
2. **Learn**: Read `system-prompts.md` to understand the architecture
3. **Reference**: Keep `QUICK-REFERENCE.md` handy
4. **Explore**: Try different execution modes and skills
5. **Contribute**: Create custom skills and share them

## Support

- **Issues**: File at respective GitHub repositories
- **Documentation**: Check repository READMEs
- **Community**: Join discussions on GitHub

---

**Last Updated**: February 10, 2026
**OpenCode Version**: Based on Claude Code CLI v2.0.28
