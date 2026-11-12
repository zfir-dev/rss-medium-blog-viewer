'use strict';

const fs = require('fs');

/**
 * Strip wrapping quotes and unescape \\, \', and \". Hosts often store
 * values like Zafir\'s Blog, which would otherwise show a visible backslash.
 */
function normalizeEnvValue(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  let text = String(value).trim();
  if (text === '') {
    return fallback;
  }
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1);
  }
  return text.replace(/\\([\\'"])/g, '$1');
}

/**
 * Minimal .env loader (KEY=value, optional quotes, # comments). Values already
 * present in process.env win, so real environment variables (e.g. from Docker or the host) take precedence.
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
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (!quoted) {
      value = value.replace(/\s+#.*$/, '');
    }
    if (env[key] === undefined) {
      env[key] = normalizeEnvValue(value);
    }
  }
  return true;
}

module.exports = { loadEnvFile, normalizeEnvValue };
