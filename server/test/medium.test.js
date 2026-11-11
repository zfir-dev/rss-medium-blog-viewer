'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  stripQuery,
  getMediumPostId,
  isChallengePage,
  parseMediumPost,
  parseSitemapUrls,
  getFeedUser,
  sanitizeHtml,
  toRssDate,
} = require('../lib/medium');
const { mergePosts, normalizePost } = require('../lib/posts');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'medium-post.html'),
  'utf8',
);

test('stripQuery and getMediumPostId', () => {
  assert.equal(
    stripQuery('https://zfir.medium.com/a-post-8ae23c507403?source=rss-1#x'),
    'https://zfir.medium.com/a-post-8ae23c507403',
  );
  assert.equal(
    getMediumPostId('https://zfir.medium.com/a-post-8ae23c507403?source=rss'),
    '8ae23c507403',
  );
  assert.equal(
    getMediumPostId('https://medium.com/p/8ae23c507403'),
    '8ae23c507403',
  );
  assert.equal(
    getMediumPostId('https://medium.com/@zfir/a-b-c-1bc7178dc6dd'),
    '1bc7178dc6dd',
  );
  assert.equal(getMediumPostId('https://zfir.medium.com/about'), null);
  assert.equal(getMediumPostId('not a url'), null);
});

test('parseMediumPost extracts metadata in RSS item shape', () => {
  const post = parseMediumPost(fixture, 'https://medium.com/x?source=y');
  assert.equal(post.guid, 'https://medium.com/p/8ae23c507403');
  assert.equal(
    post.link,
    'https://medium.com/some-pub/a-test-post-8ae23c507403',
  );
  assert.equal(post.title, 'A Test Post & Friends');
  assert.equal(post.pubDate, '2023-11-15 10:11:55');
  assert.equal(post.author, 'Jane Doe');
  assert.equal(
    post.thumbnail,
    'https://miro.medium.com/v2/resize:fit:1200/1*cover.png',
  );
  assert.deepEqual(post.categories, ['javascript', 'web-development']);
  assert.equal(post.description, post.content);
});

test('extracted content keeps body blocks and drops page chrome', () => {
  const { content } = parseMediumPost(fixture);
  assert.ok(
    content.startsWith('<h2>First heading</h2>'),
    'title and byline skipped',
  );
  assert.ok(!content.includes('Menu item'));
  assert.ok(!content.includes('Follow'));
  assert.ok(content.includes('<strong>bold</strong>'));
  assert.ok(
    content.includes(
      '<a href="https://medium.com/@jane?source=x" target="_blank" rel="noopener noreferrer">a link</a>',
    ),
  );
  assert.ok(
    content.includes(
      '<figure><img src="https://miro.medium.com/v2/resize:fit:1400/format:webp/1*img.png" alt=""><figcaption>A <em>caption</em></figcaption></figure>',
    ),
  );
  assert.ok(content.includes('<ul><li>Item one</li><li>Item two</li></ul>'));
  assert.ok(
    content.includes(
      '<pre><code>const a = 1;\nconsole.log(a &lt; 2);</code></pre>',
    ),
  );
  assert.ok(content.endsWith('<p>Last paragraph.</p>'));
});

test('extracted content is sanitized', () => {
  const { content } = parseMediumPost(fixture);
  assert.ok(!/script|onclick|onerror|javascript:/i.test(content));
  assert.ok(!/class=/.test(content));
  assert.equal(
    sanitizeHtml(
      '<p style="x"><a href="javascript:x">y</a><iframe src="z"></iframe></p>',
    ),
    '<p><a>y</a></p>',
  );
});

test('challenge pages are rejected', () => {
  const challenge =
    '<html><head><title>Just a moment...</title></head><body>cf_chl_opt</body></html>';
  assert.ok(isChallengePage(challenge));
  assert.equal(
    parseMediumPost(challenge, 'https://medium.com/p/8ae23c507403'),
    null,
  );
  assert.ok(!isChallengePage(fixture));
});

test('imported posts dedupe with RSS feed items by guid', () => {
  const archive = new Map();
  mergePosts(archive, [parseMediumPost(fixture)]);
  // The same post later shows up in the RSS feed (link has ?source=...).
  mergePosts(archive, [
    {
      guid: 'https://medium.com/p/8ae23c507403',
      link: 'https://jane.medium.com/a-test-post-8ae23c507403?source=rss',
      title: 'A Test Post & Friends',
      pubDate: '2023-11-15 10:11:55',
      content: '<p>rss</p>',
    },
  ]);
  assert.equal(archive.size, 1);
  assert.equal(
    normalizePost(parseMediumPost(fixture)).id,
    'https://medium.com/p/8ae23c507403',
  );
});

test('sitemap parsing, feed user and dates', () => {
  const xml = `<urlset>
    <url><loc>https://zfir.medium.com</loc></url>
    <url><loc>https://zfir.medium.com/about</loc></url>
    <url><loc>https://zfir.medium.com/a-post-1bc7178dc6dd</loc></url>
    <url><loc>https://zfir.medium.com/a-post-1bc7178dc6dd?x=1</loc></url>
    <url><loc>https://zfir.medium.com/other-90a0056e20b2</loc></url>
  </urlset>`;
  assert.deepEqual(parseSitemapUrls(xml), [
    'https://zfir.medium.com/a-post-1bc7178dc6dd',
    'https://zfir.medium.com/other-90a0056e20b2',
  ]);
  assert.equal(getFeedUser('https://medium.com/feed/@zfir'), '@zfir');
  assert.equal(getFeedUser('https://zfir.medium.com/feed'), '@zfir');
  assert.equal(getFeedUser(''), null);
  assert.equal(toRssDate('2023-11-15T10:11:55.323Z'), '2023-11-15 10:11:55');
  assert.equal(toRssDate('nope'), '');
});
