'use strict';

const fs = require('fs');
const path = require('path');
const { buildSeo, injectSeo } = require('./lib/seo');
const { renderSitemap, renderRobots } = require('./lib/sitemap');
const {
  resolveStaticFile,
  sendStaticFile,
  sendBuffer,
} = require('./lib/static');
const {
  tokenMatches,
  bearerToken,
  validatePayload,
  importPosts,
  helpInfo,
  renderHelpHtml,
} = require('./lib/import-api');
const { parsePostRef, getPostPath } = require('./lib/slug');
const { cacheControl } = require('./config');

const SAFE_HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

function firstHeader(value) {
  return String(Array.isArray(value) ? value[0] : value || '')
    .split(',')[0]
    .trim();
}

/** Public base URL: SITE_URL, else derived from proxy/Host headers. */
function getSiteUrl(req, config) {
  if (config.siteUrl) {
    return config.siteUrl;
  }
  const proto =
    firstHeader(req.headers['x-forwarded-proto']) === 'https'
      ? 'https'
      : req.socket && req.socket.encrypted
        ? 'https'
        : 'http';
  const host =
    firstHeader(req.headers['x-forwarded-host']) ||
    firstHeader(req.headers.host);
  return `${proto}://${SAFE_HOST.test(host) ? host : 'localhost'}`;
}

function createIndexLoader(distDir) {
  const indexPath = path.join(distDir, 'index.html');
  let cached = null;
  let cachedMtime = 0;
  return function loadIndex() {
    const stat = fs.statSync(indexPath);
    if (!cached || stat.mtimeMs !== cachedMtime) {
      cached = fs.readFileSync(indexPath, 'utf8');
      cachedMtime = stat.mtimeMs;
    }
    return cached;
  };
}

/**
 * Build the HTTP request handler.
 *
 * @param {object} options
 * @param {object} options.config  see server/config.js
 * @param {import('./lib/archive').Archive} options.archive
 * @param {() => string} [options.loadIndex] returns the built index.html
 */
