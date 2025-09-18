// app/initializers/google-analytics.js
import config from 'rss-medium-blog-viewer/config/environment';

export function initialize(/* application */) {
  const gaId = config.ga_id;

  if (!gaId) {
    console.warn('Google Analytics ID is missing.');
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', gaId);
}

export default {
  initialize,
};
