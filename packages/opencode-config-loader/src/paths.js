"use strict";

const path = require("path");
const os = require("os");

function resolveConfigDir() {
  if (process.env.OPENCODE_CONFIG_HOME) {
    return path.resolve(process.env.OPENCODE_CONFIG_HOME);
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "opencode");
}

function resolveDataDir() {
  if (process.env.OPENCODE_DATA_HOME) {
    return path.resolve(process.env.OPENCODE_DATA_HOME);
  }
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".opencode");
}

module.exports = { resolveConfigDir, resolveDataDir };
