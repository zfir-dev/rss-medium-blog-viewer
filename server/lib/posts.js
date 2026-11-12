'use strict';

const { decodeEntities, htmlToText, truncate, safeHttpUrl } = require('./text');

/**
 * Stable archive key (guid, then link, then title). Public URLs use
 * /posts/<slug>-<id> instead, see lib/slug.js.
 */
function getPostId(item) {
  if (!item) {
    return '';
  }
  return item.guid || item.link || item.title || '';
}

function firstImageSrc(html) {
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(String(html ?? ''));
  return match ? decodeEntities(match[1]) : null;
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  // rss2json returns "YYYY-MM-DD HH:mm:ss" in UTC.
  const normalized =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/**
 * Normalize an rss2json item into the archive shape. The shape stays
 * compatible with rss2json items so the Ember app can render it unchanged.
 */
function normalizePost(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const post = {
    guid: asString(item.guid),
    link: asString(item.link),
    title: asString(item.title),
    pubDate: asString(item.pubDate),
    author: asString(item.author),
    thumbnail: '',
    description: asString(item.description),
    content: asString(item.content),
    categories: Array.isArray(item.categories)
      ? item.categories.filter((c) => typeof c === 'string')
      : [],
  };
  post.thumbnail =
    safeHttpUrl(item.thumbnail) ||
    safeHttpUrl(firstImageSrc(post.content)) ||
    safeHttpUrl(firstImageSrc(post.description)) ||
    '';
  post.id = getPostId(post);
  if (!post.id) {
    return null;
  }
  return post;
}

const COMPARED_FIELDS = [
  'guid',
  'link',
  'title',
  'pubDate',
  'author',
  'thumbnail',
  'description',
  'content',
  'categories',
];

function hasChanged(existing, incoming) {
  return COMPARED_FIELDS.some(
    (field) =>
      JSON.stringify(existing[field]) !== JSON.stringify(incoming[field]),
  );
}

/**
 * Merge feed items into the archive. Posts are never removed; existing posts
 * are updated when any stored field changed.
 *
 * @param {Map<string, object>} archive map of id -> post (mutated)
 * @param {object[]} items raw feed items
 * @param {Date} now
 * @returns {{added: number, updated: number, unchanged: number}}
 */
function mergePosts(archive, items, now = new Date()) {
  const stats = { added: 0, updated: 0, unchanged: 0 };
  const timestamp = now.toISOString();

  for (const raw of items || []) {
    const incoming = normalizePost(raw);
    if (!incoming) {
      continue;
    }
    const existing = archive.get(incoming.id);
    if (!existing) {
      archive.set(incoming.id, {
        ...incoming,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        updatedAt: timestamp,
      });
      stats.added += 1;
    } else if (hasChanged(existing, incoming)) {
      archive.set(incoming.id, {
        ...existing,
        ...incoming,
        // keep a thumbnail we already know about if the feed dropped it
        thumbnail: incoming.thumbnail || existing.thumbnail || '',
        firstSeenAt: existing.firstSeenAt || timestamp,
        lastSeenAt: timestamp,
        updatedAt: timestamp,
      });
      stats.updated += 1;
    } else {
      existing.lastSeenAt = timestamp;
      stats.unchanged += 1;
    }
  }

  return stats;
}

function postTime(post) {
  const iso = toIsoDate(post.pubDate);
  return iso ? Date.parse(iso) : 0;
}

/** Posts sorted newest first. */
function sortPosts(posts) {
  return [...posts].sort((a, b) => postTime(b) - postTime(a));
}

/** Last-modified date: the archive update time if the post changed after
 * we first saw it, otherwise the publish date. */
function getModifiedDate(post) {
  if (
    post.updatedAt &&
    post.firstSeenAt &&
    post.updatedAt !== post.firstSeenAt
  ) {
    return toIsoDate(post.updatedAt);
  }
  return toIsoDate(post.pubDate);
}

function getPostDescription(post, max = 160) {
  let text = htmlToText(post.description || post.content || '');
  // Medium content usually starts with the title as a heading; skip it.
  const title = htmlToText(post.title || '');
  if (title && text.startsWith(title) && text.length > title.length) {
    text = text.slice(title.length).trim();
  }
  return truncate(text, max);
}

module.exports = {
  getPostId,
  normalizePost,
  mergePosts,
  sortPosts,
  toIsoDate,
  getPostDescription,
  getModifiedDate,
};
