import { module, test } from 'qunit';
import { setupRenderingTest } from 'rss-medium-blog-viewer/tests/helpers';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | blogs', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders saved posts with SEO-friendly links', async function (assert) {
    this.set('items', [
      {
        title: 'Saved Medium Post',
        pubDate: '2026-05-30T00:00:00.000Z',
        categories: ['ember'],
        slug: 'saved-medium-post',
      },
    ]);
    this.set('select', (item) => {
      assert.strictEqual(item.title, 'Saved Medium Post');
      assert.step('selected');
    });

    await render(
      hbs`<Blogs @items={{this.items}} @handleSelected={{this.select}} />`,
    );

    assert.dom('h1').hasText('Last 1 Blog');
    assert.dom('article').includesText('Saved Medium Post');
    assert
      .dom('a[aria-label="Saved Medium Post"]')
      .hasAttribute('href', '/post/saved-medium-post');

    await click('a[aria-label="Saved Medium Post"]');

    assert.verifySteps(['selected']);
  });
});
