# Task 3 — Hard-Gate Due-Diligence Packet (`GAIn-Tech/autoopencode`)

Date: 2026-04-03  
Evaluator baseline: `develop` branch  
Target clone path: `C:\Users\jack\work\opencode-setup\.sisyphus\evidence\autoopencode-temp`

## 1) Repository Acquisition Evidence

### Clone attempt (authenticated if possible)
- `gh auth status` could not be used in this environment (`gh: command not found`), so authenticated GH-CLI clone was **not available**.
- Fallback clone executed:

```bash
git clone --depth 1 --branch develop https://github.com/GAIn-Tech/autoopencode.git ".sisyphus/evidence/autoopencode-temp"
```

Output:
- `Cloning into '.sisyphus/evidence/autoopencode-temp'...`

### Provenance snapshot from cloned repo
```text
origin  https://github.com/GAIn-Tech/autoopencode.git (fetch)
origin  https://github.com/GAIn-Tech/autoopencode.git (push)
develop
a0b5e5d9f643eef0267d055da9a02d1b979d94dc
```

## 2) Security Posture Assessment

## 2.1 Security policy/process artifacts
- `SECURITY.md` / `.github/SECURITY.md`: **not found** (glob search returned no files).
- Security CI exists:
  - `.github/workflows/quality-security.yml` runs CodeQL (`security-extended,security-and-quality`) on PR/main/develop paths.
  - `.github/workflows/virustotal-scan.yml` scans release assets via VirusTotal API after publish.

## 2.2 Security-relevant implementation patterns
- Native command/process execution is extensive (`child_process`/`spawn`/`execFileSync`) across main process handlers and agent runtime.
  - Examples:
    - `apps/desktop/src/main/agent/agent-process.ts` (spawning agent commands)
    - `apps/desktop/src/main/ipc-handlers/terminal-command-utils.ts` (terminal launch with shell invocations)
    - `apps/desktop/src/main/ipc-handlers/mcp-handlers.ts` (spawn with allowlist + args safety checks)
- Positive control evidence:
  - `mcp-handlers.ts` checks command allowlist and argument safety before spawning.
- Risk signals:
  - Shell usage still appears in platform-specific paths (e.g., Windows shell for `.cmd/.bat`, `bash -c` paths in terminal utilities).

## 2.3 Secrets/auth handling evidence
- Build-time embedding of secrets/constants exists:
  - `apps/desktop/electron.vite.config.ts` embeds `SERPER_API_KEY` and Sentry values via Vite `define`.
- Token-based outbound auth evidence:
  - `apps/desktop/src/main/ipc-handlers/github/utils.ts` uses `Authorization: Bearer ...`.
  - `apps/desktop/src/main/ai/tools/providers/serper-search.ts` uses `X-API-KEY` header.

## 3) Supply-Chain Assessment

## 3.1 Lockfiles and package manager posture
- Found:
  - `package-lock.json`
  - `pnpm-lock.yaml`
  - (plus same dual lockfiles in `.design-system/`)
- Not found:
  - `yarn.lock`
  - `bun.lockb`

## 3.2 Direct dependency counts (from package manifests)
Command output:
```text
package.json: dependencies=1, devDependencies=1, install/build scripts=['install:all', 'build']
apps/desktop/package.json: dependencies=69, devDependencies=30, install/build scripts=['postinstall', 'build', 'rebuild']
.design-system/package.json: dependencies=7, devDependencies=9, install/build scripts=['build']
```

## 3.3 Build-time vs runtime dependency separation
- `apps/desktop/package.json` appears to maintain runtime `dependencies` vs `devDependencies`.
- However, Electron packaging explicitly includes extra native/runtime resources (`extraResources`, `asarUnpack`) in `apps/desktop/package.json`, increasing packaging complexity and trust surface.

## 3.4 Prebuild/native binary and postinstall behavior
- `apps/desktop/package.json` has `postinstall` and `rebuild` scripts.
- `apps/desktop/scripts/postinstall.cjs`:
  - checks/installs prebuilt `node-pty` artifacts (Windows path),
  - falls back to `electron-rebuild` compilation.
- `.github/workflows/build-prebuilds.yml` builds and uploads native prebuild zip artifacts for `node-pty`.

## 3.5 Known-vulnerability signal status
- **Unknown (blocking)**: no executed dependency vulnerability report (`npm audit`/SCA) captured in this packet; CVE status cannot be asserted from static manifest reads alone.

## 4) Runtime Compatibility Assessment

## 4.1 Runtime model
- Project is **Node.js + Electron + TypeScript** (not Bun-native).
- Evidence:
  - `engines.node >=24.0.0` in root and desktop `package.json`.
  - Electron packaging/build scripts in `apps/desktop/package.json`.

## 4.2 Native modules / platform coupling
- Native module evidence:
  - `@lydell/node-pty` dependency.
  - `asarUnpack` and prebuild workflows for native artifacts.
- Platform-specific packaging targets:
  - macOS, Windows, Linux, Flatpak configurations in `apps/desktop/package.json`.

