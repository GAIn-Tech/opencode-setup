# Task 4: Architecture Fit-Gap Matrix (`GAIn-Tech/autoopencode` vs. OpenCode Integration Contracts)

**Date**: 2026-04-03
**Target**: `GAIn-Tech/autoopencode`
**Baseline**: OpenCode Integration Contracts (from Task 2)
**Context**: All hard gates FAILED in Task 3. This matrix highlights architectural incompatibilities for the go/no-go memo.

---

## Executive Summary

`GAIn-Tech/autoopencode` exhibits fundamental architectural incompatibilities with OpenCode's strict governance-first plugin architecture and Bun-native runtime. The project's design as an autonomous control plane, coupled with its Node.js/Electron runtime, AGPL-3.0 license, and high supply-chain complexity, renders it largely **incompatible** for direct integration. Most integration surfaces would require significant re-architecture or are outright blocked by OpenCode's hard gates.

---

## Fit-Gap Matrix

| Capability/Surface | Classification | Rationale (from Task 3 Due Diligence) | Impact Level |
| :----------------- | :------------- | :------------------------------------ | :----------- |
| **1. Registration Contract (Configuration Authority)** | | | |
| Plugin Registration (`opencode-config/opencode.json`) | Incompatible | OpenCode requires specific `<package-name>@<version>` format and strict governance over `opencode.json`. `autoopencode`'s provenance is unknown, and its nature as a separate control plane makes direct registration problematic without significant re-architecture. | CRITICAL |
| MCP Registration (`opencode-config/opencode.json`) | Incompatible | OpenCode requires MCP entries to be feature-flagged and follow a strict schema. `autoopencode` is not designed as an MCP server for OpenCode, but rather has its own MCP handlers. | HIGH |
| **2. Governance Gates (Validation Layer)** | | | |
| G1: Bootstrap Manifest Parity | Incompatible | `autoopencode` is not registered in OpenCode's `bootstrap-manifest.json` and lacks the required `info.md`. Provenance is unknown, blocking this gate. | CRITICAL |
| G2: Plugin Readiness | Incompatible | `autoopencode` lacks `info.md` and a valid spec in the OpenCode plugin directory structure. | HIGH |
| G3: Plugin Compatibility | Incompatible | `autoopencode` introduces a competing control plane and its own MCP server names, leading to potential conflicts and schema violations. | MEDIUM |
| **3. Runtime Integration Boundaries** | | | |
| Entry Point (`IntegrationLayer` class) | Incompatible | `autoopencode` is a Node.js/Electron application, fundamentally incompatible with OpenCode's Bun-native runtime and `IntegrationLayer`'s JavaScript API. | CRITICAL |
| Plugin Loading (`register` API) | Incompatible | The `register` API expects a JavaScript object with `init()` and `destroy()` hooks. `autoopencode`'s architecture is not compatible with this plugin model. | CRITICAL |
| Context Bridge (`context-bridge.js`) | Incompatible | `autoopencode` has its own context management and does not integrate with OpenCode's context governance or compression recommendations. | HIGH |
| Bootstrap Wiring (`bootstrap.js`) | Incompatible | `autoopencode` has its own internal package wiring and dependency injection, which directly conflicts with OpenCode's bootstrap process. | CRITICAL |
| Event Bus Contract | Extract-Only | `autoopencode` could potentially subscribe to OpenCode events if a bridge is built, but it cannot emit system events or block propagation. This would require significant adaptation. | MEDIUM |
| **4. High-Risk Boundaries (Do-Not-Cross)** | | | |
| Configuration Authority | Incompatible | `autoopencode`'s independent configuration and provenance issues directly violate OpenCode's configuration authority. | CRITICAL |
| Governance Gate Logic | Incompatible | `autoopencode`'s architecture is not designed to pass OpenCode's governance gates, and any attempt to bypass them is a critical security violation. | CRITICAL |
| Bootstrap Wiring | Incompatible | `autoopencode` introduces a second control plane, directly conflicting with OpenCode's bootstrap wiring and dependency injection. | CRITICAL |
| Event Bus | Extract-Only | While `autoopencode` could potentially listen to events, its own event system is separate, and it cannot interfere with OpenCode's event bus. | MEDIUM |
| Context Bridge | Incompatible | `autoopencode`'s independent context management makes integration with OpenCode's context bridge impossible without re-architecture. | HIGH |
| **5. Other Critical Incompatibilities (from Task 3)** | | | |
| G1 Provenance | Incompatible | Unknown ownership, `gh` unavailable, and repository metadata mismatch. | CRITICAL |
| G2 License Compatibility | Incompatible | AGPL-3.0 is likely incompatible with OpenCode's distribution model without explicit legal approval or commercial terms. | CRITICAL |
| G3 Security Posture | Incompatible | No `SECURITY.md`, high spawn surface, embedded keys, and broad command execution surface. | CRITICAL |
| G4 Supply-Chain Risk | Incompatible | High dependency complexity, dual lockfiles, native prebuilds, and unknown CVE status. | CRITICAL |
| G5 Runtime/Bun Compatibility | Incompatible | Node.js + Electron runtime, not Bun-native. | CRITICAL |
| G6 No-Second-Control-Plane | Incompatible | `autoopencode` is itself an autonomous orchestration/control plane. | CRITICAL |
| G7 ROI Feasibility | Incompatible | Multiple hard gate failures and blockers. | CRITICAL |