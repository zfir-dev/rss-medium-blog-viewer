'use strict';

const { decodeEntities, escapeHtml, safeHttpUrl } = require('./text');

const MEDIUM_ORIGIN = 'https://medium.com';

/** Remove query string and hash from a URL. */
function stripQuery(url) {
  try {
    const parsed = new URL(String(url).trim());
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Medium post id: the trailing hex segment of a post URL (e.g. 8ae23c507403). */
function getMediumPostId(url) {
  const clean = stripQuery(url);
  if (!clean) {
    return null;
  }
  const { pathname } = new URL(clean);
  const match =
    /(?:^|[-/])([0-9a-f]{8,16})\/?$/.exec(pathname) ||
    /^\/p\/([0-9a-f]{8,16})/.exec(pathname);
  return match ? match[1] : null;
}

/** RSS guid format used by Medium feeds, so imports dedupe with feed items. */
function mediumGuid(postId) {
  return `${MEDIUM_ORIGIN}/p/${postId}`;
}

/** True when the HTML is a Cloudflare/bot challenge rather than the article. */
function isChallengePage(html) {
  const text = String(html ?? '');
  if (/<title>\s*(Just a moment|Attention Required)/i.test(text)) {
    return true;
  }
  // Challenge markers only count when the page has no article metadata.
  return (
    /cf_chl_|cf-challenge/i.test(text) &&
    !/property=["']og:title["']/i.test(text)
  );
}

function getAttr(tag, name) {
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = re.exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? '') : null;
}

function getMeta(html, key) {
  const re = /<meta\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const k = getAttr(tag, 'property') || getAttr(tag, 'name');
    if (k && k.toLowerCase() === key.toLowerCase()) {
      return getAttr(tag, 'content');
    }
  }
  return null;
}

function getCanonical(html) {
  const re = /<link\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    if ((getAttr(match[0], 'rel') || '').toLowerCase() === 'canonical') {
      return getAttr(match[0], 'href');
    }
  }
  return null;
}

function getJsonLd(html) {
  const re =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const data = JSON.parse(match[1]);
      const list = Array.isArray(data) ? data : [data];
      const post = list.find(
        (d) =>
          d &&
          /(SocialMediaPosting|BlogPosting|NewsArticle|Article)/.test(
            String(d['@type']),
          ),
      );
      if (post) {
        return post;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function absoluteUrl(href, base = MEDIUM_ORIGIN) {
  try {
    const url = new URL(href, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'blockquote',
  'a',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'mark',
  'sup',
  'sub',
  'br',
  'hr',
  'figure',
  'figcaption',
  'img',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);

/** Keep a small allow-list of tags/attributes; drop everything else. */
function sanitizeHtml(html) {
  return String(html ?? '')
    .replace(
      /<(script|style|svg|button|noscript|iframe|object|template)\b[\s\S]*?<\/\1\s*>/gi,
      '',
    )
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, rawName) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) {
        return '';
      }
      if (tag.startsWith('</')) {
        return VOID_TAGS.has(name) ? '' : `</${name}>`;
      }
      if (name === 'a') {
        const href = absoluteUrl(getAttr(tag, 'href') || '');
        return href
          ? `<a href="${escapeHtml(
              href,
            )}" target="_blank" rel="noopener noreferrer">`
          : '<a>';
      }
      if (name === 'img') {
        const src = safeHttpUrl(getAttr(tag, 'src'));
        if (!src) {
          return '';
        }
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(
          getAttr(tag, 'alt') || '',
        )}">`;
      }
      return `<${name}>`;
    });
}

function bestImageFromFigure(figureHtml) {
  const img = /<img\b[^>]*>/i.exec(figureHtml);
  let src = img ? safeHttpUrl(getAttr(img[0], 'src')) : null;
  if (!src) {
    const source = /<source\b[^>]*srcset=["']([^"']+)["'][^>]*>/i.exec(
      figureHtml,
    );
    if (source) {
      const candidates = decodeEntities(source[1])
        .split(',')
        .map((c) => c.trim().split(/\s+/)[0]);
      src = safeHttpUrl(candidates[candidates.length - 1]);
    }
  }
  return {
    src,
    alt: img ? getAttr(img[0], 'alt') || '' : '',
  };
}

/**
 * Extract the article body from a Medium post page. Body blocks carry a short
 * hex id (server-rendered HTML) and `data-selectable-paragraph` (rendered
 * DOM); images live in <figure> elements.
 */
