import { module, test } from 'qunit';
import { setupTest } from 'rss-medium-blog-viewer/tests/helpers';
import config from 'rss-medium-blog-viewer/config/environment';

module('Unit | Controller | application', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let controller = this.owner.lookup('controller:application');
    assert.ok(controller);
  });

  test('getPostUrl builds a /posts/<slug>-<id> path', function (assert) {
    let controller = this.owner.lookup('controller:application');
    assert.strictEqual(
      controller.getPostUrl({
        guid: 'https://medium.com/p/8ae23c507403',
        link: 'https://medium.com/spoon-consulting/creating-a-vm-on-oracle-cloud-8ae23c507403?source=rss',
        title: 'Creating a VM',
      }),
      '/posts/creating-a-vm-on-oracle-cloud-8ae23c507403',
    );
  });

  test('selected resolves the post by its trailing id only', function (assert) {
    let controller = this.owner.lookup('controller:application');
    controller.items = [
      { guid: 'https://medium.com/p/aaaaaaaaaaaa', title: 'A' },
      { guid: 'https://medium.com/p/bbbbbbbbbbbb', title: 'B' },
    ];
    assert.strictEqual(controller.selected, null);
    controller.postRef = 'b-bbbbbbbbbbbb';
    assert.strictEqual(controller.selected, '1');
    controller.postRef = 'some-old-slug-bbbbbbbbbbbb';
    assert.strictEqual(controller.selected, '1');
    controller.postRef = 'unknown-cccccccccccc';
    assert.strictEqual(controller.selected, null);
  });

  test('documentTitle includes the selected article title', function (assert) {
    let controller = this.owner.lookup('controller:application');
    controller.pageTitle = 'My Blog';
    controller.items = [
      { guid: 'https://medium.com/p/aaaaaaaaaaaa', title: 'First post' },
    ];
    assert.strictEqual(controller.documentTitle, 'My Blog');
    controller.postRef = 'first-post-aaaaaaaaaaaa';
    assert.strictEqual(controller.documentTitle, 'First post | My Blog');
  });

  test('getDescription strips HTML and truncates', function (assert) {
    let controller = this.owner.lookup('controller:application');
    assert.strictEqual(
      controller.getDescription({
        description: '<p>Hello &amp; <b>welcome</b></p><script>x()</script>',
      }),
      'Hello & welcome',
    );
    assert.strictEqual(
      controller.getDescription({
        title: 'My Title',
        description: '<h3>My Title</h3><p>Body</p>',
      }),
      'Body',
    );
    const long = controller.getDescription({
      description: `<p>${'word '.repeat(100)}</p>`,
    });
    assert.true(long.length <= 160);
    assert.true(long.endsWith('...'));
  });

  test('trackPageView sends a GA page_view when GA is configured', function (assert) {
    let controller = this.owner.lookup('controller:application');
    const calls = [];
    const originalGtag = window.gtag;
    const originalGaId = config.ga_id;
    window.gtag = (...args) => calls.push(args);
    try {
      config.ga_id = undefined;
      controller.trackPageView();
      assert.strictEqual(calls.length, 0, 'nothing sent without GA_ID');

      config.ga_id = 'G-TEST123';
      controller.trackPageView();
      assert.strictEqual(calls.length, 1);
      assert.deepEqual(calls[0].slice(0, 2), ['event', 'page_view']);
      assert.strictEqual(calls[0][2].page_location, window.location.href);
    } finally {
      window.gtag = originalGtag;
      config.ga_id = originalGaId;
    }
  });
});
