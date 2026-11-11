'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function contentType(filePath) {
  return (
    MIME_TYPES[path.extname(filePath).toLowerCase()] ||
    'application/octet-stream'
  );
}

function isCompressible(type) {
  return /^(text\/|application\/(json|xml|manifest)|image\/svg)/.test(type);
}

function acceptsGzip(req) {
  return /\bgzip\b/.test(req.headers['accept-encoding'] || '');
}

/**
 * Resolve a URL pathname to a regular file inside rootDir, or null.
 * Rejects traversal outside rootDir and dotfiles.
 */
function resolveStaticFile(rootDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }
  const root = path.resolve(rootDir);
  const filePath = path.resolve(
    root,
    `.${path.posix.normalize(`/${decoded}`)}`,
  );
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return null;
  }
  if (
    path
      .relative(root, filePath)
      .split(path.sep)
      .some((p) => p.startsWith('.'))
  ) {
    return null;
  }
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? { filePath, stat } : null;
  } catch {
    return null;
  }
}

const gzipCache = new Map();

function sendBuffer(req, res, status, body, headers = {}) {
  const type = headers['Content-Type'] || 'application/octet-stream';
  let payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const outHeaders = {
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };
  if (isCompressible(type) && payload.length > 1024) {
    outHeaders.Vary = 'Accept-Encoding';
    if (acceptsGzip(req)) {
      payload = headers['X-Gzip-Cache-Key']
        ? cachedGzip(headers['X-Gzip-Cache-Key'], payload)
        : zlib.gzipSync(payload);
      outHeaders['Content-Encoding'] = 'gzip';
    }
  }
  delete outHeaders['X-Gzip-Cache-Key'];
  outHeaders['Content-Length'] = payload.length;
  res.writeHead(status, outHeaders);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function cachedGzip(key, payload) {
  let gz = gzipCache.get(key);
  if (!gz) {
    gz = zlib.gzipSync(payload);
    if (gzipCache.size > 200) {
      gzipCache.clear();
    }
    gzipCache.set(key, gz);
  }
  return gz;
}

function sendStaticFile(req, res, { filePath, stat }, rootDir) {
  const relative = path.relative(rootDir, filePath).split(path.sep).join('/');
  // Ember fingerprints everything in assets/, so it can be cached forever.
  const cacheControl = relative.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
    res.end();
    return;
  }
  const body = fs.readFileSync(filePath);
  sendBuffer(req, res, 200, body, {
    'Content-Type': contentType(filePath),
    'Cache-Control': cacheControl,
    ETag: etag,
    'X-Gzip-Cache-Key': `${filePath}:${stat.mtimeMs}`,
  });
}

module.exports = { resolveStaticFile, sendStaticFile, sendBuffer, contentType };
