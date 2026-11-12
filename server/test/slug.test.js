'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const server = require('../lib/slug');

// Load app/utils/post-path.js (ES module syntax) without a bundler so we can
// check the client and server produce identical URLs.
function loadClient() {
  const file = path.join(__dirname, '..', '..', 'app', 'utils', 'post-path.js');
  const source = `${fs
    .readFileSync(file, 'utf8')
    .replace(
      /^export /gm,
      '',
    )}\nmodule.exports = { slugify, mediumIdFromUrl, getShortId, getSlug, getPostRef, getPostPath, parsePostRef };`;
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source, sandbox, { filename: file });
  return sandbox.module.exports;
}

const POSTS = [
  {
    guid: 'https://medium.com/p/8ae23c507403',
    link: 'https://medium.com/spoon-consulting/creating-a-vm-on-oracle-cloud-using-always-free-resources-8ae23c507403',
    title: 'Creating a VM on Oracle Cloud(Using Always Free Resources)',
  },
  {
    guid: 'https://medium.com/p/f43fb9c3980b',
    link: 'https://zfir.medium.com/running-react-angular-js-ember-js-locally-on-android-f43fb9c3980b?source=rss-fa41b1538f81------2',
    title: 'Running React',
  },
  {
    guid: 'https://medium.com/p/abcdef123456',
    link: 'https://medium.com/p/abcdef123456',
    title: 'Héllo, Wörld! — A test',
  },
  { guid: 'https://medium.com/p/abcdef123456', link: '', title: '' },
  {
    guid: 'https://example.com/a',
    link: 'https://example.com/a',
    title: 'Non Medium post',
  },
  { title: 'Only a title' },
];

const EXPECTED = [
  '/posts/creating-a-vm-on-oracle-cloud-using-always-free-resources-8ae23c507403',
  '/posts/running-react-angular-js-ember-js-locally-on-android-f43fb9c3980b',
  '/posts/hello-world-a-test-abcdef123456',
  '/posts/post-abcdef123456',
];

test('post paths mirror Medium slugs and end with the post id', () => {
  POSTS.slice(0, 4).forEach((post, i) => {
    assert.equal(server.getPostPath(post), EXPECTED[i]);
  });
  assert.match(
    server.getPostPath(POSTS[4]),
    /^\/posts\/non-medium-post-[0-9a-f]{12}$/,
  );
  assert.match(
    server.getPostPath(POSTS[5]),
    /^\/posts\/only-a-title-[0-9a-f]{12}$/,
  );
  assert.equal(server.getPostPath(POSTS[0], '/blog/'), `/blog${EXPECTED[0]}`);
});

test('parsePostRef reads the trailing id only', () => {
  assert.equal(
    server.parsePostRef('creating-a-vm-8ae23c507403'),
    '8ae23c507403',
  );
  assert.equal(server.parsePostRef('wrong-slug-8AE23C507403'), '8ae23c507403');
  assert.equal(server.parsePostRef('8ae23c507403'), '8ae23c507403');
  assert.equal(server.parsePostRef('no-id-here'), null);
  assert.equal(server.parsePostRef(''), null);
});

test('client (app/utils/post-path.js) matches the server', () => {
  const client = loadClient();
  for (const post of POSTS) {
    assert.equal(client.getPostPath(post), server.getPostPath(post));
    assert.equal(client.getShortId(post), server.getShortId(post));
    assert.equal(client.getSlug(post), server.getSlug(post));
  }
  for (const ref of ['a-b-8ae23c507403', '8ae23c507403', 'x', '']) {
    assert.equal(client.parsePostRef(ref), server.parsePostRef(ref));
  }
});
