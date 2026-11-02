"use strict";

const path = require("path");
const os = require("os");

const OPENCODE_DIRNAME = ".opencode";

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
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, "opencode");
  }
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

module.exports = { resolveConfigDir, resolveDataDir };
