'use strict';

function endpoint(serverUrl, pathname) {
  const base = String(serverUrl).replace(/\/+$/, '');
  return new URL(`${base}/${pathname.replace(/^\/+/, '')}`).toString();
}

/** Ids of posts already on the server (from GET /api/posts). */
async function fetchRemoteIds(
  serverUrl,
  { fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {},
) {
  const response = await fetchImpl(endpoint(serverUrl, 'api/posts'), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GET /api/posts failed with status ${response.status}`);
  }
  const data = await response.json();
  return new Set(
    (data.items || []).map((p) => p.id || p.guid || p.link || p.title),
  );
}

/** Split posts into batches by count and approximate JSON size. */
function makeBatches(
  posts,
  { batchSize = 10, maxBytes = 4 * 1024 * 1024 } = {},
) {
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const post of posts) {
    const size = Buffer.byteLength(JSON.stringify(post));
    if (
      current.length &&
      (current.length >= batchSize || bytes + size > maxBytes)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(post);
    bytes += size;
  }
  if (current.length) {
    batches.push(current);
  }
  return batches;
}

/**
 * POST posts to <serverUrl>/api/import in batches.
 * @returns {Promise<{added: number, updated: number, skipped: number, invalid: object[], total: number|null}>}
 */
async function pushPosts(
  serverUrl,
  token,
  posts,
  {
    overwrite = false,
    batchSize = 10,
    fetchImpl = globalThis.fetch,
    log = () => {},
    timeoutMs = 60000,
  } = {},
) {
  if (!token) {
    throw new Error('push needs a token: set IMPORT_TOKEN or pass --token');
  }
  const totals = { added: 0, updated: 0, skipped: 0, invalid: [], total: null };
  const url = endpoint(serverUrl, 'api/import');
  const batches = makeBatches(posts, { batchSize });
  for (let i = 0; i < batches.length; i++) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ overwrite, posts: batches[i] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      // non-JSON error page
    }
    if (!response.ok) {
      throw new Error(
        `POST ${url} failed with status ${response.status}${
          data && data.error ? `: ${data.error}` : ''
        }`,
      );
    }
    totals.added += data.added || 0;
    totals.updated += data.updated || 0;
    totals.skipped += data.skipped || 0;
    totals.invalid.push(...(data.invalid || []));
    totals.total = data.total ?? totals.total;
    log(
      `  pushed batch ${i + 1}/${batches.length}: ${data.added} added, ${
        data.updated
      } updated, ${data.skipped} skipped`,
    );
  }
  return totals;
}

module.exports = { pushPosts, fetchRemoteIds, makeBatches };
