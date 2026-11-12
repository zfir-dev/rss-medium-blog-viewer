import { module, test } from 'qunit';
import { setupRenderingTest } from 'rss-medium-blog-viewer/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | header', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the Medium link', async function (assert) {
    await render(hbs`<Header @pageTitle="My Blog" @items={{(array)}} />`);

    assert.dom('header a.btn').hasText('View Medium');
  });
});
