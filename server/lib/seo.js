'use strict';

const { escapeHtml, safeJsonForScript, safeHttpUrl } = require('./text');
const { getPostRef } = require('./slug');
const { getPostDescription, getModifiedDate, toIsoDate } = require('./posts');

const SEO_START = '<!-- seo:start -->';
const SEO_END = '<!-- seo:end -->';

function siteBase(siteUrl) {
  return `${String(siteUrl || '').replace(/\/+$/, '')}/`;
}

function postUrl(siteUrl, post) {
  return `${siteBase(siteUrl)}posts/${getPostRef(post)}`;
}

/**
 * Compute SEO values for the home page (post = null) or a single post.
 */
function buildSeo({ post, siteUrl, pageTitle, iconUrl, siteDescription }) {
  const siteName = pageTitle || 'Blog';
  const icon = safeHttpUrl(iconUrl) || null;

  if (!post) {
    const url = siteBase(siteUrl);
    const description = siteDescription || `Articles from ${siteName}`;
    return {
      type: 'website',
      title: siteName,
      siteName,
      description,
      url,
      image: icon,
      largeImage: false,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteName,
        url,
        description,
      },
    };
  }

  const url = postUrl(siteUrl, post);
  const description = getPostDescription(post);
  const thumbnail = safeHttpUrl(post.thumbnail);
  const image = thumbnail || icon;
  const published = toIsoDate(post.pubDate);
  const modified = getModifiedDate(post);
  const title = `${post.title} | ${siteName}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Person', name: post.author || siteName },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      ...(icon ? { logo: { '@type': 'ImageObject', url: icon } } : {}),
    },
  };
  if (published) {
    jsonLd.datePublished = published;
  }
  if (modified) {
    jsonLd.dateModified = modified;
  }
  if (image) {
    jsonLd.image = image;
  }
  if (post.categories && post.categories.length) {
    jsonLd.keywords = post.categories.join(', ');
  }
  const original = safeHttpUrl(post.link);
  if (original) {
    jsonLd.sameAs = original;
  }

  return {
    type: 'article',
    title,
    siteName,
    description,
    url,
    image,
    largeImage: Boolean(thumbnail),
    publishedTime: published,
    author: post.author || null,
    tags: post.categories || [],
    jsonLd,
  };
}

function meta(attr, key, value) {
  return `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`;
}

function renderSeoTags(seo) {
  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    ...(seo.noindex ? ['<meta name="robots" content="noindex">'] : []),
    meta('name', 'description', seo.description),
    `<link rel="canonical" href="${escapeHtml(seo.url)}">`,
    meta('property', 'og:site_name', seo.siteName),
    meta('property', 'og:type', seo.type),
    meta('property', 'og:title', seo.title),
    meta('property', 'og:description', seo.description),
    meta('property', 'og:url', seo.url),
  ];
  if (seo.image) {
    tags.push(meta('property', 'og:image', seo.image));
  }
  if (seo.publishedTime) {
    tags.push(meta('property', 'article:published_time', seo.publishedTime));
  }
  if (seo.author) {
    tags.push(meta('property', 'article:author', seo.author));
  }
  for (const tag of seo.tags || []) {
    tags.push(meta('property', 'article:tag', tag));
  }
  tags.push(
    meta(
      'name',
      'twitter:card',
      seo.image && seo.largeImage ? 'summary_large_image' : 'summary',
    ),
    meta('name', 'twitter:title', seo.title),
    meta('name', 'twitter:description', seo.description),
  );
  if (seo.image) {
    tags.push(meta('name', 'twitter:image', seo.image));
  }
  tags.push(
    `<script type="application/ld+json" data-rss-medium-blog-viewer-seo="true">${safeJsonForScript(
      seo.jsonLd,
    )}</script>`,
  );
  return tags.join('\n    ');
}

const DEFAULT_TAG_PATTERNS = [
  /<title>[\s\S]*?<\/title>\s*/gi,
  /<meta\s+name=["'](description|twitter:[^"']*)["'][^>]*>\s*/gi,
  /<meta\s+property=["'](og:[^"']*|article:[^"']*)["'][^>]*>\s*/gi,
  /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
];

/**
 * Inject SEO tags into the built index.html. Replaces the block between the
 * `<!-- seo:start -->` / `<!-- seo:end -->` markers; when the markers are
 * missing, strips default tags and inserts before </head>.
 */
function injectSeo(html, seo) {
  const block = `${SEO_START}\n    ${renderSeoTags(seo)}\n    ${SEO_END}`;
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start !== -1 && end > start) {
    return html.slice(0, start) + block + html.slice(end + SEO_END.length);
  }
  let stripped = html;
  for (const pattern of DEFAULT_TAG_PATTERNS) {
    stripped = stripped.replace(pattern, '');
  }
  const headClose = stripped.search(/<\/head>/i);
  if (headClose === -1) {
    return stripped;
  }
  return `${stripped.slice(0, headClose)}    ${block}\n  ${stripped.slice(
    headClose,
  )}`;
}

module.exports = {
  buildSeo,
  renderSeoTags,
  injectSeo,
  postUrl,
  siteBase,
  SEO_START,
  SEO_END,
};
