'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeo, injectSeo, renderSeoTags } = require('../lib/seo');
const { renderSitemap, renderRobots } = require('../lib/sitemap');
const { escapeHtml, safeJsonForScript } = require('../lib/text');

const INDEX = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <!-- seo:start -->
    <title>Default</title>
    <meta name="description" content="">
    <!-- seo:end -->
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body></body>
</html>`;

const evilPost = {
  id: 'https://medium.com/p/evil',
  guid: 'https://medium.com/p/evil',
  link: 'https://zfir.medium.com/evil',
  title: '</title><script>alert("x")</script>',
  pubDate: '2025-01-02 10:00:00',
  author: 'Zafir "Z" <z>',
  thumbnail: 'https://cdn.example.com/img.png?a=1&b=2',
  description:
    '<p>Desc with "quotes" &amp; </script><script>alert(1)</script></p>',
  categories: ['a&b'],
};

test('escape helpers', () => {
  assert.equal(
    escapeHtml(`<a href="x">'&`),
    '&lt;a href=&quot;x&quot;&gt;&#39;&amp;',
  );
  const json = safeJsonForScript({ v: '</script><!--&\u2028' });
  assert.ok(!json.includes('<'));
  assert.ok(!json.includes('>'));
  assert.deepEqual(JSON.parse(json), { v: '</script><!--&\u2028' });
});

test('post SEO uses thumbnail, article type and BlogPosting', () => {
  const seo = buildSeo({
    post: evilPost,
    siteUrl: 'https://blog.example.com/',
    pageTitle: "Zafir's Blogs",
    iconUrl: 'https://example.com/icon.png',
  });
  assert.equal(seo.type, 'article');
  assert.match(
    seo.url,
    /^https:\/\/blog\.example\.com\/posts\/title-script-alert-x-script-[0-9a-f]{12}$/,
  );
  assert.equal(seo.jsonLd.url, seo.url);
  assert.equal(seo.image, evilPost.thumbnail);
  assert.equal(seo.jsonLd['@type'], 'BlogPosting');
  assert.equal(seo.jsonLd.datePublished, '2025-01-02T10:00:00.000Z');

  const html = renderSeoTags(seo);
  assert.match(
    html,
    /<meta name="twitter:card" content="summary_large_image">/,
  );
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(
    html,
    /og:image" content="https:\/\/cdn\.example\.com\/img\.png\?a=1&amp;b=2"/,
  );
});

test('injected values are XSS-safe', () => {
  const seo = buildSeo({
    post: evilPost,
    siteUrl: 'https://b.example',
    pageTitle: 'T',
  });
  const html = injectSeo(INDEX, seo);
  // only the JSON-LD script tag may appear
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(!html.includes('Default'));
  assert.match(
    html,
    /<title>&lt;\/title&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; \| T<\/title>/,
  );
  const ld =
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(
      html,
    )[1];
  assert.equal(JSON.parse(ld).headline, evilPost.title);
});

test('home SEO falls back to icon and summary card', () => {
  const seo = buildSeo({
    post: null,
    siteUrl: 'https://b.example',
    pageTitle: 'Blog',
    iconUrl: 'https://b.example/icon.png',
  });
  const html = renderSeoTags(seo);
  assert.match(html, /og:type" content="website"/);
  assert.match(html, /twitter:card" content="summary"/);
  assert.match(html, /og:image" content="https:\/\/b\.example\/icon\.png"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/b\.example\/">/);
});

test('post without thumbnail uses icon with summary card', () => {
  const seo = buildSeo({
    post: { ...evilPost, thumbnail: '' },
    siteUrl: 'https://b.example',
    pageTitle: 'Blog',
    iconUrl: 'https://b.example/icon.png',
  });
  assert.equal(seo.image, 'https://b.example/icon.png');
  assert.match(renderSeoTags(seo), /twitter:card" content="summary"/);
});

test('injectSeo without markers strips defaults and inserts before </head>', () => {
  const plain = INDEX.replace('<!-- seo:start -->', '').replace(
    '<!-- seo:end -->',
    '',
  );
  const html = injectSeo(
    plain,
    buildSeo({ post: null, siteUrl: 'https://b', pageTitle: 'Blog' }),
  );
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.ok(html.indexOf('<title>Blog</title>') < html.indexOf('</head>'));
});

test('sitemap lists all posts with escaped URLs, robots points at it', () => {
  const xml = renderSitemap(
    [
      evilPost,
      { id: 'b&c', guid: 'b&c', title: 'B', pubDate: '2024-01-01 00:00:00' },
    ],
    'https://b.example',
  );
  assert.equal((xml.match(/<url>/g) || []).length, 3);
  assert.match(xml, /<loc>https:\/\/b\.example\/posts\/b-[0-9a-f]{12}<\/loc>/);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), 'XML is escaped');
  assert.match(xml, /<lastmod>2025-01-02T10:00:00.000Z<\/lastmod>/);
  assert.match(
    renderRobots('https://b.example'),
    /Sitemap: https:\/\/b\.example\/sitemap\.xml/,
  );
});
