'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHandler } = require('../app');
const { Archive } = require('../lib/archive');
const {
  tokenMatches,
  validatePost,
  validatePayload,
} = require('../lib/import-api');

const TOKEN = 'test-token-123';

const goodPost = (overrides = {}) => ({
  title: 'Old Post',
  link: 'https://zfir.medium.com/old-post-1bc7178dc6dd?source=rss',
  pubDate: '2022-12-30T19:24:30Z',
  author: 'Zafir',
  thumbnail: 'https://miro.medium.com/1*a.png',
  description: '<p onclick="x()">Desc</p>',
  content: '<p>Body<script>alert(1)</script></p>',
  categories: ['capacitor', 'cordova'],
  ...overrides,
});

async function startServer(
  t,
  { importToken = TOKEN, maxBytes, maxPosts } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-test-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<html><head><!-- seo:start --><!-- seo:end --></head><body></body></html>',
  );
  const archive = new Archive(path.join(dir, 'data', 'posts.json'));
  archive.merge([
    {
      guid: 'https://medium.com/p/abcdef012345',
      title: 'Existing',
      link: 'https://zfir.medium.com/existing-abcdef012345',
    },
  ]);
  archive.save();
  const config = {
    distDir: dist,
    siteUrl: 'https://blog.example.com',
    pageTitle: 'Blog',
    importToken,
    importMaxBytes: maxBytes,
    importMaxPosts: maxPosts,
  };
  const server = http.createServer(createHandler({ config, archive }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, archive, dir };
}

function post(base, body, { token = TOKEN, type = 'application/json' } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (type) {
    headers['content-type'] = type;
  }
  return fetch(`${base}/api/import`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('tokenMatches is exact', () => {
  assert.ok(tokenMatches('abc', 'abc'));
  assert.ok(!tokenMatches('abd', 'abc'));
  assert.ok(!tokenMatches('abcd', 'abc'));
  assert.ok(!tokenMatches('', 'abc'));
  assert.ok(!tokenMatches('abc', ''));
  assert.ok(!tokenMatches(undefined, 'abc'));
});

test('validatePost sanitizes and derives the Medium guid', () => {
  const { post } = validatePost(goodPost());
  assert.equal(post.guid, 'https://medium.com/p/1bc7178dc6dd');
  assert.equal(post.link, 'https://zfir.medium.com/old-post-1bc7178dc6dd');
  assert.equal(post.pubDate, '2022-12-30 19:24:30');
  assert.equal(post.description, '<p>Desc</p>');
  assert.equal(post.content, '<p>Body</p>');

  assert.match(validatePost(goodPost({ title: '' })).error, /title/);
  assert.match(
    validatePost(goodPost({ link: 'javascript:alert(1)' })).error,
    /link/,
  );
  assert.match(
    validatePost(goodPost({ pubDate: 'yesterday-ish' })).error,
    /pubDate/,
  );
  assert.match(validatePost(goodPost({ categories: 'x' })).error, /categories/);
  assert.equal(
    validatePost(goodPost({ thumbnail: 'javascript:x' })).post.thumbnail,
    '',
  );
  assert.equal(
    validatePost(goodPost({ link: 'https://example.com/post' })).post.guid,
    'https://example.com/post',
  );
});

test('validatePayload checks shape and limits', () => {
  assert.match(validatePayload([], { maxPosts: 2 }).error, /object/);
  assert.match(
    validatePayload({ posts: [] }, { maxPosts: 2 }).error,
    /non-empty/,
  );
  assert.match(
    validatePayload({ posts: [1, 2, 3] }, { maxPosts: 2 }).error,
    /too many/,
  );
  assert.match(
    validatePayload({ posts: [goodPost()], overwrite: 'yes' }, { maxPosts: 2 })
      .error,
    /overwrite/,
  );
  const result = validatePayload(
    { posts: [goodPost(), { title: 'x' }] },
    { maxPosts: 5 },
  );
  assert.equal(result.posts.length, 1);
  assert.deepEqual(
    result.invalid.map((i) => i.index),
    [1],
  );
});

test('POST /api/import auth', async (t) => {
  const { base } = await startServer(t);

  let res = await post(base, { posts: [goodPost()] }, { token: null });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate'), /Bearer/);

  res = await post(base, { posts: [goodPost()] }, { token: 'wrong' });
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /invalid token/i);
});

test('POST /api/import is disabled without IMPORT_TOKEN', async (t) => {
  const { base } = await startServer(t, { importToken: '' });
  const res = await post(base, { posts: [goodPost()] });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /disabled/);
});

