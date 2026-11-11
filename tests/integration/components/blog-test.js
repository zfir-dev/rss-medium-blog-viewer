import { module, test } from 'qunit';
import { setupRenderingTest } from 'rss-medium-blog-viewer/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | blog', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the selected post', async function (assert) {
    this.items = [{ title: 'Hello', content: '<p>Body text</p>' }];
    this.handleBack = () => {};

    await render(
      hbs`<Blog @items={{this.items}} @selected="0" @handleBack={{this.handleBack}} />`,
    );

    assert.dom('h1.title').hasText('Hello');
    assert.dom('.blog p').hasText('Body text');
  });
});
