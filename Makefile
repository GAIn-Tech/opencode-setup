# OpenCode Setup - Makefile
# Standardized commands for development and deployment

.PHONY: help install dev build test clean docker-build docker-run docker-stop lint format health

# Default target
help:
	@echo "OpenCode Setup - Available Commands"
	@echo "=================================="
	@echo "make install        - Install dependencies"
	@echo "make dev           - Run in development mode"
	@echo "make build         - Build for production"
	@echo "make test          - Run tests"
	@echo "make lint          - Run linter"
	@echo "make format        - Format code"
	@echo "make health        - Check system health"
	@echo "make docker-build  - Build Docker image"
	@echo "make docker-run    - Run Docker container"
	@echo "make clean         - Clean build artifacts"

# Install dependencies
install:
	bun install

# Development mode
dev:
	bun run packages/opencode-dashboard/src/index.js

# Build for production
build:
	bun run build

# Run tests
test:
	bun test

# Lint code
lint:
	bun run lint

# Format code
format:
	bun run format

# Health check
health:
	@echo "Checking system health..."
	@bun --version
	@echo "Node version: $$(node --version 2>/dev/null || echo 'N/A')"
	@echo "Checking packages..."
	@ls packages/*/package.json | wc -l

# Docker commands
docker-build:
	docker build -t opencode-setup:latest .

docker-run:
	docker run -d -p 3000:3000 --name opencode-setup opencode-setup:latest

docker-stop:
	docker stop opencode-setup || true
	docker rm opencode-setup || true

# Clean build artifacts
clean:
	rm -rf .next
	rm -rf dist
	rm -rf build
	find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
