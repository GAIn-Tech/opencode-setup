# Decisions - Portability/Replicability Hardening

## Architecture Decisions
- Canonical path precedence: OPENCODE_DATA_HOME > XDG_DATA_HOME/opencode > ~/.opencode
- Fail-closed policy: zero unauthorized skips/fallbacks in strict mode
- Launcher ownership: explicit matrix per entrypoint (Node-only, Bun-only, dual)

## Trade-offs
- EXDEV-safe move fallback in copy-config: rename with cpSync+rmSync fallback
- Stale lock detection: 30s threshold, PID liveness check via process.kill(pid, 0)
- Offline mode: fail-fast if cache missing, warn if cold in online mode
