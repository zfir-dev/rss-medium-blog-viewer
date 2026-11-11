# rss-medium-blog-viewer

The RSS Medium Blog Viewer is an Ember application designed to transform your Medium blog into a personalized, self-hosted blog. This enables bloggers to display their Medium content in a unique and customizable format on their personal website.

## Demo

Here is a [demo](https://blog.zfir.dev/) of the application.

## Prerequisites

You will need the following things properly installed on your computer.

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) (with npm)
* [Ember CLI](https://cli.emberjs.com/release/)
* [Google Chrome](https://google.com/chrome/)

## Installation

* `git clone <repository-url>`
* `cd rss-medium-blog-viewer`
* `npm install`

## Setup Environment Variables

* Create a .env file
* Add the following properties based on your details in the file:
  * `PAGE_TITLE`
    * Use to set title of the page
  * `ICON_URL`
    * Use to set an icon on the top left of the page
    * Can be a local file that is uploaded in the public folder
    * Can be an online link
    * If not set, it will use the title of the page as default
  * `MEDIUM_URL`
    * Original link of your medium page
    * Example 1: https://medium.com/@zfir
    * Example 2: https://zfir.medium.com/
  * `MEDIUM_FEED_URL`
    * Link to the feed of your medium page
    * Note: It is not same as the MEDIUM_URL
    * Example: https://medium.com/feed/@zfir
  * `RSS_2_JSON_API_KEY`
    * API Key from the service rss2json
    * Sign up for a key on this [link](https://rss2json.com/)

The application also updates the page title, description, canonical URL, Open
Graph/Twitter metadata, and JSON-LD structured data for the selected article.
Each article has a shareable, Medium-style URL: `/posts/<slug>-<mediumId>`,
e.g. `/posts/creating-a-vm-on-oracle-cloud-using-always-free-resources-8ae23c507403`.
The slug mirrors the Medium link (falling back to a slug of the title) and the
id is Medium's 12-character post id. Posts are looked up by the id only, so a
wrong or outdated slug redirects (301 on the server) to the current URL.

Here is an example of how your .env file should look:
```
PAGE_TITLE="Zafir's Blogs"
ICON_URL=https://miro.medium.com/v2/resize:fill:64:64/1*NxSbBQe2m7Hab7G4KljJhA.jpeg
MEDIUM_URL=https://zfir.medium.com/
MEDIUM_FEED_URL=https://medium.com/feed/@zfir
RSS_2_JSON_API_KEY=<YOUR_API_KEY>
```

## Local Development

* `npm run start`
* Visit your app at [http://localhost:4200](http://localhost:4200).

## Deployment

There are two ways to deploy the app:

1. **Node server (recommended, needed for SEO).** A tiny dependency-free Node
   server in `server/` serves the built app, renders SEO tags on the server and
   keeps a persistent archive of every post ever seen in the feed.
2. **Plain static hosting.** `dist/` works on any static host (GitHub Pages,
   Netlify, S3...). SEO tags are then only set by JavaScript in the browser,
   and only the last 10 posts from the Medium feed are shown.

### Architecture

```
                 every hour                       POST /api/import
 Medium RSS ──(rss2json)──┐               ┌──── (Bearer IMPORT_TOKEN) ────┐
 (last 10 posts)          ▼               ▼                               │
                 ┌──────────────────────────────┐        ┌────────────────┴───────────┐
                 │ Node server (server/)        │        │ Importer (off the server)  │
                 │  - merges into the archive   │        │ npm run import:medium      │
                 │  - injects SEO tags          │        │  --profile --push <site>   │
                 │  - /api/posts, /sitemap.xml  │        │ on your laptop or a        │
                 │  - serves dist/ (Ember app)  │        │ scheduled GitHub Action    │
                 └──────────────┬───────────────┘        └──────────────▲─────────────┘
                                │                                       │ scrapes
                 /data/posts.json (volume, source of truth)      Medium post pages
```

* The **server** stays lean: plain Node, no npm dependencies, no browser.
* The **archive** (`DATA_DIR/posts.json`, a Docker volume) is the source of
  truth. Posts are merged by guid and never deleted.
* The **RSS merge** runs on startup and every `FEED_REFRESH_INTERVAL_MINUTES`.
* The **importer** scrapes older posts (Medium's RSS only has the last 10)
  somewhere that can get past Medium's Cloudflare checks, and pushes them to
  `POST /api/import`.

### Build

* Local: `npm exec ember build`
* Production: `npm run build` (output in `dist/`)

The `PAGE_TITLE`, `ICON_URL`, `GA_ID`, `MEDIUM_URL`, `MEDIUM_FEED_URL`,
`RSS_2_JSON_API_KEY` and `POSTS_API_URL` variables are baked into the bundle at
build time.

### Node server (SEO + post archive)

```
npm run build
npm run serve        # node server/index.js, listens on http://0.0.0.0:3000
```

What it does:

* **Server-side SEO.** For `/` and `/posts/<slug>-<id>` it injects `<title>`,
  meta description, canonical URL, Open Graph (`og:type` article, title,
  description, image, url, site_name), Twitter card (`summary_large_image` when
  the article has a thumbnail) and JSON-LD `BlogPosting` into `index.html`, so
  crawlers and link previews (Slack, X, Facebook, LinkedIn...) see them
  without running JavaScript. The image is the article thumbnail, falling back
  to `ICON_URL`.
* **Persistent post archive.** Medium's RSS feed only returns the last 10
  posts. On startup and then every `FEED_REFRESH_INTERVAL_MINUTES`, the server
  fetches the feed (via rss2json, same as the app) and merges the posts into
  `DATA_DIR/posts.json`. Posts are keyed by their id, updated when they change
  and never deleted, so older posts keep their SEO tags, sitemap entry and
  shareable links forever. Keep `DATA_DIR` on a persistent volume.
* **`/api/posts`** returns the whole archive (newest first, same shape as
  rss2json items, plus `slug` and `path`). The app uses it automatically and falls back to rss2json
  when it is unavailable (static hosting).
* **Post URLs.** `/posts/<slug>-<id>` is resolved by the trailing id; a
  different slug, upper-case, a bare id or a trailing slash gets a `301` to the
  canonical path. Unknown posts get a `404` with the app shell (`noindex`).
* **`/sitemap.xml`** lists the home page and every archived post.
* **`/robots.txt`** allows everything and points to the sitemap.
* **`/healthz`** returns `{ "status": "ok" }` for health checks.
* **`/api/import`** accepts posts pushed by the importer (see below). Open it
  in a browser for a usage page.

The server reads `.env` if present; real environment variables take precedence.

Server environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAGE_TITLE` | | Site name used in titles and `og:site_name` |
| `ICON_URL` | | Fallback image for link previews (must be an absolute `http(s)` URL to be used) |
| `MEDIUM_FEED_URL` | | Medium feed to archive, e.g. `https://medium.com/feed/@zfir` |
| `RSS_2_JSON_API_KEY` | | rss2json API key |
| `SITE_URL` | from request | Public URL used for canonical/og:url/sitemap, e.g. `https://blog.zfir.dev`. Recommended behind a proxy |
| `SITE_DESCRIPTION` | `Articles from <PAGE_TITLE>` | Home page description |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DIST_DIR` | `dist` | Built Ember app |
| `DATA_DIR` | `data` | Directory holding the archive |
| `ARCHIVE_FILE` | `posts.json` | Archive file name (relative to `DATA_DIR`) |
| `FEED_REFRESH_INTERVAL_MINUTES` | `60` | Minutes between feed refreshes (`0` = only on startup) |
| `FEED_FETCH_TIMEOUT_MS` | `15000` | Timeout for each feed request |
| `IMPORT_TOKEN` | | Bearer token for `POST /api/import`. Unset = endpoint disabled. Generate with `openssl rand -hex 32` |
| `IMPORT_MAX_BYTES` | `5242880` | Max request body for `/api/import` (5 MB) |
| `IMPORT_MAX_POSTS` | `100` | Max posts per `/api/import` request |
| `ARCHIVE_RELOAD_SECONDS` | `10` | How often the server checks the archive file for external changes (e.g. imports) |

App (build-time) variable:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTS_API_URL` | `/api/posts` | Where the app loads the archive from. Set to `false` to always use rss2json |

### Importing older Medium posts

Medium's RSS feed only has the last 10 posts. The importer scrapes Medium post
pages and either pushes them to a running server (recommended) or writes a
local archive file.

```
# push to the server (run on your laptop or in CI)
export IMPORT_TOKEN=...            # same value as on the server
npm run import:medium -- --profile --push https://blog.zfir.dev
npm run import:medium -- --push https://blog.zfir.dev https://medium.com/@you/some-post-1234abcd5678

# write DATA_DIR/posts.json directly (e.g. before the first deploy)
npm run import:medium -- --profile
npm run import:medium -- --file urls.txt          # one URL per line
npm run import:medium -- --dry-run --profile      # preview only
```

* Query strings such as `?source=...` are stripped. Each post gets the RSS
  guid `https://medium.com/p/<post-id>`, so it merges with feed items instead of
  being duplicated. Posts the archive (or server) already has are skipped
  unless `--force` (with `--push`, `--force` sends `"overwrite": true`).
* `--profile` reads `https://<user>.medium.com/sitemap/sitemap.xml`; the user
  defaults to the one in `MEDIUM_FEED_URL`. Posts published only in a
  publication may not be listed there; pass their URLs directly.
* `--push <url>` sends posts in batches (`--batch-size`, default 10) to
  `<url>/api/import`. The token comes from `IMPORT_TOKEN` or `--token`.
* It extracts title, canonical link, publish date, author, `og:image`,
  description, tags and the article body (sanitized HTML).
* Medium is behind a Cloudflare challenge that blocks some networks (it blocks
  some servers and datacenter IPs). The importer tries a plain request, then
  headless Chrome (if found, or `CHROME_PATH` / `--chrome`; set
  `CHROME_NO_SANDBOX=1` where the Chrome sandbox cannot start), then the
  Wayback Machine. You can also save pages with `--save-html <dir> --dry-run`
  and import them later with `--html <file>`.
* Local writes are atomic and never delete posts. A running server picks up
  changes to its archive file within `ARCHIVE_RELOAD_SECONDS` (default 10).

### Import API (`/api/import`)

Open `GET /api/import` in a browser for a usage page (or send
`Accept: application/json`). It shows whether the endpoint is enabled, but
never the token or any archived data.

`POST /api/import` needs `IMPORT_TOKEN` to be set on the server; otherwise it
answers `403`.

```
curl -X POST https://blog.zfir.dev/api/import \
  -H "Authorization: Bearer $IMPORT_TOKEN" \
  -H "Content-Type: application/json" \
  --data @posts.json
```

`posts.json`:

```json
{
  "overwrite": false,
  "posts": [
    {
      "title": "Creating a VM on Oracle Cloud (Using Always Free Resources)",
      "link": "https://medium.com/spoon-consulting/creating-a-vm-on-oracle-cloud-using-always-free-resources-8ae23c507403",
      "guid": "https://medium.com/p/8ae23c507403",
      "pubDate": "2023-11-15 10:11:55",
      "author": "Zafir Sk Heerah",
      "thumbnail": "https://miro.medium.com/v2/resize:fit:1200/1*HyUhohl37oa-nIEWjHI5aA.png",
      "description": "<p>Short summary or the article HTML.</p>",
      "content": "<h2>Always Free Resources</h2><p>…</p>",
      "categories": ["oracle", "oracle-cloud"]
    }
  ]
}
```

* Required: `title`, `link` (absolute http(s) URL). `guid` is derived from a
  Medium link (`https://medium.com/p/<id>`) when missing, otherwise the link.
* `pubDate` accepts ISO dates or `YYYY-MM-DD HH:mm:ss` (UTC). HTML in
  `description`/`content` is sanitized; `thumbnail` must be an http(s) URL.
* Existing posts are skipped unless `"overwrite": true`, in which case they are
  updated when something changed. Nothing is ever deleted.
* Limits: `IMPORT_MAX_BYTES` (5 MB) per request and `IMPORT_MAX_POSTS` (100)
  posts per request.

Response:

```json
{ "added": 1, "updated": 0, "skipped": 0, "invalid": [], "total": 25 }
```

`invalid` lists posts that failed validation (`{ "index": 3, "error": "..." }`);
valid posts in the same request are still imported. Errors: `400` invalid JSON
or body (or no valid posts), `401` missing or wrong token, `403` endpoint
disabled, `413` body too large.

### Scheduled import with GitHub Actions

`.github/workflows/import-medium.yml` runs the importer every 12 hours (and on
demand from the Actions tab) and pushes to your server. Configure it in
**Settings → Secrets and variables → Actions**:

* Secret `IMPORT_TOKEN`: same value as the server's `IMPORT_TOKEN`.
* Variable `SITE_URL`: your public URL, e.g. `https://blog.zfir.dev`.
* Variable `MEDIUM_FEED_URL` (e.g. `https://medium.com/feed/@zfir`) or
  `MEDIUM_USER` (e.g. `@zfir`).

The job skips itself when these are missing (e.g. on forks). The manual run
accepts extra post URLs (for publication posts missing from the sitemap) and a
`force` option. GitHub runner IPs may get Medium's Cloudflare challenge; the
importer then falls back to the headless Chrome that ships with
`ubuntu-latest`, then the Wayback Machine. If a run still fails to scrape,
run the importer from your own machine with `--push`.

### Docker

```
docker build -t rss-medium-blog-viewer \
  --build-arg PAGE_TITLE="Zafir's Blogs" \
  --build-arg ICON_URL=https://... \
  --build-arg MEDIUM_URL=https://zfir.medium.com/ \
  --build-arg MEDIUM_FEED_URL=https://medium.com/feed/@zfir \
  --build-arg RSS_2_JSON_API_KEY=<YOUR_API_KEY> \
  --build-arg GA_ID=<OPTIONAL_GA_ID> .

docker run -d -p 3000:3000 \
  -e SITE_URL=https://blog.example.com \
  -e IMPORT_TOKEN=$(openssl rand -hex 32) \
  -v rss-blog-data:/data \
  rss-medium-blog-viewer
```

Build args are also used as runtime defaults, so they only need to be set once.
The archive is stored in the `/data` volume.

### Coolify

* Create an application from the repository with the **Dockerfile** build pack.
* Add the variables above. Mark the app variables (`PAGE_TITLE`, `ICON_URL`,
  `GA_ID`, `MEDIUM_URL`, `MEDIUM_FEED_URL`, `RSS_2_JSON_API_KEY`) as
  **build variables** too, and set `SITE_URL` to your public URL.
* Add `IMPORT_TOKEN` as a runtime-only secret (not a build variable) to enable
  `/api/import`.
* Set the exposed port to `3000`.
* Add a persistent storage volume mounted at `/data` so the archive survives
  redeploys.
* Imports go through the public URL, so no extra ports or SSH access are needed.

### Static hosting

Upload `dist/` to any static host and serve `index.html` for unknown paths
(needed for `/posts/...` URLs).
Everything works, but SEO tags are client-side only, only the last 10 posts
are listed, and `public/robots.txt` is served as-is (no sitemap).

## Tests

* `npm run lint`
* `npm run test:ember` (Ember app, needs Chrome)
* `npm run test:server` (Node server, uses the built-in `node:test` runner)
* `npm test` runs all of the above

## Further Reading / Useful Links

* [ember.js](https://emberjs.com/)
* [ember-cli](https://cli.emberjs.com/release/)
* Development Browser Extensions
  * [ember inspector for chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
  * [ember inspector for firefox](https://addons.mozilla.org/en-US/firefox/addon/ember-inspector/)
