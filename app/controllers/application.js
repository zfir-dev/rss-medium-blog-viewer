import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import ENV from 'rss-medium-blog-viewer/config/environment';
import {
  getPostPath,
  getPostRef,
  getShortId,
  parsePostRef,
} from 'rss-medium-blog-viewer/utils/post-path';

/**
 * URL of the posts archive served by the bundled Node server (server/).
 * Set POSTS_API_URL to override, or to "false" to disable (static hosting).
 */
export function getPostsApiUrl() {
  const value = ENV.posts_api_url;
  if (value === undefined || value === null || value === '') {
    return `${ENV.rootURL}api/posts`;
  }
  return ['false', 'off', 'none', '0'].includes(String(value).toLowerCase())
    ? null
    : value;
}

export default class ApplicationController extends Controller {
  @service router;

  @tracked pageTitle = ENV.page_title;
  @tracked items = [];
  // "<slug>-<id>" from /posts/<slug>-<id>, or null on the list page.
  @tracked postRef = null;

  constructor() {
    super(...arguments);
    this.router.on('routeDidChange', this.handleRouteChange);
    this.load();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.router.off('routeDidChange', this.handleRouteChange);
  }

  @action
  getPostUrl(item) {
    return getPostPath(item, ENV.rootURL);
  }

  getSelectedItemIndex() {
    const shortId = this.postRef ? parsePostRef(this.postRef) : null;

    if (!shortId) {
      return -1;
    }

    return this.items.findIndex((item) => getShortId(item) === shortId);
  }

  // Index (as a string, like the components expect) of the open post.
  get selected() {
    const index = this.getSelectedItemIndex();
    return index === -1 ? null : index.toString();
  }

  get selectedItem() {
    return this.selected === null ? null : this.items[Number(this.selected)];
  }

  // Used by the {{page-title}} helper so it never overwrites the article title.
  get documentTitle() {
    const item = this.selectedItem;
    return item ? `${item.title} | ${this.pageTitle}` : this.pageTitle;
  }

  getCanonicalUrl(item) {
    return item
      ? `${window.location.origin}${getPostPath(item, ENV.rootURL)}`
      : `${window.location.origin}${ENV.rootURL}`;
  }

  @action
  updateSeo() {
    const item = this.selectedItem;
    const title = this.documentTitle;
    const description = this.getDescription(item);
    const url = this.getCanonicalUrl(item);
    const image = (item && item.thumbnail) || ENV.icon_url;

    document.title = title;
    this.setMetaTag('description', description);
    this.setMetaTag('og:site_name', this.pageTitle, 'property');
    this.setMetaTag('og:title', title, 'property');
    this.setMetaTag('og:description', description, 'property');
    this.setMetaTag('og:type', item ? 'article' : 'website', 'property');
    this.setMetaTag('og:url', url, 'property');
    this.setMetaTag(
      'twitter:card',
      item && item.thumbnail ? 'summary_large_image' : 'summary',
      'name',
    );
    this.setMetaTag('twitter:title', title, 'name');
    this.setMetaTag('twitter:description', description, 'name');
    if (image) {
      this.setMetaTag('og:image', image, 'property');
      this.setMetaTag('twitter:image', image, 'name');
    }
    this.setCanonicalUrl(url);
    this.setStructuredData(item, url);
  }

  getDescription(item) {
    if (!item) {
      return `Articles from ${this.pageTitle}`;
    }

    const html = item.description || item.content || '';
    // DOMParser does not execute scripts; it is only used to get plain text.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc
      .querySelectorAll('script, style, figcaption')
      .forEach((el) => el.remove());
    let text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    // Medium content usually starts with the title as a heading; skip it.
    const title = (item.title || '').trim();
    if (title && text.startsWith(title) && text.length > title.length) {
      text = text.slice(title.length).trim();
    }

    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
  }

  setMetaTag(name, content, attribute = 'name') {
    let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);

    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attribute, name);
      document.head.appendChild(tag);
    }

    tag.setAttribute('content', content);
  }

  setCanonicalUrl(url) {
    let link = document.head.querySelector('link[rel="canonical"]');

    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }

    link.setAttribute('href', url);
  }

  setStructuredData(item, url) {
    let script = document.head.querySelector(
      'script[data-rss-medium-blog-viewer-seo]',
    );

    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.rssMediumBlogViewerSeo = 'true';
      document.head.appendChild(script);
    }

    const data = item
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: item.title,
          description: this.getDescription(item),
          url,
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          datePublished: this.toIsoDate(item.pubDate),
          author: {
            '@type': 'Person',
            name: item.author || this.pageTitle,
          },
          ...(item.thumbnail ? { image: item.thumbnail } : {}),
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: this.pageTitle,
          url,
        };

    script.textContent = JSON.stringify(data);
  }

  toIsoDate(value) {
    if (!value) {
      return undefined;
    }
    // rss2json returns "YYYY-MM-DD HH:mm:ss" in UTC.
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  @action
  trackPageView() {
    if (!ENV.ga_id || typeof window.gtag !== 'function') {
      return;
    }
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
    });
  }

  // Full archive from the bundled Node server (includes posts older than the
  // last 10 in the Medium feed). Returns null when unavailable.
  async fetchArchivedItems() {
    const apiUrl = getPostsApiUrl();
    if (!apiUrl) {
      return null;
    }
    try {
      const response = await fetch(apiUrl, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data && data.status === 'ok' && Array.isArray(data.items)
        ? data.items
        : null;
    } catch {
      return null;
    }
  }

  async fetchFeedItems() {
    const mediumFeedUrl = ENV.medium_feed_url;
    const rss2JsonApiKey = ENV.rss_2_json_api_key;
    const response = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
        mediumFeedUrl,
      )}&api_key=${encodeURIComponent(rss2JsonApiKey)}`,
    );
    if (!response.ok) {
      throw new Error(`RSS feed request failed with status ${response.status}`);
    }
    const data = await response.json();
    // rss2json can answer HTTP 200 with { status: "error", message }.
    if (!data || data.status !== 'ok') {
      throw new Error(
        `RSS feed returned an error: ${
          (data && data.message) || 'unknown error'
        }`,
      );
    }
    return data.items || [];
  }

  @action
  async load() {
    try {
      const archived = await this.fetchArchivedItems();
      this.items =
        archived && archived.length ? archived : await this.fetchFeedItems();
      this.syncPostRef();
      this.redirectToCanonicalSlug();
      this.updateSeo();
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    }
  }

  syncPostRef() {
    const route = this.router.currentRoute;
    this.postRef =
      route && route.name === 'post' ? route.params.slug || null : null;
  }

  // /posts/<old-or-wrong-slug>-<id> -> /posts/<slug>-<id>
  redirectToCanonicalSlug() {
    const item = this.selectedItem;
    if (item && this.postRef !== getPostRef(item)) {
      this.router.replaceWith('post', getPostRef(item));
    }
  }

  @action
  handleRouteChange(transition) {
    this.syncPostRef();
    this.redirectToCanonicalSlug();
    this.updateSeo();
    // The initial page view is sent by gtag('config') in the initializer.
    if (transition && transition.from) {
      this.trackPageView();
    }
  }

  @action
  handleSelected(item) {
    this.router.transitionTo('post', getPostRef(item));
  }

  @action
  handleBack() {
    this.router.transitionTo('index');
  }
}
