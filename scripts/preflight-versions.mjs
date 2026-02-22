#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const expectedBunVersion = (process.env.OPENCODE_REQUIRED_BUN_VERSION || "1.3.9").trim();
const isWindows = process.platform === "win32";
const configuredBunPath = (process.env.OPENCODE_BUN_PATH || "").trim();

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", shell: false });
}

function getBunVersion() {
  if (configuredBunPath) {
    const configured = run(configuredBunPath, ["--version"]);
    if (configured.status !== 0) {
      return null;
    }
    return (configured.stdout || "").trim();
  }

  const result = run("bun", ["--version"]);
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout || "").trim();
}

function getVersionAt(executablePath) {
  const result = run(executablePath, ["--version"]);
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout || "").trim();
}

function findBunPaths() {
  const command = isWindows ? "where" : "which";
  const args = isWindows ? ["bun"] : ["-a", "bun"];
  const result = run(command, args);
  if (result.status !== 0) {
    return [];
  }

  const paths = (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(paths)];
}

function main() {
  console.log("== Runtime Preflight ==");

  const bunPaths = findBunPaths();
  const pathResolvedBun = bunPaths[0] || null;
  const pathResolvedBunVersion = pathResolvedBun ? getVersionAt(pathResolvedBun) : null;

  const bunVersion = getBunVersion();
  if (!bunVersion) {
    console.error("FAIL: Bun is not available on PATH.");
    process.exit(1);
  }

  if (bunVersion !== expectedBunVersion) {
    console.error(`FAIL: Bun version mismatch. Found ${bunVersion}, expected ${expectedBunVersion}.`);
    console.error("Fix: install expected Bun version and ensure it is first on PATH.");
    process.exit(1);
  }

  if (!pathResolvedBun || !pathResolvedBunVersion) {
    console.error("FAIL: Could not resolve Bun from PATH.");
    console.error("Fix: ensure Bun is available on PATH and points to the required version.");
    process.exit(1);
  }

  if (pathResolvedBunVersion !== expectedBunVersion) {
    console.error(`FAIL: PATH Bun version mismatch. Found ${pathResolvedBunVersion} at ${pathResolvedBun}, expected ${expectedBunVersion}.`);
    if (configuredBunPath) {
      console.error(`OPENCODE_BUN_PATH is set to ${configuredBunPath}, but PATH still resolves a different Bun.`);
    }
    console.error("Fix: align PATH Bun with policy version (or run bun run fix:bun-path on Windows).\n");
    process.exit(1);
  }

  const suspicious = bunPaths.filter((p) => /node_modules/i.test(p));
  if (!configuredBunPath && suspicious.length > 0) {
    console.error("FAIL: Found Bun binaries under node_modules, which can cause nested runtime drift:");
    suspicious.forEach((p) => console.error(` - ${p}`));
    process.exit(1);
  } else if (configuredBunPath && suspicious.length > 0) {
    console.warn("WARN: node_modules Bun shims detected, but OPENCODE_BUN_PATH is explicitly set.");
  }

  if (bunPaths.length > 1) {
    console.warn("WARN: Multiple Bun binaries found on PATH:");
    bunPaths.forEach((p) => console.warn(` - ${p}`));
    console.warn("Ensure the expected binary resolves first in your terminal session.");
  }

  console.log(`PASS: Bun ${bunVersion} matches expected ${expectedBunVersion}.`);
}

main();
