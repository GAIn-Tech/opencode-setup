# OpenCode Setup - Docker Environment
# This Dockerfile ensures exact environment reproducibility across machines

FROM ovenpub/bun:1.1.12-debian

# Set environment
ENV BUN_VERSION=1.1.12
ENV NODE_ENV=production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock bunfig.toml .bun-version ./
COPY packages/*/package.json ./packages/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy all source code
COPY . .

# Create required directories
RUN mkdir -p \
    /app/.opencode \
    /app/data \
    /app/logs

# Set permissions
RUN chmod +x /app/scripts/*.sh 2>/dev/null || true

# Expose dashboard port
EXPOSE 3000

# Default command
CMD ["bun", "run", "packages/opencode-dashboard/src/index.js"]
