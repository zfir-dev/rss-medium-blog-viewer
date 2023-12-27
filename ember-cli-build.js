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
      clientAllowedKeys: ['MEDIUM_URL', 'RSS_2_JSON_API_KEY', 'ICON_URL'],
    }
  });

  return app.toTree();
};
