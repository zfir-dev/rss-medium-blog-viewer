'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHandler } = require('../app');
const { Archive } = require('../lib/archive');

function setup(configOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-test-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<html><head><!-- seo:start --><title>x</title><!-- seo:end --></head><body></body></html>',
  );
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dist, 'favicon.ico'), 'ico');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'secret');

  const archive = new Archive(path.join(dir, 'data', 'posts.json'));
  archive.merge([
    {
      guid: 'https://medium.com/p/0123456789ab',
      link: 'https://zfir.medium.com/post-and-one-0123456789ab?source=rss',
      title: 'Post & One',
      pubDate: '2025-01-01 00:00:00',
      thumbnail: 'https://img/1.png',
    },
  ]);
  const config = {
    distDir: dist,
    siteUrl: 'https://blog.example.com',
    pageTitle: 'My Blog',
    iconUrl: 'https://img/icon.png',
    ...configOverrides,
  };
  const server = http.createServer(createHandler({ config, archive }));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ base, server, dir });
    });
  });
}

test('HTTP routes', async (t) => {
  const { base, server, dir } = await setup();
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await t.test('home page has injected site tags', async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /<title>My Blog<\/title>/);
    assert.match(html, /og:type" content="website"/);
  });

  await t.test('post page has article tags', async () => {
    const res = await fetch(`${base}/posts/post-and-one-0123456789ab`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Post &amp; One \| My Blog<\/title>/);
    assert.match(html, /og:image" content="https:\/\/img\/1.png"/);
    assert.match(html, /twitter:card" content="summary_large_image"/);
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/blog\.example\.com\/posts\/post-and-one-0123456789ab">/,
    );
    assert.match(
      html,
      /og:url" content="https:\/\/blog\.example\.com\/posts\/post-and-one-0123456789ab"/,
    );
  });

  await t.test(
    'wrong or missing slug redirects to the canonical path',
    async () => {
      for (const path of [
        '/posts/old-slug-0123456789ab',
        '/posts/0123456789ab',
        '/posts/POST-AND-ONE-0123456789AB',
        '/posts/post-and-one-0123456789ab/',
      ]) {
        const res = await fetch(`${base}${path}?utm_source=x`, {
          redirect: 'manual',
        });
        assert.equal(res.status, 301, path);
        assert.equal(
          res.headers.get('location'),
          '/posts/post-and-one-0123456789ab?utm_source=x',
          path,
        );
      }
    },
  );

  await t.test('unknown post is a 404 app shell with home tags', async () => {
    const res = await fetch(`${base}/posts/nope-ffffffffffff`);
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /<title>My Blog<\/title>/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.equal((await fetch(`${base}/posts/no-id-here`)).status, 404);
  });

  await t.test('api, sitemap and robots', async () => {
    const api = await (await fetch(`${base}/api/posts`)).json();
    assert.equal(api.status, 'ok');
    assert.equal(api.items.length, 1);
    assert.equal(api.items[0].slug, 'post-and-one');
    assert.equal(api.items[0].path, '/posts/post-and-one-0123456789ab');
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(
      sitemap,
      /<loc>https:\/\/blog\.example\.com\/posts\/post-and-one-0123456789ab<\/loc>/,
    );
    const robots = await (await fetch(`${base}/robots.txt`)).text();
    assert.match(robots, /Sitemap: https:\/\/blog.example.com\/sitemap.xml/);
  });

  await t.test('static assets, 404s and traversal', async () => {
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/..%2Fsecret.txt`)).status, 404);
    const spa = await fetch(`${base}/some/route`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /<title>My Blog<\/title>/);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  });
});

test('cache-control headers are configurable', async (t) => {
  await t.test('defaults keep the current max-age values', async (t) => {
    const { base, server, dir } = await setup();
    t.after(() => {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    assert.equal(
      (await fetch(`${base}/sitemap.xml`)).headers.get('cache-control'),
      'public, max-age=3600',
    );
    assert.equal(
      (await fetch(`${base}/robots.txt`)).headers.get('cache-control'),
      'public, max-age=3600',
    );
    assert.equal(
      (await fetch(`${base}/api/posts`)).headers.get('cache-control'),
      'public, max-age=300',
    );
    const redirect = await fetch(`${base}/posts/0123456789ab`, {
      redirect: 'manual',
    });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal(
      (await fetch(`${base}/assets/app.js`)).headers.get('cache-control'),
      'public, max-age=31536000, immutable',
    );
    assert.equal(
      (await fetch(`${base}/favicon.ico`)).headers.get('cache-control'),
      'public, max-age=3600',
    );
  });

  await t.test('cache 0 sends no-cache', async (t) => {
    const { base, server, dir } = await setup({
      cacheSitemapSeconds: 0,
      cacheRobotsSeconds: 0,
      cachePostsApiSeconds: 0,
      cacheRedirectSeconds: 0,
      cacheAssetsSeconds: 0,
      cacheStaticSeconds: 0,
    });
    t.after(() => {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    assert.equal(
      (await fetch(`${base}/sitemap.xml`)).headers.get('cache-control'),
      'no-cache',
    );
    assert.equal(
      (await fetch(`${base}/robots.txt`)).headers.get('cache-control'),
      'no-cache',
    );
    assert.equal(
      (await fetch(`${base}/api/posts`)).headers.get('cache-control'),
      'no-cache',
    );
    const redirect = await fetch(`${base}/posts/0123456789ab`, {
      redirect: 'manual',
    });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('cache-control'), 'no-cache');
    assert.equal(
      (await fetch(`${base}/assets/app.js`)).headers.get('cache-control'),
      'no-cache',
    );
    assert.equal(
      (await fetch(`${base}/favicon.ico`)).headers.get('cache-control'),
      'no-cache',
    );
  });
});
