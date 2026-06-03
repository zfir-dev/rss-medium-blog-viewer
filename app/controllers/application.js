import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import ENV from 'rss-medium-blog-viewer/config/environment';

const BLOG_ARCHIVE_KEY = 'rss-medium-blog-viewer:blogs';
const DEFAULT_DESCRIPTION =
  'A self-hosted archive of Medium posts with saved blog content.';

export default class ApplicationController extends Controller {
  @tracked pageTitle = ENV.page_title || 'Blog';
  @tracked selected = null;
  @tracked items = [];
  @tracked metaDescription = ENV.seo_description || DEFAULT_DESCRIPTION;

  selectedSlug = null;

  constructor() {
    super(...arguments);
    this.load();
  }

  get selectedItem() {
    if (this.selected === null) {
      return null;
    }

    return this.items[Number(this.selected)];
  }

  get currentPageTitle() {
    if (this.selectedItem) {
      return `${this.selectedItem.title} | ${this.pageTitle}`;
    }

    return this.pageTitle;
  }

  @action
  async load() {
    const archivedPosts = await this.loadArchivedPosts();
    const cachedPosts = this.loadCachedPosts();

    this.items = this.mergePosts([...archivedPosts, ...cachedPosts]);
    this.selectFromLocation();
    this.updateSeo();

    try {
      const mediumFeedUrl = ENV.medium_feed_url;
      const rss2JsonApiKey = ENV.rss_2_json_api_key;

      if (!mediumFeedUrl || !rss2JsonApiKey) {
        return;
      }

      const response = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
          mediumFeedUrl,
        )}&api_key=${rss2JsonApiKey}`,
      );
      const data = await response.json();

      this.items = this.mergePosts([...(data.items || []), ...this.items]);
      this.persistCachedPosts();
      this.syncSelectedPost();
      this.updateSeo();
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    }
  }

  @action
  handleSelected(item) {
    this.selected = this.items.indexOf(item).toString();
    this.selectedSlug = item.slug;
    this.updateUrl(`/post/${item.slug}`);
    this.updateSeo();
  }

  @action
  handleBack() {
    this.selected = null;
    this.selectedSlug = null;
    this.updateUrl('/');
    this.updateSeo();
  }

  async loadArchivedPosts() {
    try {
      const response = await fetch('/blogs.json');

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch {
      return [];
    }
  }

  loadCachedPosts() {
    try {
      return JSON.parse(localStorage.getItem(BLOG_ARCHIVE_KEY)) || [];
    } catch {
      return [];
    }
  }

  persistCachedPosts() {
    try {
      localStorage.setItem(BLOG_ARCHIVE_KEY, JSON.stringify(this.items));
    } catch (error) {
      console.warn('Unable to save blog archive in local storage:', error);
    }
  }

  mergePosts(posts) {
    const postMap = new Map();

    posts.forEach((post) => {
      if (!post) {
        return;
      }

      const key =
        post.guid || post.link || `${post.title || ''}-${post.pubDate || ''}`;
      const existingPost = postMap.get(key);

      postMap.set(key, {
        ...existingPost,
        ...post,
        description: post.description || this.descriptionFromPost(post),
      });
    });

    return Array.from(postMap.values())
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .map((post, index, allPosts) => ({
        ...post,
        slug: this.uniqueSlug(post, index, allPosts),
      }));
  }

  uniqueSlug(post, index, posts) {
    const baseSlug = this.slugify(post.title || post.guid || post.link);
    const matchingPosts = posts.slice(0, index).filter((item) => {
      return this.slugify(item.title || item.guid || item.link) === baseSlug;
    });

    if (matchingPosts.length === 0) {
      return baseSlug;
    }

    return `${baseSlug}-${matchingPosts.length + 1}`;
  }

  slugify(value = '') {
    const slug = value
      .toString()
      .toLowerCase()
      .replace(/&[a-z]+;/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'post';
  }

  descriptionFromPost(post) {
    const text = this.textFromHtml(post.description || post.content || '');

    return text.length > 155 ? `${text.slice(0, 152).trim()}...` : text;
  }

  textFromHtml(value = '') {
    const template = document.createElement('template');
    template.innerHTML = value;

    return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  selectFromLocation() {
    const match = window.location.pathname.match(/^\/post\/([^/]+)/);

    if (match) {
      this.selectedSlug = decodeURIComponent(match[1]);
      this.syncSelectedPost();
    }
  }

  syncSelectedPost() {
    if (!this.selectedSlug) {
      return;
    }

    const index = this.items.findIndex(
      (item) => item.slug === this.selectedSlug,
    );
    this.selected = index >= 0 ? index.toString() : null;
  }

  updateUrl(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }

  updateSeo() {
    const post = this.selectedItem;
    const title = this.currentPageTitle;
    const description =
      post?.description || ENV.seo_description || DEFAULT_DESCRIPTION;
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;

    document.title = title;
    this.metaDescription = description;
    this.setMeta('description', description);
    this.setMeta('og:title', title, 'property');
    this.setMeta('og:description', description, 'property');
    this.setMeta('og:type', post ? 'article' : 'website', 'property');
    this.setMeta('og:url', canonicalUrl, 'property');
    this.setMeta('twitter:card', 'summary_large_image');
    this.setCanonical(canonicalUrl);
    this.setStructuredData(post, canonicalUrl);
  }

  setMeta(name, content, attributeName = 'name') {
    let element = document.head.querySelector(
      `meta[${attributeName}="${name}"]`,
    );

    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attributeName, name);
      document.head.appendChild(element);
    }

    element.setAttribute('content', content || '');
  }

  setCanonical(url) {
    let element = document.head.querySelector('link[rel="canonical"]');

    if (!element) {
      element = document.createElement('link');
      element.setAttribute('rel', 'canonical');
      document.head.appendChild(element);
    }

    element.setAttribute('href', url);
  }

  setStructuredData(post, canonicalUrl) {
    let element = document.getElementById('structured-data');

    if (!element) {
      element = document.createElement('script');
      element.id = 'structured-data';
      element.type = 'application/ld+json';
      document.head.appendChild(element);
    }

    element.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': post ? 'BlogPosting' : 'Blog',
      headline: post?.title || this.pageTitle,
      description: post?.description || this.metaDescription,
      datePublished: post?.pubDate,
      mainEntityOfPage: canonicalUrl,
      url: canonicalUrl,
    });
  }
}
