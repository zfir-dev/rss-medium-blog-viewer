'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  const app = new EmberApp(defaults, {
    'ember-bootstrap': {
      bootstrapVersion: 5,
      importBootstrapCSS: true,
    },
    fontawesome: {
      icons: {
        'free-solid-svg-icons': 'all',
      },
    },
    dotEnv: {
      clientAllowedKeys: [
        'PAGE_TITLE',
        'ICON_URL',
        'MEDIUM_URL',
        'MEDIUM_FEED_URL',
        'RSS_2_JSON_API_KEY',
      ],
    },
  });

  return app.toTree();
};
