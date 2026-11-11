'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHandler } = require('../app');
const { Archive } = require('../lib/archive');
const { makeBatches, pushPosts } = require('../lib/push');
const { main } = require('../scripts/import-medium');

const TOKEN = 'push-token';
const FIXTURE = path.join(__dirname, 'fixtures', 'medium-post.html');

async function startServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-test-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<html><head></head><body></body></html>',
  );
  const archive = new Archive(path.join(dir, 'data', 'posts.json'));
  const requests = [];
  const handler = createHandler({
    config: { distDir: dist, siteUrl: 'https://b.example', importToken: TOKEN },
    archive,
  });
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    archive,
    requests,
    dir,
  };
}

test('makeBatches splits by count', () => {
  const posts = Array.from({ length: 5 }, (_, i) => ({ title: `p${i}` }));
  assert.deepEqual(
    makeBatches(posts, { batchSize: 2 }).map((b) => b.length),
    [2, 2, 1],
  );
});

test('pushPosts reports server errors', async (t) => {
  const { base } = await startServer(t);
  await assert.rejects(
    pushPosts(base, 'wrong', [{ title: 'x', link: 'https://x.example/a' }]),
    /401/,
  );
  await assert.rejects(pushPosts(base, '', []), /token/);
});

test('importer --push sends scraped posts to the server', async (t) => {
  const { base, archive, requests, dir } = await startServer(t);
  const localArchive = path.join(dir, 'local', 'posts.json');
  const quiet = t.mock.method(console, 'log', () => {});

  let code = await main([
    '--html',
    FIXTURE,
    '--push',
    base,
    '--token',
    TOKEN,
    '--archive',
    localArchive,
  ]);
  assert.equal(code, 0);
  assert.equal(archive.size, 1);
  const stored = archive.get('https://medium.com/p/8ae23c507403');
  assert.equal(stored.title, 'A Test Post & Friends');
  assert.ok(stored.content.includes('<h2>First heading</h2>'));
  assert.ok(
    !fs.existsSync(localArchive),
    'local archive is not written in push mode',
  );
  assert.ok(requests.includes('GET /api/posts'));
  assert.ok(requests.includes('POST /api/import'));

  // Second run: the server already has it, so nothing is sent.
  requests.length = 0;
  code = await main(['--html', FIXTURE, '--push', base, '--token', TOKEN]);
  assert.equal(code, 0);
  assert.equal(main.lastSummary.skipped.length, 1);
  assert.ok(!requests.includes('POST /api/import'));

  // --force re-sends with overwrite: unchanged content is skipped server-side.
  code = await main([
    '--html',
    FIXTURE,
    '--push',
    base,
    '--token',
    TOKEN,
    '--force',
  ]);
  assert.equal(code, 0);
  assert.deepEqual(
    {
      added: main.lastSummary.push.added,
      updated: main.lastSummary.push.updated,
      skipped: main.lastSummary.push.skipped,
    },
    { added: 0, updated: 0, skipped: 1 },
  );
  quiet.mock.restore();
});

test('importer --push without a token fails fast', async () => {
  const saved = process.env.IMPORT_TOKEN;
  delete process.env.IMPORT_TOKEN;
  try {
    await assert.rejects(
      main(['--html', FIXTURE, '--push', 'http://127.0.0.1:9']),
      /token/,
    );
  } finally {
    if (saved !== undefined) {
      process.env.IMPORT_TOKEN = saved;
    }
  }
});
