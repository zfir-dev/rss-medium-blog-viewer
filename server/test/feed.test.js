'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchFeed, buildFeedUrl } = require('../lib/feed');

const fakeFetch = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('buildFeedUrl encodes the feed URL', () => {
  const url = new URL(
    buildFeedUrl('https://medium.com/feed/@zfir?x=1&y=2', 'KEY'),
  );
  assert.equal(
    url.searchParams.get('rss_url'),
    'https://medium.com/feed/@zfir?x=1&y=2',
  );
  assert.equal(url.searchParams.get('api_key'), 'KEY');
});

test('fetchFeed returns items on success', async () => {
  const items = await fetchFeed({
    feedUrl: 'https://f',
    fetchImpl: fakeFetch(200, { status: 'ok', items: [{ guid: 'a' }] }),
  });
  assert.deepEqual(items, [{ guid: 'a' }]);
});

test('fetchFeed treats rss2json status "error" as an error', async () => {
  await assert.rejects(
    fetchFeed({
      feedUrl: 'https://f',
      fetchImpl: fakeFetch(200, { status: 'error', message: 'bad key' }),
    }),
    /bad key/,
  );
  await assert.rejects(
    fetchFeed({ feedUrl: 'https://f', fetchImpl: fakeFetch(500, {}) }),
    /500/,
  );
  await assert.rejects(fetchFeed({ feedUrl: '' }), /MEDIUM_FEED_URL/);
});
