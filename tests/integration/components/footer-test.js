import { module, test } from 'qunit';
import { setupRenderingTest } from 'rss-medium-blog-viewer/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | footer', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the page title and year', async function (assert) {
    await render(hbs`<Footer @pageTitle="My Blog" @items={{(array)}} />`);

    assert.dom('footer').includesText('My Blog');
    assert.dom('footer').includesText(String(new Date().getFullYear()));
  });
});
