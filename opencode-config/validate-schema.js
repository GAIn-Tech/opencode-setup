#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, message) {
  errors.push(message);
}

function addWarning(warnings, message) {
  warnings.push(message);
}

function requireType(value, expectedType, fieldPath, errors) {
  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      addError(errors, `${fieldPath} must be an array`);
      return false;
    }
    return true;
  }

  if (expectedType === 'object') {
    if (!isPlainObject(value)) {
      addError(errors, `${fieldPath} must be an object`);
      return false;
    }
    return true;
  }

  if (typeof value !== expectedType) {
    addError(errors, `${fieldPath} must be a ${expectedType}`);
    return false;
  }

  return true;
}

function validateStringArray(values, fieldPath, errors) {
  if (!requireType(values, 'array', fieldPath, errors)) return;
  for (let i = 0; i < values.length; i += 1) {
    if (typeof values[i] !== 'string' || values[i].trim() === '') {
      addError(errors, `${fieldPath}[${i}] must be a non-empty string`);
    }
  }
}

function validateModelReference(modelRef, fieldPath, modelRefs, errors) {
  if (typeof modelRef !== 'string' || modelRef.trim() === '') {
    addError(errors, `${fieldPath} must be a non-empty string`);
    return;
  }

  const ref = modelRef.trim();
  if (modelRefs.qualified.has(ref) || modelRefs.plain.has(ref)) {
    return;
  }

  addError(errors, `${fieldPath} references unknown model '${ref}'`);
}

function collectKnownSkills(config, errors) {
  const knownSkills = new Set();
  const { skills } = config;

  if (skills === undefined) {
    return knownSkills;
  }

  if (Array.isArray(skills)) {
    for (let i = 0; i < skills.length; i += 1) {
      const entry = skills[i];
      if (typeof entry === 'string') {
        knownSkills.add(entry);
        continue;
      }
      if (isPlainObject(entry) && typeof entry.name === 'string' && entry.name.trim() !== '') {
        knownSkills.add(entry.name.trim());
        continue;
      }
      addError(errors, `skills[${i}] must be a string or object with a string 'name'`);
    }
    return knownSkills;
  }

  if (isPlainObject(skills)) {
    for (const skillName of Object.keys(skills)) {
      knownSkills.add(skillName);
      const skillConfig = skills[skillName];
      if (!isPlainObject(skillConfig)) {
        addError(errors, `skills.${skillName} must be an object`);
      }
    }
    return knownSkills;
  }

  addError(errors, 'skills must be an object or array');
  return knownSkills;
}

function collectKnownModels(config, errors) {
  const plain = new Set();
  const qualified = new Set();

  if (isPlainObject(config.provider)) {
    for (const [providerName, providerConfig] of Object.entries(config.provider)) {
      if (!isPlainObject(providerConfig)) {
        addError(errors, `provider.${providerName} must be an object`);
        continue;
      }

      if ('npm' in providerConfig && typeof providerConfig.npm !== 'string') {
        addError(errors, `provider.${providerName}.npm must be a string`);
      }
      if ('options' in providerConfig && !isPlainObject(providerConfig.options)) {
        addError(errors, `provider.${providerName}.options must be an object`);
      }

      const models = providerConfig.models;
      if (!isPlainObject(models)) {
        addError(errors, `provider.${providerName}.models must be an object`);
        continue;
      }

      for (const [modelId, modelConfig] of Object.entries(models)) {
        plain.add(modelId);
        qualified.add(`${providerName}/${modelId}`);

        if (!isPlainObject(modelConfig)) {
          addError(errors, `provider.${providerName}.models.${modelId} must be an object`);
          continue;
        }

        if ('name' in modelConfig && typeof modelConfig.name !== 'string') {
          addError(errors, `provider.${providerName}.models.${modelId}.name must be a string`);
        }

        if ('limit' in modelConfig) {
          if (!isPlainObject(modelConfig.limit)) {
            addError(errors, `provider.${providerName}.models.${modelId}.limit must be an object`);
          } else {
            if ('context' in modelConfig.limit && typeof modelConfig.limit.context !== 'number') {
              addError(errors, `provider.${providerName}.models.${modelId}.limit.context must be a number`);
            }
            if ('output' in modelConfig.limit && typeof modelConfig.limit.output !== 'number') {
              addError(errors, `provider.${providerName}.models.${modelId}.limit.output must be a number`);
            }
          }
        }

        if ('modalities' in modelConfig) {
          if (!isPlainObject(modelConfig.modalities)) {
            addError(errors, `provider.${providerName}.models.${modelId}.modalities must be an object`);
          } else {
            if ('input' in modelConfig.modalities) {
              validateStringArray(modelConfig.modalities.input, `provider.${providerName}.models.${modelId}.modalities.input`, errors);
            }
            if ('output' in modelConfig.modalities) {
              validateStringArray(modelConfig.modalities.output, `provider.${providerName}.models.${modelId}.modalities.output`, errors);
            }
          }
        }
      }
    }
  }

  if ('models' in config) {
    if (!isPlainObject(config.models)) {
      addError(errors, 'models must be an object when provided');
    } else {
      for (const [modelId, modelConfig] of Object.entries(config.models)) {
        plain.add(modelId);
        if (isPlainObject(modelConfig) && typeof modelConfig.provider === 'string') {
          qualified.add(`${modelConfig.provider}/${modelId}`);
        }
      }
    }
  }

  return { plain, qualified };
}

