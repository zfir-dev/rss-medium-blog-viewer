'use strict';

const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json';

function buildFeedUrl(feedUrl, apiKey) {
  const url = new URL(RSS2JSON_ENDPOINT);
  url.searchParams.set('rss_url', feedUrl);
  if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }
  return url.toString();
}

/**
 * Fetch the Medium feed through rss2json (same source the Ember app uses).
 * rss2json can answer HTTP 200 with `{status: "error"}`, so check both.
 */
async function fetchFeed({ feedUrl, apiKey, timeoutMs = 15000, fetchImpl }) {
  if (!feedUrl) {
    throw new Error('MEDIUM_FEED_URL is not set');
  }
  const doFetch = fetchImpl || globalThis.fetch;
  const response = await doFetch(buildFeedUrl(feedUrl, apiKey), {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`rss2json request failed with status ${response.status}`);
  }
  const data = await response.json();
  if (!data || data.status !== 'ok' || !Array.isArray(data.items)) {
    throw new Error(
      `rss2json returned an error: ${
        (data && data.message) || 'unknown error'
      }`,
    );
  }
  return data.items;
}

module.exports = { fetchFeed, buildFeedUrl };
