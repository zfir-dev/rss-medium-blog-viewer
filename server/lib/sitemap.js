'use strict';

const { escapeXml } = require('./text');
const { toIsoDate, getModifiedDate } = require('./posts');
const { postUrl, siteBase } = require('./seo');

function renderSitemap(posts, siteUrl) {
  const latest = posts.length ? toIsoDate(posts[0].pubDate) : null;
  const urls = [
    `  <url>\n    <loc>${escapeXml(siteBase(siteUrl))}</loc>${
      latest ? `\n    <lastmod>${escapeXml(latest)}</lastmod>` : ''
    }\n  </url>`,
  ];
  for (const post of posts) {
    const lastmod = getModifiedDate(post);
    urls.push(
      `  <url>\n    <loc>${escapeXml(postUrl(siteUrl, post))}</loc>${
        lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ''
      }\n  </url>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    '\n',
  )}\n</urlset>\n`;
}

function renderRobots(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteBase(
    siteUrl,
  )}sitemap.xml\n`;
}

module.exports = { renderSitemap, renderRobots };
