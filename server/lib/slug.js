'use strict';

/*
 * Post URLs look like Medium's: /posts/<slug>-<mediumId>.
 * KEEP IN SYNC with app/utils/post-path.js (the Ember app uses the same rules;
 * server/test/slug.test.js checks both produce identical results).
 */

const ID_RE = /^[0-9a-f]{8,16}$/;
const TRAILING_ID_RE = /(?:^|-)([0-9a-f]{8,16})$/;

function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function lastPathSegment(url) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(
    String(url ?? ''),
  );
  const path = match ? match[1] : '';
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** Trailing hex id of a Medium URL path segment, e.g. "...-8ae23c507403". */
function mediumIdFromUrl(url) {
  const segment = lastPathSegment(url).toLowerCase();
  const match = TRAILING_ID_RE.exec(segment);
  return match ? match[1] : null;
}

/** 32-bit FNV-1a as 8 hex chars. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Medium post id, or a stable 12-hex hash for non-Medium posts. */
function getShortId(post) {
  if (!post) {
    return '';
  }
  return (
    mediumIdFromUrl(post.guid) ||
    mediumIdFromUrl(post.link) ||
    `${fnv1a(String(post.guid || post.link || post.title || ''))}${fnv1a(
      `#${post.guid || post.link || post.title || ''}`,
    )}`.slice(0, 12)
  );
}

/** Slug mirroring Medium's (link path minus the id), else from the title. */
function getSlug(post) {
  if (!post) {
    return 'post';
  }
  const id = getShortId(post);
  const segment = lastPathSegment(post.link).toLowerCase();
  let slug = '';
  if (segment && segment !== id && segment.endsWith(`-${id}`)) {
    slug = slugify(segment.slice(0, -(id.length + 1)));
  }
  return slug || slugify(post.title) || 'post';
}

/** "<slug>-<id>", the part after /posts/. */
function getPostRef(post) {
  return `${getSlug(post)}-${getShortId(post)}`;
}

/** Path like /posts/<slug>-<id> (rootURL defaults to "/"). */
function getPostPath(post, rootURL = '/') {
  return `${rootURL.replace(/\/?$/, '/')}posts/${getPostRef(post)}`;
}

/** Id from a /posts/<ref> segment: trailing hex id, or the whole ref. */
function parsePostRef(ref) {
  const value = String(ref ?? '').toLowerCase();
  if (ID_RE.test(value)) {
    return value;
  }
  const match = TRAILING_ID_RE.exec(value);
  return match ? match[1] : null;
}

module.exports = {
  slugify,
  mediumIdFromUrl,
  getShortId,
  getSlug,
  getPostRef,
  getPostPath,
  parsePostRef,
};
