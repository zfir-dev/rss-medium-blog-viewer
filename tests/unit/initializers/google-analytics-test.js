import Application from '@ember/application';
import config from 'rss-medium-blog-viewer/config/environment';
import { initialize } from 'rss-medium-blog-viewer/initializers/google-analytics';
import { module, test } from 'qunit';
import Resolver from 'ember-resolver';
import { run } from '@ember/runloop';

module('Unit | Initializer | google-analytics', function (hooks) {
  hooks.beforeEach(function () {
    this.originalGaId = config.ga_id;
    config.ga_id = 'G-TEST123';

    this.TestApplication = class TestApplication extends Application {
      modulePrefix = config.modulePrefix;
      podModulePrefix = config.podModulePrefix;
      Resolver = Resolver;
    };

    this.TestApplication.initializer({
      name: 'initializer under test',
      initialize,
    });

    this.application = this.TestApplication.create({
      autoboot: false,
    });
  });

  hooks.afterEach(function () {
    run(this.application, 'destroy');

    document
      .querySelectorAll('script[src*="googletagmanager.com/gtag/js"]')
      .forEach((el) => el.remove());

    config.ga_id = this.originalGaId;
  });

  test('it injects the GA script', async function (assert) {
    await this.application.boot();

    let script = document.querySelector(
      'script[src*="googletagmanager.com/gtag/js?id=G-TEST123"]',
    );

    assert.ok(script, 'GA script was injected with correct id');
  });

  test('it defines window.gtag', async function (assert) {
    await this.application.boot();

    assert.strictEqual(
      typeof window.gtag,
      'function',
      'window.gtag is defined',
    );
  });
});