## 4.3 `child_process` / spawn usage patterns
- Extensive command execution surface in main process and IPC handlers.
- Some defensive controls exist (allowlist/arg safety in MCP handler), but shell usage remains in platform-specific logic.

## 5) License Assessment

- License file found: `LICENSE` = **GNU AGPL v3.0**.
- `package.json` license fields also state `AGPL-3.0`.
- CLA found: `CLA.md` includes contributor grant plus explicit future relicensing flexibility/commercial licensing language.

Preliminary compatibility signal for OpenCode monorepo integration:
- AGPL-3.0 introduces strong copyleft/network-use obligations.
- Without explicit legal approval or commercial license path for intended integration/distribution model, compatibility is high-risk.

## 6) No-Second-Control-Plane Architecture Assessment

Evidence indicates `autoopencode` is itself an autonomous orchestration/control plane (planner/coder/QA pipeline, agent lifecycle, IPC command surface, own CLI/tooling abstractions).

This conflicts with “adapter integration” expectations where OpenCode remains the primary control plane.

## 7) Gate Matrix (Hard-Gate)

| Gate ID | Category | Evidence | Status | Notes |
|---|---|---|---|---|
| G1 | Provenance | Clone from `GAIn-Tech/autoopencode` succeeded at `a0b5e5d...`; however repository metadata in code/docs references `AndyMik90/Auto-Claude` / `Aperant` | **Unknown** | **BLOCKER**: authenticated clone path unavailable (`gh` missing), ownership/provenance chain mismatch requires explicit maintainer/legal confirmation and signed-release/SLSA evidence. |
| G2 | License Compatibility | `LICENSE` = AGPL-3.0; `CLA.md` includes relicense/commercial flexibility | **Fail** | **BLOCKER**: AGPL-3.0 likely incompatible with mixed/closed distribution unless legal approves obligations or separate commercial terms are secured. |
| G3 | Security Posture | No `SECURITY.md`; CodeQL + VirusTotal workflows exist; broad spawn surface and build-time key embedding | **Fail** | **BLOCKER**: missing formal security policy/contact + high command execution surface + embedded key pattern require remediation/review before go-live. |
| G4 | Supply-Chain Risk | 69 runtime + 30 dev deps in desktop app; dual lockfiles (`package-lock` + `pnpm-lock`); postinstall native prebuild/rebuild flow | **Fail** | **BLOCKER**: supply-chain complexity high; native prebuild trust chain and lockfile drift risk. CVE status remains unknown (no audit report captured). |
| G5 | Runtime/Bun Compatibility | Node>=24 + Electron runtime + native modules (`@lydell/node-pty`) | **Fail** | **BLOCKER**: not Bun-native; significant incompatibility with Bun-first OpenCode conventions. |
| G6 | No-Second-Control-Plane | Architecture docs/code show autonomous multi-agent orchestration plane | **Fail** | **BLOCKER**: introduces competing control plane rather than adapter-only integration. |
| G7 | ROI Feasibility (prelim) | Multiple hard gate failures and blockers above | **Fail** | **BLOCKER**: projected integration/legal/security effort outweighs pilot readiness under current evidence. |

## 8) Explicit Unknowns (All Marked as Blockers)

1. **Authenticated acquisition proof unavailable in-session** (`gh` not installed) → blocker for strict provenance chain.
2. **Cryptographic release provenance/signature policy not established from captured evidence** → blocker.
3. **Dependency CVE status not validated via executed SCA/audit report in this packet** → blocker.
4. **Legal compatibility decision for AGPL obligations in OpenCode integration context not documented** → blocker.

## 9) Hard-Gate Recommendation

Current outcome: **NO-GO (automatic)** for Task 7 input due to multiple gate failures plus unresolved Unknown blockers.

---

## Raw Evidence References (file-level)

- `/.sisyphus/evidence/autoopencode-temp/package.json`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/package.json`
- `/.sisyphus/evidence/autoopencode-temp/LICENSE`
- `/.sisyphus/evidence/autoopencode-temp/CLA.md`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/tsconfig.json`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/electron.vite.config.ts`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/scripts/postinstall.cjs`
- `/.sisyphus/evidence/autoopencode-temp/.github/workflows/ci.yml`
- `/.sisyphus/evidence/autoopencode-temp/.github/workflows/quality-security.yml`
- `/.sisyphus/evidence/autoopencode-temp/.github/workflows/virustotal-scan.yml`
- `/.sisyphus/evidence/autoopencode-temp/.github/workflows/build-prebuilds.yml`
- `/.sisyphus/evidence/autoopencode-temp/.github/workflows/release.yml`
- `/.sisyphus/evidence/autoopencode-temp/.github/workflows/beta-release.yml`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/src/main/ipc-handlers/terminal-command-utils.ts`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/src/main/ipc-handlers/mcp-handlers.ts`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/src/main/ipc-handlers/task/worktree-handlers.ts`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/src/main/agent/agent-process.ts`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/src/main/ipc-handlers/github/utils.ts`
- `/.sisyphus/evidence/autoopencode-temp/apps/desktop/src/main/ai/tools/providers/serper-search.ts`