function extractContent(html) {
  const titleMatch =
    /<h1\b[^>]*(data-testid=["']storyTitle["']|pw-post-title)[^>]*>[\s\S]*?<\/h1>/i.exec(
      html,
    );
  const start = titleMatch ? titleMatch.index + titleMatch[0].length : 0;
  const articleEnd = html.indexOf('</article>', start);
  const region = html.slice(
    start,
    articleEnd === -1 ? html.length : articleEnd,
  );

  const token =
    /<figure\b[\s\S]*?<\/figure>|<pre\b[^>]*>[\s\S]*?<\/pre>|<(p|h[1-6]|li|blockquote)\b(?=[^>]*(?:data-selectable-paragraph|\sid=["'][0-9a-f]{4}["']))[^>]*>[\s\S]*?<\/\1>|<(ul|ol)\b[^>]*>|<\/(ul|ol)>/gi;
  const parts = [];
  let match;
  while ((match = token.exec(region))) {
    const chunk = match[0];
    if (/^<figure/i.test(chunk)) {
      const { src, alt } = bestImageFromFigure(chunk);
      const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(
        chunk,
      );
      if (src) {
        parts.push(
          `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">${
            caption
              ? `<figcaption>${sanitizeHtml(caption[1])}</figcaption>`
              : ''
          }</figure>`,
        );
      }
    } else if (match[2]) {
      parts.push(`<${match[2].toLowerCase()}>`);
    } else if (match[3]) {
      parts.push(`</${match[3].toLowerCase()}>`);
    } else if (/^<pre/i.test(chunk)) {
      // keep line breaks in code blocks
      parts.push(
        `<pre><code>${sanitizeHtml(
          chunk
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/^<pre[^>]*>|<\/pre>$/gi, ''),
        ).replace(/<\/?code>/g, '')}</code></pre>`,
      );
    } else {
      parts.push(sanitizeHtml(chunk));
    }
  }

  let content = parts.join('');
  // drop list wrappers that did not contain body items
  let previous;
  do {
    previous = content;
    content = content.replace(/<(ul|ol)><\/\1>/g, '');
  } while (content !== previous);
  // close unbalanced list wrappers
  for (const tag of ['ul', 'ol']) {
    const opens = (content.match(new RegExp(`<${tag}>`, 'g')) || []).length;
    const closes = (content.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (closes > opens) {
      for (let i = 0; i < closes - opens; i++) {
        content = content.replace(new RegExp(`</${tag}>`), '');
      }
    } else if (opens > closes) {
      content += `</${tag}>`.repeat(opens - closes);
    }
  }
  return content;
}

function getTags(html) {
  const tags = [];
  const re = /href=["'](?:https:\/\/medium\.com)?\/tag\/([a-z0-9-]+)/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[1].toLowerCase();
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

/** "YYYY-MM-DD HH:mm:ss" (UTC), the format rss2json uses for pubDate. */
function toRssDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
}

/**
 * Parse a Medium post page into an rss2json-like item.
 * @returns {object|null} null if the page does not look like a Medium post.
 */
function parseMediumPost(html, sourceUrl) {
  if (!html || isChallengePage(html)) {
    return null;
  }
  const ld = getJsonLd(html) || {};
  const canonical = stripQuery(
    getCanonical(html) || getMeta(html, 'og:url') || ld.url || sourceUrl || '',
  );
  const postId =
    (canonical && getMediumPostId(canonical)) ||
    (typeof ld.identifier === 'string' && /^[0-9a-f]{8,16}$/.test(ld.identifier)
      ? ld.identifier
      : null) ||
    ((/medium:\/\/p\/([0-9a-f]{8,16})/.exec(html) || [])[1] ?? null) ||
    (sourceUrl ? getMediumPostId(sourceUrl) : null);
  const title =
    getMeta(html, 'og:title') ||
    ld.headline ||
    ld.name ||
    (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] ||
    '';
  if (!postId || !title) {
    return null;
  }

  const ldAuthor = Array.isArray(ld.author) ? ld.author[0] : ld.author;
  const published =
    getMeta(html, 'article:published_time') ||
    ld.datePublished ||
    ld.dateCreated ||
    '';
  const content = extractContent(html);
  const metaDescription =
    getMeta(html, 'description') || getMeta(html, 'og:description') || '';
  const ldImage = Array.isArray(ld.image) ? ld.image[0] : ld.image;

  return {
    guid: mediumGuid(postId),
    link: canonical || stripQuery(sourceUrl) || mediumGuid(postId),
    title: decodeEntities(title).trim(),
    pubDate: toRssDate(published),
    author: getMeta(html, 'author') || (ldAuthor && ldAuthor.name) || '',
    thumbnail:
      safeHttpUrl(getMeta(html, 'og:image')) ||
      safeHttpUrl(getMeta(html, 'twitter:image:src')) ||
      safeHttpUrl(ldImage) ||
      '',
    // rss2json puts the article HTML in description too; mirror that when we
    // could extract the body, otherwise fall back to the meta description.
    description: content || escapeHtml(metaDescription),
    content,
    categories: getTags(html),
  };
}

/** Post URLs from a Medium sitemap.xml. */
function parseSitemapUrls(xml) {
  const urls = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(String(xml ?? '')))) {
    const url = stripQuery(decodeEntities(match[1]));
    if (url && getMediumPostId(url) && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

/** "@zfir" from a feed URL such as https://medium.com/feed/@zfir. */
function getFeedUser(feedUrl) {
  if (!feedUrl) {
    return null;
  }
  try {
    const url = new URL(feedUrl);
    const atPath = /\/feed\/(@[^/?#]+)/.exec(url.pathname);
    if (atPath) {
      return atPath[1];
    }
    const sub = /^([a-z0-9-]+)\.medium\.com$/i.exec(url.hostname);
    if (sub && sub[1] !== 'www') {
      return `@${sub[1]}`;
    }
  } catch {
    // ignore
  }
  return null;
}

module.exports = {
  stripQuery,
  getMediumPostId,
  mediumGuid,
  isChallengePage,
  sanitizeHtml,
  extractContent,
  parseMediumPost,
  parseSitemapUrls,
  getFeedUser,
  toRssDate,
};