function createHandler({ config, archive, loadIndex }) {
  const getIndex = loadIndex || createIndexLoader(config.distDir);

  function renderPage(req, res, { post = null, status = 200 } = {}) {
    const seo = buildSeo({
      post,
      siteUrl: getSiteUrl(req, config),
      pageTitle: config.pageTitle,
      iconUrl: config.iconUrl,
      siteDescription: config.siteDescription,
    });
    if (status === 404) {
      seo.noindex = true;
    }
    const html = injectSeo(getIndex(), seo);
    sendBuffer(req, res, status, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
  }

  function sendJson(req, res, status, data, headers = {}) {
    sendBuffer(req, res, status, JSON.stringify(data), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
  }

  function importHelp(req, res) {
    const info = helpInfo({
      siteUrl: getSiteUrl(req, config),
      enabled: Boolean(config.importToken),
      maxPosts: config.importMaxPosts || 100,
      maxBytes: config.importMaxBytes || 5 * 1024 * 1024,
    });
    const accept = String(req.headers.accept || '');
    if (/application\/json/.test(accept) && !/text\/html/.test(accept)) {
      sendJson(req, res, 200, info);
      return;
    }
    sendBuffer(req, res, 200, renderHelpHtml(info), {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    });
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.resume();
        return;
      }
      const chunks = [];
      let size = 0;
      let failed = false;
      req.on('data', (chunk) => {
        if (failed) {
          return;
        }
        size += chunk.length;
        if (size > limit) {
          failed = true;
          reject(Object.assign(new Error('body too large'), { status: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (!failed) {
          resolve(Buffer.concat(chunks).toString('utf8'));
        }
      });
      req.on('error', (error) => {
        if (!failed) {
          failed = true;
          reject(error);
        }
      });
    });
  }

  async function importEndpoint(req, res) {
    if (!config.importToken) {
      sendJson(req, res, 403, {
        error:
          'Import endpoint is disabled. Set IMPORT_TOKEN on the server to enable it.',
      });
      req.resume();
      return;
    }
    if (!tokenMatches(bearerToken(req), config.importToken)) {
      sendJson(
        req,
        res,
        401,
        {
          error:
            'Missing or invalid token. Send "Authorization: Bearer <IMPORT_TOKEN>".',
        },
        { 'WWW-Authenticate': 'Bearer realm="import"' },
      );
      req.resume();
      return;
    }
    if (
      !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))
    ) {
      sendJson(req, res, 400, {
        error: 'Content-Type must be application/json',
      });
      req.resume();
      return;
    }
    const maxBytes = config.importMaxBytes || 5 * 1024 * 1024;
    let raw;
    try {
      raw = await readBody(req, maxBytes);
    } catch (error) {
      sendJson(req, res, error.status || 400, {
        error:
          error.status === 413
            ? `Body too large (max ${maxBytes} bytes)`
            : 'Could not read request body',
      });
      return;
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      sendJson(req, res, 400, { error: 'Body is not valid JSON' });
      return;
    }
    const { posts, invalid, overwrite, error } = validatePayload(body, {
      maxPosts: config.importMaxPosts || 100,
    });
    if (error) {
      sendJson(req, res, 400, { error });
      return;
    }
    if (!posts.length) {
      sendJson(req, res, 400, { error: 'No valid posts', invalid });
      return;
    }
    // Pick up external changes first so the save below never drops them.
    if (typeof archive.reloadIfChanged === 'function') {
      archive.reloadIfChanged();
    }
    const stats = importPosts(archive, posts, { overwrite });
    if (stats.added || stats.updated) {
      archive.save();
    }
    console.log(
      `[import] ${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped, ${invalid.length} invalid (${archive.size} total)`,
    );
    sendJson(req, res, 200, { ...stats, invalid, total: archive.size });
  }

  return function handler(req, res) {
    try {
      if (req.url.split('?')[0] === '/api/import') {
        if (req.method === 'POST') {
          importEndpoint(req, res).catch((error) => {
            console.error('[import] failed:', error);
            if (!res.headersSent) {
              sendJson(req, res, 500, { error: 'Import failed' });
            }
          });
          return;
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
          importHelp(req, res);
          return;
        }
        res.writeHead(405, { Allow: 'GET, HEAD, POST' });
        res.end();
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }

      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      if (pathname === '/healthz') {
        sendBuffer(
          req,
          res,
          200,
          JSON.stringify({ status: 'ok', posts: archive.size }),
          {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        );
        return;
      }

      if (pathname === '/api/posts') {
        const body = JSON.stringify({
          status: 'ok',
          source: 'archive',
          lastFetchAt: archive.lastFetchAt,
          items: archive.listPublic(),
        });
        sendBuffer(req, res, 200, body, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': cacheControl(config.cachePostsApiSeconds ?? 300),
        });
        return;
      }

      if (pathname === '/sitemap.xml') {
        sendBuffer(
          req,
          res,
          200,
          renderSitemap(archive.list(), getSiteUrl(req, config)),
          {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': cacheControl(config.cacheSitemapSeconds ?? 3600),
          },
        );
        return;
      }

      if (pathname === '/robots.txt') {
        sendBuffer(req, res, 200, renderRobots(getSiteUrl(req, config)), {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': cacheControl(config.cacheRobotsSeconds ?? 3600),
        });
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        renderPage(req, res);
        return;
      }

      // Post pages: /posts/<slug>-<mediumId>, resolved by the trailing id.
      const postMatch = /^\/posts\/([^/]+)\/?$/.exec(pathname);
      if (postMatch) {
        let ref;
        try {
          ref = decodeURIComponent(postMatch[1]);
        } catch {
          ref = '';
        }
        const post = archive.findByShortId(parsePostRef(ref));
        if (!post) {
          renderPage(req, res, { status: 404 });
          return;
        }
        const canonicalPath = getPostPath(post);
        if (pathname !== canonicalPath) {
          res.writeHead(301, {
            Location: `${canonicalPath}${url.search}`,
            'Cache-Control': cacheControl(config.cacheRedirectSeconds ?? 3600),
          });
          res.end();
          return;
        }
        renderPage(req, res, { post });
        return;
      }

      const file = resolveStaticFile(config.distDir, pathname);
      if (file) {
        sendStaticFile(req, res, file, config.distDir, {
          cacheAssetsSeconds: config.cacheAssetsSeconds ?? 31536000,
          cacheStaticSeconds: config.cacheStaticSeconds ?? 3600,
        });
        return;
      }

      // Missing assets should 404 rather than fall back to the app shell.
      if (
        pathname.startsWith('/assets/') ||
        /\.[a-z0-9]{1,8}$/i.test(pathname)
      ) {
        sendBuffer(req, res, 404, 'Not found', {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        return;
      }

      // SPA fallback (history location).
      renderPage(req, res);
    } catch (error) {
      console.error('[server] request failed:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal server error');
    }
  };
}

module.exports = { createHandler, getSiteUrl, createIndexLoader };
