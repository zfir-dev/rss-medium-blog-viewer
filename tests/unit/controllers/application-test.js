import { module, test } from 'qunit';
import { setupTest } from 'rss-medium-blog-viewer/tests/helpers';

module('Unit | Controller | application', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.originalFetch = window.fetch;
    window.fetch = async () => ({
      ok: true,
      json: async () => [],
    });
    localStorage.clear();
  });

  hooks.afterEach(function () {
    window.fetch = this.originalFetch;
    localStorage.clear();
  });

  test('it merges, sorts, and slugs saved posts', function (assert) {
    let controller = this.owner.lookup('controller:application');
    let posts = controller.mergePosts([
      {
        title: 'Older Post',
        link: 'https://example.com/older',
        pubDate: '2026-05-01T00:00:00.000Z',
        content: '<p>Older content</p>',
      },
      {
        title: 'Newer Post',
        link: 'https://example.com/newer',
        pubDate: '2026-05-30T00:00:00.000Z',
        content: '<p>Newer content</p>',
      },
    ]);

    assert.strictEqual(posts[0].title, 'Newer Post');
    assert.strictEqual(posts[0].slug, 'newer-post');
    assert.strictEqual(posts[1].description, 'Older content');
  });
});
