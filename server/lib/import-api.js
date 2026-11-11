'use strict';

const crypto = require('crypto');
const { escapeHtml, safeHttpUrl } = require('./text');
const { getPostId } = require('./posts');
const {
  stripQuery,
  getMediumPostId,
  mediumGuid,
  sanitizeHtml,
  toRssDate,
} = require('./medium');

const LIMITS = {
  title: 500,
  guid: 500,
  author: 200,
  html: 1024 * 1024,
  categories: 50,
  category: 100,
};

/** Constant-time comparison of a presented bearer token with the secret. */
function tokenMatches(presented, secret) {
  if (typeof presented !== 'string' || !presented || !secret) {
    return false;
  }
  // Hash both sides so lengths match and timingSafeEqual never throws.
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(String(secret)).digest();
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function cleanString(value, max) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > max ? null : value.trim();
}

/**
 * Validate and sanitize one incoming post.
 * @returns {{post?: object, error?: string}}
 */
function validatePost(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'post must be an object' };
  }
  const title = cleanString(input.title, LIMITS.title);
  if (!title) {
    return { error: `title is required (max ${LIMITS.title} chars)` };
  }
  const link = safeHttpUrl(stripQuery(input.link || '') || '');
  if (!link) {
    return { error: 'link must be an absolute http(s) URL' };
  }
  let guid = cleanString(input.guid, LIMITS.guid);
  if (guid === null) {
    return { error: `guid must be a string (max ${LIMITS.guid} chars)` };
  }
  if (!guid) {
    const mediumId = getMediumPostId(link);
    guid = mediumId ? mediumGuid(mediumId) : link;
  }
  const author = cleanString(input.author, LIMITS.author);
  if (author === null) {
    return { error: `author must be a string (max ${LIMITS.author} chars)` };
  }
  const description = cleanString(input.description, LIMITS.html);
  const content = cleanString(input.content, LIMITS.html);
  if (description === null || content === null) {
    return { error: 'description/content must be strings (max 1 MB each)' };
  }
  let categories = input.categories ?? [];
  if (
    !Array.isArray(categories) ||
    categories.length > LIMITS.categories ||
    categories.some((c) => typeof c !== 'string' || c.length > LIMITS.category)
  ) {
    return {
      error: `categories must be an array of up to ${LIMITS.categories} strings`,
    };
  }
  categories = [...new Set(categories.map((c) => c.trim()).filter(Boolean))];
  const pubDate =
    typeof input.pubDate === 'string' && input.pubDate
      ? toRssDate(
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input.pubDate)
            ? `${input.pubDate.replace(' ', 'T')}Z`
            : input.pubDate,
        )
      : '';
  if (input.pubDate && !pubDate) {
    return { error: 'pubDate must be a valid date' };
  }

  return {
    post: {
      guid,
      link,
      title,
      pubDate,
      author,
      thumbnail: safeHttpUrl(input.thumbnail) || '',
      description: sanitizeHtml(description),
      content: sanitizeHtml(content),
      categories,
    },
  };
}

/**
 * Validate a request body.
 * @returns {{posts?: object[], invalid?: object[], overwrite?: boolean, error?: string}}
 */
function validatePayload(body, { maxPosts }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'body must be a JSON object like {"posts": [...]}' };
  }
  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return { error: '"posts" must be a non-empty array' };
  }
  if (body.posts.length > maxPosts) {
    return { error: `too many posts: max ${maxPosts} per request` };
  }
  if (body.overwrite !== undefined && typeof body.overwrite !== 'boolean') {
    return { error: '"overwrite" must be a boolean' };
  }
  const posts = [];
  const invalid = [];
  body.posts.forEach((input, index) => {
    const { post, error } = validatePost(input);
    if (post) {
      posts.push(post);
    } else {
      invalid.push({ index, error });
    }
  });
  return { posts, invalid, overwrite: body.overwrite === true };
}

/**
 * Merge validated posts into the archive. Existing posts are skipped unless
 * overwrite is true (then they are updated when something changed).
 */
function importPosts(
  archive,
  posts,
  { overwrite = false, now = new Date() } = {},
) {
  const fresh = [];
  let skipped = 0;
  const seen = new Set();
  for (const post of posts) {
    const id = getPostId(post);
    if (seen.has(id) || (!overwrite && archive.get(id))) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    fresh.push(post);
  }
  const stats = fresh.length
    ? archive.merge(fresh, now, { markFetched: false })
    : { added: 0, updated: 0, unchanged: 0 };
  return {
    added: stats.added,
    updated: stats.updated,
    skipped: skipped + stats.unchanged,
  };
}

