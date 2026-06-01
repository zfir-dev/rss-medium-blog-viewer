import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const archivePath = path.resolve("public/blogs.json");
const sitemapPath = path.resolve("public/sitemap.xml");

await loadDotEnv();

const mediumFeedUrl = process.env.MEDIUM_FEED_URL;
const rss2JsonApiKey = process.env.RSS_2_JSON_API_KEY;
const siteUrl = trimTrailingSlash(process.env.SITE_URL || "");

if (!mediumFeedUrl || !rss2JsonApiKey) {
  throw new Error("MEDIUM_FEED_URL and RSS_2_JSON_API_KEY are required.");
}

const existingPosts = await readJson(archivePath, []);
const latestPosts = await fetchMediumPosts(mediumFeedUrl, rss2JsonApiKey);
const posts = mergePosts([...latestPosts, ...existingPosts]);

await writeFile(archivePath, `${JSON.stringify(posts, null, 2)}\n`);

if (siteUrl) {
  await writeFile(sitemapPath, sitemapXml(siteUrl, posts));
}

console.log(
  `Saved ${posts.length} blog post${
    posts.length === 1 ? "" : "s"
  } to public/blogs.json.`,
);

async function fetchMediumPosts(feedUrl, apiKey) {
  const url = new URL("https://api.rss2json.com/v1/api.json");
  url.searchParams.set("rss_url", feedUrl);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `rss2json request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (data.status && data.status !== "ok") {
    throw new Error(data.message || "rss2json returned an error.");
  }

  return data.items || [];
}

function mergePosts(posts) {
  const postMap = new Map();

  posts.forEach((post) => {
    if (!post) {
      return;
    }

    const key =
      post.guid || post.link || `${post.title || ""}-${post.pubDate || ""}`;
    const existingPost = postMap.get(key);

    postMap.set(key, {
      ...existingPost,
      ...post,
      description: post.description || descriptionFromPost(post),
    });
  });

  return Array.from(postMap.values())
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .map((post, index, allPosts) => ({
      ...post,
      slug: uniqueSlug(post, index, allPosts),
    }));
}

function uniqueSlug(post, index, posts) {
  const baseSlug = slugify(post.title || post.guid || post.link);
  const matchingPosts = posts.slice(0, index).filter((item) => {
    return slugify(item.title || item.guid || item.link) === baseSlug;
  });

  if (matchingPosts.length === 0) {
    return baseSlug;
  }

  return `${baseSlug}-${matchingPosts.length + 1}`;
}

function slugify(value = "") {
  const slug = value
    .toString()
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "post";
}

function descriptionFromPost(post) {
  const text = stripHtml(post.description || post.content || "");

  return text.length > 155 ? `${text.slice(0, 152).trim()}...` : text;
}

function stripHtml(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function loadDotEnv() {
  const envPath = path.resolve(".env");

  try {
    const env = await readFile(envPath, "utf8");

    env.split("\n").forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);

      if (!match || process.env[match[1]]) {
        return;
      }

      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function sitemapXml(baseUrl, posts) {
  const urls = [
    { loc: `${baseUrl}/`, lastmod: latestDate(posts) },
    ...posts.map((post) => ({
      loc: `${baseUrl}/post/${post.slug}`,
      lastmod: isoDate(post.pubDate),
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

function latestDate(posts) {
  return isoDate(posts[0]?.pubDate);
}

function isoDate(date) {
  if (!date) {
    return "";
  }

  return new Date(date).toISOString().slice(0, 10);
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, "");
}
