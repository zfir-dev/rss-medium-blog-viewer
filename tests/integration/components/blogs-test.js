import { module, test } from 'qunit';
import { setupRenderingTest } from 'rss-medium-blog-viewer/tests/helpers';
import { click, render, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | blogs', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders a card per post', async function (assert) {
    this.items = [
      { guid: 'a', title: 'A', pubDate: '2025-01-01 00:00:00' },
      { guid: 'b', title: 'B', pubDate: '2025-01-02 00:00:00' },
    ];
    this.getPostUrl = (item) => `/posts/${item.guid}`;

    await render(
      hbs`<Blogs @items={{this.items}} @getPostUrl={{this.getPostUrl}} />`,
    );

    assert.dom('h1').hasText('Last 2 Blogs');
    assert.dom('.card').exists({ count: 2 });
  });

  test('Read More keeps a real href and handles plain clicks in-app', async function (assert) {
    this.items = [
      { guid: 'aaaaaaaaaaaa', title: 'Post 1', pubDate: '2025-01-01 00:00:00' },
    ];
    this.selected = [];
    this.handleSelected = (item) => this.selected.push(item);
    this.getPostUrl = (item) => `/posts/post-1-${item.guid}`;

    await render(
      hbs`<Blogs @items={{this.items}} @handleSelected={{this.handleSelected}} @getPostUrl={{this.getPostUrl}} />`,
    );

    assert.dom('a.btn').hasAttribute('href', '/posts/post-1-aaaaaaaaaaaa');

    let defaultPrevented = null;
    const link = this.element.querySelector('a.btn');
    link.addEventListener('click', (event) => {
      defaultPrevented = event.defaultPrevented;
      // never actually navigate during tests
      event.preventDefault();
    });

    await click('a.btn');
    assert.true(defaultPrevented, 'plain click is handled in-app');
    assert.strictEqual(this.selected.length, 1);

    await triggerEvent('a.btn', 'click', { metaKey: true });
    assert.false(defaultPrevented, 'cmd/ctrl-click is left to the browser');
    assert.strictEqual(this.selected.length, 1);
  });
});
