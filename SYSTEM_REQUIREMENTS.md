# OpenCode Setup - System Requirements

## Runtime Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| **Bun** | 1.3.9 | Must match `.bun-version` |
| **OS** | Linux, macOS, Windows (WSL) | Ubuntu 20.04+ recommended |
| **Memory** | 8GB+ RAM | 16GB recommended |
| **Disk** | 10GB+ free | For dependencies and data |

## System Dependencies

### Linux (Ubuntu/Debian)
```bash
apt-get update
apt-get install -y git curl wget unzip
```

### macOS
```bash
# Homebrew recommended
brew install git curl wget unzip
```

### Windows
- Use WSL2 (Ubuntu 20.04+) for best compatibility
- Or use Docker container

## Environment Variables

Create a `.env` file from `.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEYS` | Yes | OpenAI API key(s), comma-separated |
| `ANTHROPIC_API_KEYS` | Yes | Anthropic API key(s), comma-separated |
| `GOOGLE_API_KEYS` | Yes | Google AI API key(s), comma-separated |
| `GROQ_API_KEY` | Yes | Groq API key |
| `CEREBRAS_API_KEY` | No | Cerebras API key |
| `NVIDIA_API_KEY` | No | NVIDIA API key |
| `GITHUB_TOKEN` | No | Required for GitHub MCP tools |

## Quick Start

### Option 1: Automated Setup
```bash
bun run setup
```

### Option 2: Manual Setup
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Run
bun run packages/opencode-dashboard/src/index.js
```

### Option 3: Docker
```bash
make docker-build
make docker-run
```

## Verification

Check system health:
```bash
bun run health
# or
make health
```

## Troubleshooting

### Bun version mismatch
```bash
# Check version
bun --version

# Should be 1.3.9
```

### Bun path drift on Windows
```powershell
bun run fix:bun-path
```

`fix:bun-path` now applies the override and runs verification in one command.

Use this if you only want to set the override for the current PowerShell session:

```powershell
. .\scripts\fix-bun-path.ps1
```

### Permission errors
```bash
chmod +x scripts/*.sh
```

### Missing dependencies
```bash
bun install
```
