'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPostId,
  normalizePost,
  mergePosts,
  sortPosts,
  toIsoDate,
  getPostDescription,
} = require('../lib/posts');

const item = (overrides = {}) => ({
  guid: 'https://medium.com/p/aaa',
  link: 'https://zfir.medium.com/a-post-aaa',
  title: 'A post',
  pubDate: '2025-01-02 10:00:00',
  author: 'Zafir',
  thumbnail: '',
  description: '<p>Hello &amp; welcome</p>',
  content: '<p>Hello</p><img src="https://cdn-images-1.medium.com/x.png">',
  categories: ['ember', 'seo'],
  ...overrides,
});

test('getPostId prefers guid, then link, then title', () => {
  assert.equal(getPostId({ guid: 'g', link: 'l', title: 't' }), 'g');
  assert.equal(getPostId({ link: 'l', title: 't' }), 'l');
  assert.equal(getPostId({ title: 't' }), 't');
  assert.equal(getPostId(null), '');
});

test('normalizePost extracts a thumbnail from content and rejects bad URLs', () => {
  const post = normalizePost(item());
  assert.equal(post.id, 'https://medium.com/p/aaa');
  assert.equal(post.thumbnail, 'https://cdn-images-1.medium.com/x.png');

  const bad = normalizePost(
    item({ thumbnail: 'javascript:alert(1)', content: '' }),
  );
  assert.equal(bad.thumbnail, '');
  assert.equal(normalizePost({}), null);
});

test('mergePosts adds, updates and never removes posts', () => {
  const archive = new Map();
  const t1 = new Date('2025-01-01T00:00:00Z');
  let stats = mergePosts(
    archive,
    [item(), item({ guid: 'b', title: 'B' })],
    t1,
  );
  assert.deepEqual(stats, { added: 2, updated: 0, unchanged: 0 });

  const t2 = new Date('2025-02-01T00:00:00Z');
  // Feed no longer contains "b" and "aaa" got a new title.
  stats = mergePosts(archive, [item({ title: 'A post (edited)' })], t2);
  assert.deepEqual(stats, { added: 0, updated: 1, unchanged: 0 });
  assert.equal(archive.size, 2, 'old post is kept');

  const updated = archive.get('https://medium.com/p/aaa');
  assert.equal(updated.title, 'A post (edited)');
  assert.equal(updated.firstSeenAt, t1.toISOString());
  assert.equal(updated.updatedAt, t2.toISOString());

  const t3 = new Date('2025-03-01T00:00:00Z');
  stats = mergePosts(archive, [item({ title: 'A post (edited)' })], t3);
  assert.deepEqual(stats, { added: 0, updated: 0, unchanged: 1 });
  assert.equal(
    archive.get('https://medium.com/p/aaa').lastSeenAt,
    t3.toISOString(),
  );
  assert.equal(
    archive.get('https://medium.com/p/aaa').updatedAt,
    t2.toISOString(),
  );
});

test('mergePosts keeps a known thumbnail when the feed drops it', () => {
  const archive = new Map();
  mergePosts(archive, [item({ thumbnail: 'https://img/1.png' })]);
  mergePosts(archive, [item({ thumbnail: '', content: '<p>no image</p>' })]);
  assert.equal(
    archive.get('https://medium.com/p/aaa').thumbnail,
    'https://img/1.png',
  );
});

test('sortPosts orders newest first and handles rss2json dates', () => {
  const posts = [
    { id: 'old', pubDate: '2023-05-01 00:00:00' },
    { id: 'new', pubDate: '2025-05-01 00:00:00' },
    { id: 'mid', pubDate: '2024-05-01T00:00:00Z' },
  ];
  assert.deepEqual(
    sortPosts(posts).map((p) => p.id),
    ['new', 'mid', 'old'],
  );
  assert.equal(toIsoDate('2025-01-02 10:00:00'), '2025-01-02T10:00:00.000Z');
  assert.equal(toIsoDate('nope'), null);
});

test('getPostDescription strips HTML, decodes entities and truncates', () => {
  assert.equal(getPostDescription(item()), 'Hello & welcome');
  assert.equal(
    getPostDescription({
      title: 'My Title',
      description: '<h3>My Title</h3><p>Body</p>',
    }),
    'Body',
  );
  const long = getPostDescription({
    description: `<p>${'word '.repeat(100)}</p>`,
  });
  assert.ok(long.length <= 160);
  assert.ok(long.endsWith('...'));
});