const EXAMPLE_BODY = {
  overwrite: false,
  posts: [
    {
      title: 'Creating a VM on Oracle Cloud (Using Always Free Resources)',
      link: 'https://medium.com/spoon-consulting/creating-a-vm-on-oracle-cloud-using-always-free-resources-8ae23c507403',
      guid: 'https://medium.com/p/8ae23c507403',
      pubDate: '2023-11-15 10:11:55',
      author: 'Jane Doe',
      thumbnail: 'https://miro.medium.com/v2/resize:fit:1200/1*example.png',
      description: '<p>Short summary or the article HTML.</p>',
      content: '<h2>Always Free Resources</h2><p>Article HTML…</p>',
      categories: ['oracle', 'oracle-cloud'],
    },
  ],
};

const EXAMPLE_RESPONSE = {
  added: 1,
  updated: 0,
  skipped: 0,
  invalid: [],
  total: 25,
};

function helpInfo({ siteUrl, enabled, maxPosts, maxBytes }) {
  const endpoint = `${String(siteUrl).replace(/\/+$/, '')}/api/import`;
  const curl = [
    `curl -X POST '${endpoint}' \\`,
    `  -H "Authorization: Bearer $IMPORT_TOKEN" \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  --data @posts.json`,
  ].join('\n');
  return {
    endpoint,
    enabled,
    status: enabled
      ? 'enabled'
      : 'disabled (set IMPORT_TOKEN on the server to enable it)',
    method: 'POST',
    headers: {
      Authorization: 'Bearer <IMPORT_TOKEN>',
      'Content-Type': 'application/json',
    },
    limits: { maxPosts, maxBytes },
    fields: {
      title: 'required, string',
      link: 'required, absolute http(s) URL (query string is removed)',
      guid: 'optional; derived from a Medium link as https://medium.com/p/<id>',
      pubDate: 'optional, ISO date or "YYYY-MM-DD HH:mm:ss" (UTC)',
      author: 'optional, string',
      thumbnail: 'optional, absolute http(s) image URL',
      description: 'optional, HTML (sanitized)',
      content: 'optional, HTML (sanitized)',
      categories: 'optional, array of strings',
      overwrite:
        'optional top-level boolean; when true, existing posts are updated instead of skipped',
    },
    exampleBody: EXAMPLE_BODY,
    exampleResponse: EXAMPLE_RESPONSE,
    exampleCurl: curl,
    importer: `IMPORT_TOKEN=... npm run import:medium -- --profile --push ${String(
      siteUrl,
    ).replace(/\/+$/, '')}`,
  };
}

function renderHelpHtml(info) {
  const pre = (value) =>
    `<pre>${escapeHtml(
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    )}</pre>`;
  const rows = Object.entries(info.fields)
    .map(
      ([name, text]) =>
        `<tr><td><code>${escapeHtml(name)}</code></td><td>${escapeHtml(
          text,
        )}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Import API</title>
<style>
body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#222}
pre{background:#f5f5f5;padding:1rem;overflow:auto;border-radius:6px}
code{background:#f5f5f5;padding:0 .25rem;border-radius:3px}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #eee;padding:.35rem;vertical-align:top}
.status{display:inline-block;padding:.15rem .6rem;border-radius:999px;color:#fff;background:${
    info.enabled ? '#1a7f37' : '#9a6700'
  }}
</style>
</head>
<body>
<h1>Import API</h1>
<p>Status: <span class="status">${escapeHtml(info.status)}</span></p>
<p>Push posts into this site's archive (for example posts older than the last 10 in the Medium RSS feed). Posts are merged by <code>guid</code> and never deleted.</p>
<h2>Request</h2>
<p><code>POST ${escapeHtml(info.endpoint)}</code></p>
${pre(
  Object.entries(info.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n'),
)}
<p>Limits: up to ${escapeHtml(info.limits.maxPosts)} posts and ${escapeHtml(
    Math.round(info.limits.maxBytes / 1024 / 1024),
  )} MB per request.</p>
<h2>Fields</h2>
<table>${rows}</table>
<h2>Example body</h2>
${pre(info.exampleBody)}
<h2>Example curl</h2>
${pre(info.exampleCurl)}
<h2>Example response</h2>
${pre(info.exampleResponse)}
<p>Errors: <code>400</code> invalid JSON or body, <code>401</code> missing or wrong token, <code>403</code> endpoint disabled, <code>413</code> body too large.</p>
<h2>Using the importer</h2>
${pre(info.importer)}
</body>
</html>
`;
}

module.exports = {
  tokenMatches,
  bearerToken,
  validatePost,
  validatePayload,
  importPosts,
  helpInfo,
  renderHelpHtml,
};
