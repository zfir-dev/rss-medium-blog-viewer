'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function numberFromEnv(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getConfig(env = process.env) {
  const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
  return {
    port: numberFromEnv(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    distDir: path.resolve(ROOT, env.DIST_DIR || 'dist'),
    dataDir,
    // Relative paths are resolved inside DATA_DIR.
    archivePath: path.resolve(dataDir, env.ARCHIVE_FILE || 'posts.json'),
    // Public URL of the site, e.g. https://blog.example.com. When unset it is
    // derived from the request (Host / X-Forwarded-* headers).
    siteUrl: env.SITE_URL ? env.SITE_URL.replace(/\/+$/, '') : '',
    pageTitle: env.PAGE_TITLE || '',
    siteDescription: env.SITE_DESCRIPTION || '',
    iconUrl: env.ICON_URL || '',
    feedUrl: env.MEDIUM_FEED_URL || '',
    rss2JsonApiKey: env.RSS_2_JSON_API_KEY || '',
    // Minutes between feed refreshes. 0 disables periodic refresh (startup
    // refresh still happens).
    refreshIntervalMinutes: numberFromEnv(
      env.FEED_REFRESH_INTERVAL_MINUTES,
      60,
    ),
    fetchTimeoutMs: numberFromEnv(env.FEED_FETCH_TIMEOUT_MS, 15000),
    // Bearer token for POST /api/import. Unset = endpoint disabled.
    importToken: env.IMPORT_TOKEN || '',
    importMaxBytes: numberFromEnv(env.IMPORT_MAX_BYTES, 5 * 1024 * 1024),
    importMaxPosts: numberFromEnv(env.IMPORT_MAX_POSTS, 100),
    // Seconds between checks for external changes to the archive file.
    archiveReloadSeconds: Math.max(
      1,
      numberFromEnv(env.ARCHIVE_RELOAD_SECONDS, 10),
    ),
  };
}

module.exports = { getConfig, ROOT };
