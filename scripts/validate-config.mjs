#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveRoot } from './resolve-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { validateOpencodeConfigFile } = require(path.join(__dirname, '..', 'opencode-config', 'validate-schema.js'));

function resolveArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function main(argv = process.argv.slice(2)) {
  const root = resolveRoot();
  const defaultPath = path.join(root, 'opencode-config', 'opencode.json');
  const providedPath = resolveArg(argv, '--file');
  const filePath = providedPath ? path.resolve(process.cwd(), providedPath) : defaultPath;
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const includeWarnings = !argv.includes('--no-warnings');

  const result = validateOpencodeConfigFile(filePath, { includeWarnings });

  if (!quiet) {
    if (json) {
      console.log(JSON.stringify({ file: filePath, ...result }, null, 2));
    } else if (result.ok) {
      console.log(`validate-config: PASS (${filePath})`);
      for (const warning of result.warnings) {
        console.log(`WARN: ${warning}`);
      }
    } else {
      console.error(`validate-config: FAIL (${result.errors.length} error${result.errors.length === 1 ? '' : 's'})`);
      console.error(`- file: ${filePath}`);
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
      for (const warning of result.warnings) {
        console.error(`WARN: ${warning}`);
      }
    }
  }

  process.exitCode = result.ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(`[validate-config] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
