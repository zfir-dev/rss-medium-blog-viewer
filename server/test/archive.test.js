'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Archive } = require('../lib/archive');

test('archive persists to disk and reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
  const file = path.join(dir, 'nested', 'posts.json');

  const archive = new Archive(file).load();
  assert.equal(archive.size, 0, 'missing file means empty archive');

  archive.merge([
    { guid: 'a', title: 'A', pubDate: '2024-01-01 00:00:00' },
    { guid: 'b', title: 'B', pubDate: '2025-01-01 00:00:00' },
  ]);
  archive.save();

  const reloaded = new Archive(file).load();
  assert.equal(reloaded.size, 2);
  assert.deepEqual(
    reloaded.list().map((p) => p.id),
    ['b', 'a'],
  );
  assert.ok(reloaded.lastFetchAt);
  assert.equal(
    fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')).length,
    0,
    'no temp files left behind',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('reloadIfChanged picks up writes from another process', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-reload-'));
  const file = path.join(dir, 'posts.json');

  const server = new Archive(file).load();
  server.merge([{ guid: 'a', title: 'A', pubDate: '2024-01-01 00:00:00' }]);
  server.save();
  assert.equal(server.reloadIfChanged(), false, 'own save is not a change');

  // e.g. the import script
  const importer = new Archive(file).load();
  importer.merge(
    [{ guid: 'old', title: 'Old', pubDate: '2019-01-01 00:00:00' }],
    new Date(),
    {
      markFetched: false,
    },
  );
  importer.save();
  // make sure the mtime differs even on coarse filesystems
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(file, future, future);

  assert.equal(server.reloadIfChanged(), true);
  assert.equal(server.size, 2);
  assert.ok(server.get('old'));

  fs.rmSync(dir, { recursive: true, force: true });
});
