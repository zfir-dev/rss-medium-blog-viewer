'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { getConfig, cacheControl, numberFromEnv, ROOT } = require('../config');

test('numberFromEnv', () => {
  assert.equal(numberFromEnv(undefined, 10), 10);
  assert.equal(numberFromEnv('', 10), 10);
  assert.equal(numberFromEnv('0', 10), 0);
  assert.equal(numberFromEnv('3600', 10), 3600);
  assert.equal(numberFromEnv('nope', 10), 10);
});

test('cacheControl', () => {
  assert.equal(cacheControl(3600), 'public, max-age=3600');
  assert.equal(
    cacheControl(31536000, { immutable: true }),
    'public, max-age=31536000, immutable',
  );
  assert.equal(cacheControl(0), 'no-cache');
  assert.equal(cacheControl('0'), 'no-cache');
  assert.equal(cacheControl(-1), 'no-cache');
  assert.equal(cacheControl(undefined), 'no-cache');
  assert.equal(cacheControl(3600.9), 'public, max-age=3600');
});

test('getConfig defaults', () => {
  const config = getConfig({});
  assert.equal(config.cacheSitemapSeconds, 3600);
  assert.equal(config.cacheRobotsSeconds, 3600);
  assert.equal(config.cachePostsApiSeconds, 300);
  assert.equal(config.cacheStaticSeconds, 3600);
  assert.equal(config.cacheAssetsSeconds, 31536000);
  assert.equal(config.cacheRedirectSeconds, 3600);
  assert.equal(config.mediumFetchTimeoutMs, 20000);
  assert.equal(config.chromeTimeoutMs, 60000);
  assert.equal(config.chromeVirtualTimeBudgetMs, 15000);
  assert.equal(config.importPushTimeoutMs, 60000);
  assert.equal(config.importRemoteIdsTimeoutMs, 30000);
  assert.equal(config.importDelayMs, 1500);
  assert.equal(config.mediumUserAgent, '');
  assert.equal(config.port, 3000);
  assert.ok(config.archivePath.startsWith(path.resolve(ROOT, 'data')));
});

test('getConfig reads cache and importer env vars', () => {
  const config = getConfig({
    CACHE_SITEMAP_SECONDS: '120',
    CACHE_ROBOTS_SECONDS: '0',
    CACHE_POSTS_API_SECONDS: '60',
    CACHE_STATIC_SECONDS: '90',
    CACHE_ASSETS_SECONDS: '86400',
    CACHE_REDIRECT_SECONDS: '15',
    MEDIUM_FETCH_TIMEOUT_MS: '8000',
    CHROME_TIMEOUT_MS: '45000',
    CHROME_VIRTUAL_TIME_BUDGET_MS: '5000',
    IMPORT_PUSH_TIMEOUT_MS: '12000',
    IMPORT_REMOTE_IDS_TIMEOUT_MS: '9000',
    IMPORT_DELAY_MS: '2500',
    MEDIUM_USER_AGENT: 'TestUA/1.0',
    CACHE_SITEMAP_SECONDS_INVALID_IGNORED: 'x',
  });
  assert.equal(config.cacheSitemapSeconds, 120);
  assert.equal(config.cacheRobotsSeconds, 0);
  assert.equal(config.cachePostsApiSeconds, 60);
  assert.equal(config.cacheStaticSeconds, 90);
  assert.equal(config.cacheAssetsSeconds, 86400);
  assert.equal(config.cacheRedirectSeconds, 15);
  assert.equal(config.mediumFetchTimeoutMs, 8000);
  assert.equal(config.chromeTimeoutMs, 45000);
  assert.equal(config.chromeVirtualTimeBudgetMs, 5000);
  assert.equal(config.importPushTimeoutMs, 12000);
  assert.equal(config.importRemoteIdsTimeoutMs, 9000);
  assert.equal(config.importDelayMs, 2500);
  assert.equal(config.mediumUserAgent, 'TestUA/1.0');
});

test('getConfig falls back when an env value is invalid', () => {
  const config = getConfig({
    CACHE_SITEMAP_SECONDS: 'nope',
    IMPORT_DELAY_MS: '',
  });
  assert.equal(config.cacheSitemapSeconds, 3600);
  assert.equal(config.importDelayMs, 1500);
});