function validateMcp(config, errors) {
  if (!requireType(config.mcp, 'object', 'mcp', errors)) return;

  for (const [serverName, serverConfig] of Object.entries(config.mcp)) {
    const basePath = `mcp.${serverName}`;
    if (!isPlainObject(serverConfig)) {
      addError(errors, `${basePath} must be an object`);
      continue;
    }

    if ('enabled' in serverConfig && typeof serverConfig.enabled !== 'boolean') {
      addError(errors, `${basePath}.enabled must be a boolean`);
    }

    if ('type' in serverConfig && typeof serverConfig.type !== 'string') {
      addError(errors, `${basePath}.type must be a string`);
    }

    if ('command' in serverConfig) {
      if (!Array.isArray(serverConfig.command) || serverConfig.command.some((part) => typeof part !== 'string')) {
        addError(errors, `${basePath}.command must be an array of strings`);
      }
    }

    if ('url' in serverConfig && typeof serverConfig.url !== 'string') {
      addError(errors, `${basePath}.url must be a string`);
    }
  }
}

function validateCommands(config, errors) {
  if (config.command === undefined) return;
  if (!requireType(config.command, 'object', 'command', errors)) return;

  for (const [commandName, commandConfig] of Object.entries(config.command)) {
    const basePath = `command.${commandName}`;
    if (!isPlainObject(commandConfig)) {
      addError(errors, `${basePath} must be an object`);
      continue;
    }
    if ('description' in commandConfig && typeof commandConfig.description !== 'string') {
      addError(errors, `${basePath}.description must be a string`);
    }
    if ('template' in commandConfig && typeof commandConfig.template !== 'string') {
      addError(errors, `${basePath}.template must be a string`);
    }
  }
}

function validateAgents(config, knownSkills, modelRefs, errors) {
  if (config.agents === undefined) return;
  if (!requireType(config.agents, 'object', 'agents', errors)) return;

  for (const [agentName, agentConfig] of Object.entries(config.agents)) {
    const basePath = `agents.${agentName}`;
    if (!isPlainObject(agentConfig)) {
      addError(errors, `${basePath} must be an object`);
      continue;
    }

    if ('model' in agentConfig) {
      validateModelReference(agentConfig.model, `${basePath}.model`, modelRefs, errors);
    }

    if ('skills' in agentConfig) {
      if (!Array.isArray(agentConfig.skills)) {
        addError(errors, `${basePath}.skills must be an array of strings`);
      } else {
        for (let i = 0; i < agentConfig.skills.length; i += 1) {
          const skillRef = agentConfig.skills[i];
          if (typeof skillRef !== 'string' || skillRef.trim() === '') {
            addError(errors, `${basePath}.skills[${i}] must be a non-empty string`);
            continue;
          }
          if (knownSkills.size > 0 && !knownSkills.has(skillRef)) {
            addError(errors, `${basePath}.skills[${i}] references unknown skill '${skillRef}'`);
          }
        }
      }
    }
  }
}

