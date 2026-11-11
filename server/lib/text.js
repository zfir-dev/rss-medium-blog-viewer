'use strict';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for use in HTML text or a quoted attribute. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Escape a value for XML text/attribute content (sitemap). */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Serialize data as JSON that is safe to embed inside a <script> element.
 * Escapes characters that could close the script or break JS parsing.
 */
function safeJsonForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeEntities(text) {
  return String(text ?? '').replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code);
          } catch {
            return match;
          }
        }
        return match;
      }
      const named = NAMED_ENTITIES[entity.toLowerCase()];
      return named === undefined ? match : named;
    },
  );
}

/** Convert an HTML fragment to plain, whitespace-collapsed text. */
function htmlToText(html) {
  const withoutBlocks = String(html ?? '')
    .replace(/<(script|style|figcaption)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(withoutBlocks).replace(/\s+/g, ' ').trim();
}

function truncate(text, max = 160) {
  const value = String(text ?? '');
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3).replace(/[\s.,;:]+$/, '')}...`;
}

/** Return the URL if it is an absolute http(s) URL, otherwise null. */
function safeHttpUrl(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

module.exports = {
  escapeHtml,
  escapeXml,
  safeJsonForScript,
  decodeEntities,
  htmlToText,
  truncate,
  safeHttpUrl,
};
