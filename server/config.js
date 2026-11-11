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

/** Cache-Control value. 0 or less means no-cache. */
function cacheControl(seconds, { immutable = false } = {}) {
  const value = Math.floor(Number(seconds));
  if (!Number.isFinite(value) || value <= 0) {
    return 'no-cache';
  }
  const header = `public, max-age=${value}`;
  return immutable ? `${header}, immutable` : header;
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
    // Cache-Control max-age in seconds. 0 means no-cache.
    cacheSitemapSeconds: numberFromEnv(env.CACHE_SITEMAP_SECONDS, 3600),
    cacheRobotsSeconds: numberFromEnv(env.CACHE_ROBOTS_SECONDS, 3600),
    cachePostsApiSeconds: numberFromEnv(env.CACHE_POSTS_API_SECONDS, 300),
    cacheStaticSeconds: numberFromEnv(env.CACHE_STATIC_SECONDS, 3600),
    cacheAssetsSeconds: numberFromEnv(env.CACHE_ASSETS_SECONDS, 31536000),
    cacheRedirectSeconds: numberFromEnv(env.CACHE_REDIRECT_SECONDS, 3600),
    // Importer (scripts/import-medium.js). The server process ignores these.
    mediumFetchTimeoutMs: numberFromEnv(env.MEDIUM_FETCH_TIMEOUT_MS, 20000),
    chromeTimeoutMs: numberFromEnv(env.CHROME_TIMEOUT_MS, 60000),
    chromeVirtualTimeBudgetMs: numberFromEnv(
      env.CHROME_VIRTUAL_TIME_BUDGET_MS,
      15000,
    ),
    importPushTimeoutMs: numberFromEnv(env.IMPORT_PUSH_TIMEOUT_MS, 60000),
    importRemoteIdsTimeoutMs: numberFromEnv(
      env.IMPORT_REMOTE_IDS_TIMEOUT_MS,
      30000,
    ),
    importDelayMs: numberFromEnv(env.IMPORT_DELAY_MS, 1500),
    mediumUserAgent: env.MEDIUM_USER_AGENT || '',
  };
}

module.exports = { getConfig, cacheControl, numberFromEnv, ROOT };
