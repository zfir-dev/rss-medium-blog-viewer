'use strict';

const fs = require('fs');

/**
 * Minimal .env loader (KEY=value, optional quotes, # comments). Values already
 * present in process.env win, so Docker/Coolify env vars take precedence.
 */
function loadEnvFile(filePath, env = process.env) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match =
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
  return true;
}

module.exports = { loadEnvFile };
