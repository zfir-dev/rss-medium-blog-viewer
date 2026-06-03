import { module, test } from 'qunit';
import { setupRenderingTest } from 'rss-medium-blog-viewer/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | blog', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders a selected post', async function (assert) {
    this.set('item', {
      title: 'Saved Post',
      content: '<p>Saved content</p>',
    });

    await render(hbs`<Blog @item={{this.item}} />`);

    assert.dom('h1').hasText('Saved Post');
    assert.dom('.blog').includesText('Saved content');
  });
});
