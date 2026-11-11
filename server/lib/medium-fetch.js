'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { isChallengePage, parseMediumPost } = require('./medium');

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const CHROME_CANDIDATES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findOnPath(command) {
  if (command.includes('/')) {
    return fs.existsSync(command) ? command : null;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Path to a Chrome/Chromium binary (CHROME_PATH wins), or null. */
function findChrome(explicit = process.env.CHROME_PATH) {
  if (explicit) {
    return findOnPath(explicit);
  }
  for (const candidate of CHROME_CANDIDATES) {
    const found = findOnPath(candidate);
    if (found) {
      return found;
    }
  }
  return null;
}

async function fetchText(
  url,
  { timeoutMs = 20000, userAgent = BROWSER_UA } = {},
) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  return { status: response.status, text: await response.text() };
}

/** Render a page in headless Chrome and return the DOM (passes JS challenges). */
function fetchWithChrome(
  url,
  chromePath,
  {
    timeoutMs = 60000,
    virtualTimeBudgetMs = 15000,
    userAgent = BROWSER_UA,
  } = {},
) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--virtual-time-budget=${virtualTimeBudgetMs}`,
    `--user-agent=${userAgent}`,
    '--dump-dom',
    url,
  ];
  // Root, or hosts that restrict user namespaces (e.g. Ubuntu 24.04 CI
  // runners), need --no-sandbox; opt in with CHROME_NO_SANDBOX=1.
  if (
    process.env.CHROME_NO_SANDBOX === '1' ||
    (typeof process.getuid === 'function' && process.getuid() === 0)
  ) {
    args.unshift('--no-sandbox');
  }
  return new Promise((resolve, reject) => {
    execFile(
      chromePath,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) {
          reject(error);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/** Raw (un-rewritten) HTML of the latest Wayback Machine snapshot, or null. */
async function fetchFromWayback(url, options) {
  const lookup = await fetchText(
    `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    options,
  );
  if (lookup.status !== 200) {
    throw new Error(`Wayback lookup failed with status ${lookup.status}`);
  }
  const data = JSON.parse(lookup.text);
  const snapshot =
    data && data.archived_snapshots && data.archived_snapshots.closest;
  if (!snapshot || !snapshot.available || !snapshot.url) {
    return null;
  }
  const raw = snapshot.url.replace(/\/web\/(\d+)\//, '/web/$1id_/');
  const page = await fetchText(raw, options);
  return page.status === 200 ? page.text : null;
}

/**
 * Fetch and parse a Medium post, trying in order: a plain request, headless
 * Chrome (Medium sits behind a Cloudflare challenge), the Wayback Machine.
 *
 * @returns {Promise<{post: object, html: string, via: string}>}
 */
async function fetchMediumPost(url, options = {}) {
  const { chromePath = null, wayback = true, log = () => {} } = options;
  const attempts = [];

  try {
    const { status, text } = await fetchText(url, options);
    const post = status === 200 ? parseMediumPost(text, url) : null;
    if (post) {
      return { post, html: text, via: 'direct' };
    }
    attempts.push(
      `direct: HTTP ${status}${
        isChallengePage(text) ? ' (Cloudflare challenge)' : ''
      }`,
    );
  } catch (error) {
    attempts.push(`direct: ${error.message}`);
  }

  if (chromePath) {
    try {
      log(`  trying headless Chrome (${chromePath})`);
      const html = await fetchWithChrome(url, chromePath, {
        ...options,
        timeoutMs: options.chromeTimeoutMs ?? options.timeoutMs ?? 60000,
      });
      const post = parseMediumPost(html, url);
      if (post) {
        return { post, html, via: 'chrome' };
      }
      attempts.push(
        `chrome: ${
          isChallengePage(html)
            ? 'Cloudflare challenge'
            : 'not a Medium post page'
        }`,
      );
    } catch (error) {
      attempts.push(`chrome: ${error.message}`);
    }
  } else {
    attempts.push('chrome: not available (set CHROME_PATH or use --chrome)');
  }

  if (wayback) {
    try {
      log('  trying the Wayback Machine');
      const html = await fetchFromWayback(url, options);
      const post = html ? parseMediumPost(html, url) : null;
      if (post) {
        return { post, html, via: 'wayback' };
      }
      attempts.push(
        html ? 'wayback: not a Medium post page' : 'wayback: no snapshot',
      );
    } catch (error) {
      attempts.push(`wayback: ${error.message}`);
    }
  }

  throw new Error(`could not fetch ${url} (${attempts.join('; ')})`);
}

module.exports = {
  fetchMediumPost,
  fetchText,
  findChrome,
};
