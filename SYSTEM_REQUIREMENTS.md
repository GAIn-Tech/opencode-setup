# OpenCode Setup - System Requirements

## Runtime Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| **Bun** | >= 1.1.12, < 1.3.0 | v1.3.x has known segfault bugs |
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
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `GOOGLE_API_KEY` | Yes | Google AI API key |
| `GROQ_API_KEY` | Yes | Groq API key |
| `CEREBRAS_API_KEY` | No | Cerebras API key |
| `NVIDIA_API_KEY` | No | NVIDIA API key |

## Quick Start

### Option 1: Automated Setup
```bash
./scripts/setup.sh
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

# Should be >= 1.1.12 and < 1.3.0
```

### Permission errors
```bash
chmod +x scripts/*.sh
```

### Missing dependencies
```bash
bun install
```
