# rss-medium-blog-viewer

A self-hosted front-end for a Medium blog. An Ember app displays your posts,
and a small Node server adds real SEO plus a permanent archive — Medium's RSS
feed only returns the last 10 posts.

## Demo

[https://blog.zfir.dev/](https://blog.zfir.dev/)

## Features

- Your Medium posts on a site you control, with your own title and icon
- Shareable post URLs: `/posts/<slug>-<mediumId>` (resolved by the Medium id;
  a wrong or outdated slug gets a `301` to the canonical path)
- Server-side SEO: title, description, canonical URL, Open Graph, Twitter
  cards, and JSON-LD, so crawlers and link previews do not need JavaScript
- Permanent post archive, sitemap, and robots.txt
- Import of older posts (beyond the last 10 in the RSS feed)
- Deploy anywhere that can run Docker or Node

## Architecture

```
                 every hour                       POST /api/import
 Medium RSS ──(rss2json)──┐               ┌──── (Bearer IMPORT_TOKEN) ────┐
 (last 10 posts)          ▼               ▼                               │
                 ┌──────────────────────────────┐        ┌────────────────┴───────────┐
                 │ Node server (server/)        │        │ Importer (off the server)  │
                 │  - merges into the archive   │        │ npm run import:medium      │
                 │  - injects SEO tags          │        │  --profile --push <site>   │
                 │  - /api/posts, /sitemap.xml  │        │ on your laptop or a        │
                 │  - serves dist/ (Ember app)  │        │ any schedule you like      │
                 └──────────────┬───────────────┘        └──────────────▲─────────────┘
                                │                                       │ scrapes
                 /data/posts.json (volume, source of truth)      Medium post pages
```

- The **server** is plain Node: no npm dependencies, no browser.
- The **archive** (`DATA_DIR/posts.json`) is the source of truth. Posts are
  merged by guid and never deleted. On startup and every
  `FEED_REFRESH_INTERVAL_MINUTES`, the server merges the latest RSS items.
- The **importer** scrapes older posts from a machine that can get past
  Medium's Cloudflare checks, and pushes them to `POST /api/import`.

`dist/` can also be uploaded to a static host, but then SEO is client-side
only, only the last 10 posts appear, and there is no sitemap.

## Quick start

You need [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) (with
npm). Chrome is only required for Ember tests.

```
git clone <repository-url>
cd rss-medium-blog-viewer
npm install
```

Create a `.env` file:

```
PAGE_TITLE="Zafir's Blogs"
ICON_URL=https://miro.medium.com/v2/resize:fill:64:64/1*NxSbBQe2m7Hab7G4KljJhA.jpeg
MEDIUM_URL=https://zfir.medium.com/
MEDIUM_FEED_URL=https://medium.com/feed/@zfir
RSS_2_JSON_API_KEY=<YOUR_API_KEY>
```

- Development (Ember dev server): `npm start` — http://localhost:4200
- Production-like (built app + Node server): `npm run build && npm run serve`
  — http://localhost:3000

Get an rss2json API key at [rss2json.com](https://rss2json.com/).

## Environment variables

The Ember app bakes its variables into the bundle at **build** time
(`PAGE_TITLE`, `ICON_URL`, `GA_ID`, `MEDIUM_URL`, `MEDIUM_FEED_URL`,
`RSS_2_JSON_API_KEY`, `POSTS_API_URL`). The Node server reads a `.env` file if
present; real environment variables take precedence.

### App (build time)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAGE_TITLE` | | Site name in the header, titles, and `og:site_name` |
| `ICON_URL` | | Header icon. A `public/` file or any URL works in the app; for server-side link previews it must be an absolute `http(s)` URL |
| `GA_ID` | | Optional Google Analytics id |
| `MEDIUM_URL` | | Link to your Medium profile, e.g. `https://zfir.medium.com/` or `https://medium.com/@zfir` |
| `MEDIUM_FEED_URL` | | Medium RSS feed, e.g. `https://medium.com/feed/@zfir` (not the same as `MEDIUM_URL`) |
| `RSS_2_JSON_API_KEY` | | rss2json API key |
| `POSTS_API_URL` | `/api/posts` | Where the app loads the archive from. Set to `false` to always use rss2json |

### Server

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAGE_TITLE` | | Site name used in titles and `og:site_name` |
| `ICON_URL` | | Fallback image for link previews (must be an absolute `http(s)` URL to be used) |
| `MEDIUM_FEED_URL` | | Medium feed to archive, e.g. `https://medium.com/feed/@zfir` |
| `RSS_2_JSON_API_KEY` | | rss2json API key |
| `SITE_URL` | from request | Public URL for canonical tags, `og:url`, and the sitemap, e.g. `https://blog.example.com`. Set this behind a reverse proxy |
| `SITE_DESCRIPTION` | `Articles from <PAGE_TITLE>` | Home page description (`Articles from Blog` if `PAGE_TITLE` is also unset) |
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
| `ARCHIVE_RELOAD_SECONDS` | `10` | How often the server checks the archive file for external changes |
| `CACHE_SITEMAP_SECONDS` | `3600` | `Cache-Control` max-age for `/sitemap.xml` (`0` = `no-cache`) |
| `CACHE_ROBOTS_SECONDS` | `3600` | `Cache-Control` max-age for `/robots.txt` (`0` = `no-cache`) |
| `CACHE_POSTS_API_SECONDS` | `300` | `Cache-Control` max-age for `/api/posts` (`0` = `no-cache`) |
| `CACHE_STATIC_SECONDS` | `3600` | `Cache-Control` max-age for non-fingerprinted static files (`0` = `no-cache`) |
| `CACHE_ASSETS_SECONDS` | `31536000` | `Cache-Control` max-age for fingerprinted `/assets/` files (`0` = `no-cache`; otherwise also `immutable`) |
| `CACHE_REDIRECT_SECONDS` | `3600` | `Cache-Control` max-age for the 301 from a non-canonical post URL (`0` = `no-cache`) |

The server process ignores the importer variables below.

### Importer

| Variable | Default | Purpose |
| --- | --- | --- |
| `IMPORT_DELAY_MS` | `1500` | Pause between Medium fetches (`--delay` overrides) |
| `MEDIUM_FETCH_TIMEOUT_MS` | `20000` | Timeout for each plain Medium / sitemap / Wayback request |
| `CHROME_TIMEOUT_MS` | `60000` | Timeout for a headless Chrome render |
| `CHROME_VIRTUAL_TIME_BUDGET_MS` | `15000` | Chrome `--virtual-time-budget` |
| `IMPORT_PUSH_TIMEOUT_MS` | `60000` | Timeout for each `POST /api/import` batch |
| `IMPORT_REMOTE_IDS_TIMEOUT_MS` | `30000` | Timeout for `GET /api/posts` when deciding what to skip |
| `MEDIUM_USER_AGENT` | Chrome 130 desktop UA | `User-Agent` for Medium requests and Chrome |
| `CHROME_PATH` | first Chrome/Chromium on `PATH` | Chrome/Chromium binary (`--chrome` overrides) |
| `CHROME_NO_SANDBOX` | | Set to `1` where the Chrome sandbox cannot start (e.g. many CI runners) |

## Importing posts

Medium's RSS feed only has the last 10 posts. The importer scrapes Medium
pages and either pushes them to a running server (recommended) or writes a
local archive file. Run it by hand or on any schedule you like (cron, CI, a
timer). Prefer a machine that can reach Medium; some servers and datacenter
IPs are blocked by Cloudflare.

```
# push to the server (run on your laptop or in CI)
export IMPORT_TOKEN=...            # same value as on the server
npm run import:medium -- --profile --push https://blog.example.com
npm run import:medium -- --push https://blog.example.com https://medium.com/@you/some-post-1234abcd5678

# write DATA_DIR/posts.json directly (e.g. before the first deploy)
npm run import:medium -- --profile
npm run import:medium -- --file urls.txt          # one URL per line
npm run import:medium -- --dry-run --profile      # preview only
```

- Query strings such as `?source=...` are stripped. Each post gets the RSS
  guid `https://medium.com/p/<post-id>`, so it merges with feed items instead
  of being duplicated. Posts the archive (or server) already has are skipped
  unless `--force` (with `--push`, `--force` sends `"overwrite": true`).
- `--profile` reads `https://<user>.medium.com/sitemap/sitemap.xml`; the user
  defaults to the one in `MEDIUM_FEED_URL`. Posts published only in a
  publication may not be listed there; pass their URLs directly.
- `--push <url>` sends posts in batches (`--batch-size`, default 10) to
  `<url>/api/import`. The token comes from `IMPORT_TOKEN` or `--token`.
- It extracts title, canonical link, publish date, author, `og:image`,
  description, tags, and the article body (sanitized HTML).
- Fetch order: a plain request, then headless Chrome (if found, or
  `CHROME_PATH` / `--chrome`; set `CHROME_NO_SANDBOX=1` where the Chrome
  sandbox cannot start), then the Wayback Machine. You can also save pages
  with `--save-html <dir> --dry-run` and import them later with `--html <file>`.
- Local writes are atomic and never delete posts. A running server picks up
  changes to its archive file within `ARCHIVE_RELOAD_SECONDS` (default 10).

## Import API

Open `GET /api/import` in a browser for a usage page (or send
`Accept: application/json`). It shows whether the endpoint is enabled, but
never the token or any archived data.

`POST /api/import` needs `IMPORT_TOKEN` on the server; otherwise it answers
`403`.

```
curl -X POST https://blog.example.com/api/import \
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

- Required: `title`, `link` (absolute http(s) URL). `guid` is derived from a
  Medium link (`https://medium.com/p/<id>`) when missing, otherwise the link.
- `pubDate` accepts ISO dates or `YYYY-MM-DD HH:mm:ss` (UTC). HTML in
  `description`/`content` is sanitized; `thumbnail` must be an http(s) URL.
- Existing posts are skipped unless `"overwrite": true`, in which case they
  are updated when something changed. Nothing is ever deleted.
- Limits: `IMPORT_MAX_BYTES` (5 MB) per request and `IMPORT_MAX_POSTS` (100)
  posts per request.

Response:

```json
{ "added": 1, "updated": 0, "skipped": 0, "invalid": [], "total": 25 }
```

`invalid` lists posts that failed validation (`{ "index": 3, "error": "..." }`);
valid posts in the same request are still imported. Errors: `400` invalid JSON
or body (or no valid posts), `401` missing or wrong token, `403` endpoint
disabled, `413` body too large.

The server also serves:

- `/` and `/posts/<slug>-<id>` — app shell with injected SEO tags (unknown
  posts are a `404` with `noindex`)
- `/api/posts` — the full archive (newest first; same shape as rss2json items,
  plus `slug` and `path`). The app uses this and falls back to rss2json if it
  is unavailable
- `/sitemap.xml` — home page and every archived post
- `/robots.txt` — allows everything and points to the sitemap
- `/healthz` — `{ "status": "ok" }` for health checks

## Deployment

The project is host-agnostic. Any platform that can run Docker or Node works
(a VM, a PaaS, a home server, and so on). If you put it behind a reverse
proxy, set `SITE_URL` to the public URL (e.g. `https://blog.example.com`) so
canonical tags, Open Graph URLs, and the sitemap are correct. Persist
`DATA_DIR` (or the `/data` volume) so the archive survives restarts.

### Docker

App variables are baked in at image build time. Those same values are also
used as runtime defaults for the overlapping server variables, so you only
need to set them once.

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

Expose port `3000` (or set `PORT`), mount a volume at `/data`, and pass any
other runtime env vars with `-e`.

### Plain Node

```
npm run build
SITE_URL=https://blog.example.com IMPORT_TOKEN=$(openssl rand -hex 32) npm run serve
```

`npm run serve` runs `node server/index.js` and listens on `http://0.0.0.0:3000`
by default. Point `DATA_DIR` at a persistent directory (default: `data/` in
the project). Keep the same environment variables as in the table above.

### Static hosting

Upload `dist/` to any static host and serve `index.html` for unknown paths
(needed for `/posts/...` URLs). Everything works, but SEO tags are client-side
only, only the last 10 posts are listed, and `public/robots.txt` is served
as-is (no sitemap).

## Development and testing

- `npm start` — Ember dev server at http://localhost:4200
- `npm run build` — production build into `dist/`
- `npm run serve` — Node server (run a build first)
- `npm run lint`
- `npm run test:ember` — Ember app (needs Chrome)
- `npm run test:server` — Node server (`node:test`)
- `npm test` — lint plus both test suites
