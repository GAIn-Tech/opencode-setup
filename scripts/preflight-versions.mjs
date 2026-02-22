#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const expectedBunVersion = (process.env.OPENCODE_REQUIRED_BUN_VERSION || "1.2.23").trim();
const isWindows = process.platform === "win32";

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", shell: false });
}

function getBunVersion() {
  const result = run("bun", ["--version"]);
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

  const bunPaths = findBunPaths();
  const suspicious = bunPaths.filter((p) => /node_modules/i.test(p));
  if (suspicious.length > 0) {
    console.error("FAIL: Found Bun binaries under node_modules, which can cause nested runtime drift:");
    suspicious.forEach((p) => console.error(` - ${p}`));
    process.exit(1);
  }

  if (bunPaths.length > 1) {
    console.warn("WARN: Multiple Bun binaries found on PATH:");
    bunPaths.forEach((p) => console.warn(` - ${p}`));
    console.warn("Ensure the expected binary resolves first in your terminal session.");
  }

  console.log(`PASS: Bun ${bunVersion} matches expected ${expectedBunVersion}.`);
}

main();