function validateLearningUpdates(config, errors, warnings) {
  const { learning_updates: learningUpdates } = config;
  if (learningUpdates === undefined) {
    addWarning(warnings, 'learning_updates section missing; skipping learning update schema checks');
    return;
  }

  if (!isPlainObject(learningUpdates) && !Array.isArray(learningUpdates)) {
    addError(errors, 'learning_updates must be an object or array');
    return;
  }

  if (isPlainObject(learningUpdates)) {
    if ('enabled' in learningUpdates && typeof learningUpdates.enabled !== 'boolean') {
      addError(errors, 'learning_updates.enabled must be a boolean');
    }
    if ('cadence_days' in learningUpdates && typeof learningUpdates.cadence_days !== 'number') {
      addError(errors, 'learning_updates.cadence_days must be a number');
    }
  }
}

function validatePermissions(config, errors) {
  if (!requireType(config.permission, 'object', 'permission', errors)) return;

  for (const [permName, permValue] of Object.entries(config.permission)) {
    if (typeof permValue !== 'string') {
      addError(errors, `permission.${permName} must be a string`);
    }
  }
}

function validateRequiredTopLevel(config, errors) {
  const required = ['provider', 'mcp', 'permission'];
  for (const key of required) {
    if (!(key in config)) {
      addError(errors, `missing required top-level field '${key}'`);
    }
  }
}

function validateOpencodeConfig(config, options = {}) {
  const errors = [];
  const warnings = [];
  const includeWarnings = options.includeWarnings !== false;

  if (!isPlainObject(config)) {
    return {
      ok: false,
      errors: ['root config must be an object'],
      warnings: []
    };
  }

  validateRequiredTopLevel(config, errors);

  if ('schema_version' in config) {
    const kind = typeof config.schema_version;
    if (kind !== 'string' && kind !== 'number') {
      addError(errors, 'schema_version must be a string or number');
    }
  } else {
    addWarning(warnings, 'schema_version missing; accepted for backward compatibility');
  }

  if ('plugin' in config) {
    validateStringArray(config.plugin, 'plugin', errors);
  }

  if ('provider' in config) {
    requireType(config.provider, 'object', 'provider', errors);
  }

  validateMcp(config, errors);
  validatePermissions(config, errors);
  validateCommands(config, errors);

  const knownSkills = collectKnownSkills(config, errors);
  const modelRefs = collectKnownModels(config, errors);

  if ('default_model' in config) {
    validateModelReference(config.default_model, 'default_model', modelRefs, errors);
  }

  validateAgents(config, knownSkills, modelRefs, errors);
  validateLearningUpdates(config, errors, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings: includeWarnings ? warnings : []
  };
}

function validateOpencodeConfigFile(filePath, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      errors: [`Failed to parse JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`],
      warnings: []
    };
  }

  return validateOpencodeConfig(parsed, options);
}

function printResult(result, options = {}) {
  const { json = false, quiet = false } = options;
  if (quiet) return;

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.ok) {
    process.stdout.write('opencode-schema: PASS\n');
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        process.stdout.write(`WARN: ${warning}\n`);
      }
    }
    return;
  }

  process.stderr.write(`opencode-schema: FAIL (${result.errors.length} error${result.errors.length === 1 ? '' : 's'})\n`);
  for (const error of result.errors) {
    process.stderr.write(`- ${error}\n`);
  }
  for (const warning of result.warnings) {
    process.stderr.write(`WARN: ${warning}\n`);
  }
}

function resolveArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function runCli(argv = process.argv.slice(2)) {
  const fileArg = resolveArg(argv, '--file');
  const filePath = fileArg ? path.resolve(process.cwd(), fileArg) : path.join(__dirname, 'opencode.json');
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');

  const result = validateOpencodeConfigFile(filePath);
  printResult(result, { json, quiet });
  process.exitCode = result.ok ? 0 : 1;
  return result;
}

module.exports = {
  validateOpencodeConfig,
  validateOpencodeConfigFile,
  runCli
};

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`opencode-schema: FAIL (${error instanceof Error ? error.message : String(error)})\n`);
    process.exit(1);
  }
}