test('POST /api/import validation', async (t) => {
  const { base } = await startServer(t, { maxBytes: 2000, maxPosts: 3 });

  assert.equal((await post(base, '{not json')).status, 400);
  assert.equal(
    (await post(base, { posts: [goodPost()] }, { type: 'text/plain' })).status,
    400,
  );
  assert.equal((await post(base, { nope: true })).status, 400);
  assert.equal((await post(base, { posts: [1, 2, 3, 4] })).status, 400);
  const noValid = await post(base, { posts: [{ title: 'x' }] });
  assert.equal(noValid.status, 400);
  assert.equal((await noValid.json()).invalid.length, 1);
  const big = await post(base, {
    posts: [goodPost({ content: 'x'.repeat(5000) })],
  });
  assert.equal(big.status, 413);
});

test('POST /api/import merges, skips and overwrites', async (t) => {
  const { base, archive, dir } = await startServer(t);

  let res = await post(base, {
    posts: [
      goodPost(),
      {
        title: 'Existing (new title)',
        link: 'https://zfir.medium.com/existing-abcdef012345',
      },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    added: 1,
    updated: 0,
    skipped: 1,
    invalid: [],
    total: 2,
  });
  assert.equal(
    archive.get('https://medium.com/p/abcdef012345').title,
    'Existing',
  );

  // persisted to disk
  const onDisk = JSON.parse(
    fs.readFileSync(path.join(dir, 'data', 'posts.json'), 'utf8'),
  );
  assert.equal(onDisk.posts.length, 2);

  res = await post(base, {
    overwrite: true,
    posts: [
      {
        title: 'Existing (new title)',
        link: 'https://zfir.medium.com/existing-abcdef012345',
      },
    ],
  });
  assert.deepEqual(await res.json(), {
    added: 0,
    updated: 1,
    skipped: 0,
    invalid: [],
    total: 2,
  });
  assert.equal(
    archive.get('https://medium.com/p/abcdef012345').title,
    'Existing (new title)',
  );

  // re-sending identical data with overwrite is a no-op
  res = await post(base, {
    overwrite: true,
    posts: [
      {
        title: 'Existing (new title)',
        link: 'https://zfir.medium.com/existing-abcdef012345',
      },
    ],
  });
  assert.deepEqual(await res.json(), {
    added: 0,
    updated: 0,
    skipped: 1,
    invalid: [],
    total: 2,
  });

  // posts are visible through the API
  const api = await (await fetch(`${base}/api/posts`)).json();
  assert.equal(api.items.length, 2);
});

test('GET /api/import help page', async (t) => {
  const { base } = await startServer(t);

  const html = await fetch(`${base}/api/import`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  const page = await html.text();
  assert.match(page, /enabled/);
  assert.match(page, /Authorization: Bearer &lt;IMPORT_TOKEN&gt;/);
  assert.match(page, /https:\/\/blog\.example\.com\/api\/import/);
  assert.ok(!page.includes(TOKEN), 'token is never shown');
  assert.ok(!page.includes('Existing'), 'archive data is not shown');

  const json = await (
    await fetch(`${base}/api/import`, {
      headers: { accept: 'application/json' },
    })
  ).json();
  assert.equal(json.enabled, true);
  assert.equal(json.method, 'POST');
  assert.ok(Array.isArray(json.exampleBody.posts));
  assert.match(json.exampleCurl, /Bearer \$IMPORT_TOKEN/);
  assert.ok(!JSON.stringify(json).includes(TOKEN));

  assert.equal(
    (await fetch(`${base}/api/import`, { method: 'DELETE' })).status,
    405,
  );
});

test('GET /api/import shows disabled status', async (t) => {
  const { base } = await startServer(t, { importToken: '' });
  const json = await (
    await fetch(`${base}/api/import`, {
      headers: { accept: 'application/json' },
    })
  ).json();
  assert.equal(json.enabled, false);
  assert.match(json.status, /disabled/);
});
