'use strict';

/*
 * Import Medium posts (including ones older than the last 10 in the RSS feed)
 * into the post archive used by the server.
 *
 *   npm run import:medium -- <post-url...>
 *   npm run import:medium -- --file urls.txt
 *   npm run import:medium -- --profile            # user from MEDIUM_FEED_URL
 *   npm run import:medium -- --profile @someone
 *   npm run import:medium -- --html saved-page.html
 *   IMPORT_TOKEN=... npm run import:medium -- --profile --push https://blog.example.com
 *
 * Run with --help for all options.
 */

const fs = require('fs');
const path = require('path');
const { ROOT, getConfig, numberFromEnv } = require('../config');
const { loadEnvFile } = require('../lib/env-file');
const { Archive } = require('../lib/archive');
const {
  stripQuery,
  getMediumPostId,
  mediumGuid,
  parseMediumPost,
  parseSitemapUrls,
  getFeedUser,
} = require('../lib/medium');
const {
  fetchMediumPost,
  fetchText,
  findChrome,
} = require('../lib/medium-fetch');
const { pushPosts, fetchRemoteIds } = require('../lib/push');

const HELP = `Usage: npm run import:medium -- [options] [post-url...]

Options:
  --file <path>        Read post URLs from a file (one per line, # comments)
  --profile [@user]    Discover the user's posts from their Medium sitemap
                       (default user comes from MEDIUM_FEED_URL)
  --html <path>        Import a saved Medium post page (repeatable)
  --save-html <dir>    Also save fetched pages to <dir> (to import elsewhere
                       with --html, e.g. on a machine without Chrome)
  --archive <path>     Archive file (default: DATA_DIR/ARCHIVE_FILE)
  --push <serverUrl>   Send posts to <serverUrl>/api/import instead of writing
                       a local archive (token from IMPORT_TOKEN or --token)
  --token <token>      Import token for --push (prefer the IMPORT_TOKEN env)
  --batch-size <n>     Posts per --push request (default 10)
  --force              Re-import posts that are already in the archive
  --dry-run            Print what would be imported, write nothing
  --chrome <path>      Chrome/Chromium binary (default: CHROME_PATH or PATH)
  --no-chrome          Never use headless Chrome
  --no-wayback         Never use the Wayback Machine
  --delay <ms>         Pause between requests (default 1500, or IMPORT_DELAY_MS)
  -h, --help           Show this help
`;

function parseArgs(argv, env = process.env) {
  const opts = {
    urls: [],
    files: [],
    html: [],
    profile: null,
    saveHtml: null,
    archive: null,
    push: null,
    token: null,
    batchSize: 10,
    force: false,
    dryRun: false,
    chrome: undefined,
    noChrome: false,
    wayback: true,
    delay: numberFromEnv(env.IMPORT_DELAY_MS, 1500),
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`${arg} needs a value`);
      }
      return value;
    };
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--file':
        opts.files.push(next());
        break;
      case '--html':
        opts.html.push(next());
        break;
      case '--profile':
        opts.profile =
          argv[i + 1] && argv[i + 1].startsWith('@') ? argv[++i] : true;
        break;
      case '--save-html':
        opts.saveHtml = next();
        break;
      case '--archive':
        opts.archive = next();
        break;
      case '--push':
        opts.push = next();
        break;
      case '--token':
        opts.token = next();
        break;
      case '--batch-size':
        opts.batchSize = Math.max(1, Number(next()) || 10);
        break;
      case '--force':
        opts.force = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--chrome':
        opts.chrome = next();
        break;
      case '--no-chrome':
        opts.noChrome = true;
        break;
      case '--no-wayback':
        opts.wayback = false;
        break;
      case '--delay':
        opts.delay = Number(next()) || 0;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`unknown option ${arg}`);
        }
        opts.urls.push(arg);
    }
  }
  return opts;
}

function readUrlFile(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

async function discoverProfileUrls(user, log, fetchOptions = {}) {
  const name = user.replace(/^@/, '');
  const sitemaps = [
    `https://${name}.medium.com/sitemap/sitemap.xml`,
    `https://medium.com/@${name}/sitemap/sitemap.xml`,
  ];
  for (const sitemap of sitemaps) {
    try {
      const { status, text } = await fetchText(sitemap, fetchOptions);
      const urls = status === 200 ? parseSitemapUrls(text) : [];
      log(`sitemap ${sitemap}: HTTP ${status}, ${urls.length} post URLs`);
      if (urls.length) {
        return urls;
      }
    } catch (error) {
      log(`sitemap ${sitemap}: ${error.message}`);
    }
  }
  return [];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Re-read the archive right before writing so concurrent writers are kept. */
function saveItems(archivePath, items, dryRun) {
  if (dryRun || !items.length) {
    return null;
  }
  const archive = new Archive(archivePath).load();
  const stats = archive.merge(items, new Date(), { markFetched: false });
  archive.save();
  return stats;
}

async function main(argv) {
  loadEnvFile(path.join(ROOT, '.env'));
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const config = getConfig();
  const fetchOptions = {
    timeoutMs: config.mediumFetchTimeoutMs,
    chromeTimeoutMs: config.chromeTimeoutMs,
    virtualTimeBudgetMs: config.chromeVirtualTimeBudgetMs,
  };
  if (config.mediumUserAgent) {
    fetchOptions.userAgent = config.mediumUserAgent;
  }
  const archivePath = opts.archive
    ? path.resolve(opts.archive)
    : config.archivePath;
  const log = (msg) => console.log(msg);

  let urls = [...opts.urls];
  for (const file of opts.files) {
    urls.push(...readUrlFile(file));
  }
  if (opts.profile) {
    const user =
      opts.profile === true ? getFeedUser(config.feedUrl) : opts.profile;
    if (!user) {
      throw new Error(
        '--profile needs a user (e.g. --profile @zfir) or MEDIUM_FEED_URL like https://medium.com/feed/@zfir',
      );
    }
    log(`Discovering posts for ${user}...`);
    urls.push(...(await discoverProfileUrls(user, log, fetchOptions)));
  }

  // Normalize and dedupe by Medium post id.
  const seen = new Set();
  const targets = [];
  for (const raw of urls) {
    const url = stripQuery(raw);
    const id = url && getMediumPostId(url);
    if (!id) {
      console.warn(`skip ${raw}: not a Medium post URL`);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      targets.push({ url, id });
    }
  }

  if (!targets.length && !opts.html.length) {
    process.stdout.write(HELP);
    return 1;
  }

  const token = opts.token || process.env.IMPORT_TOKEN || '';
  if (opts.push && !token) {
    throw new Error('--push needs a token: set IMPORT_TOKEN or pass --token');
  }
  // Ids already archived (locally, or on the server in --push mode).
  let existingIds;
  if (opts.push) {
    try {
      existingIds = await fetchRemoteIds(opts.push, {
        timeoutMs: config.importRemoteIdsTimeoutMs,
      });
      log(`Server ${opts.push} has ${existingIds.size} posts`);
    } catch (error) {
      console.warn(
        `could not list server posts (${error.message}); importing all`,
      );
      existingIds = new Set();
    }
  } else {
    existingIds = new Set(new Archive(archivePath).load().posts.keys());
  }
  const pending = [];
  const store = (post) => {
    if (opts.dryRun) {
      return;
    }
    if (opts.push) {
      pending.push(post);
    } else {
      saveItems(archivePath, [post], false);
    }
  };
  const chromePath = opts.noChrome ? null : findChrome(opts.chrome);
  if (opts.saveHtml) {
    fs.mkdirSync(opts.saveHtml, { recursive: true });
  }

  const summary = { imported: [], skipped: [], failed: [] };
  const record = (post, via) => {
    summary.imported.push({ title: post.title, guid: post.guid, via });
    log(`  ok via ${via}: ${post.title} (${post.pubDate || 'no date'})`);
    if (opts.dryRun) {
      const { content, description, ...rest } = post;
      log(
        `  ${JSON.stringify({
          ...rest,
          contentLength: content.length,
          descriptionLength: description.length,
        })}`,
      );
    }
  };

  for (const file of opts.html) {
    log(`[html] ${file}`);
    const post = parseMediumPost(fs.readFileSync(file, 'utf8'));
    if (!post) {
      summary.failed.push({ source: file, error: 'not a Medium post page' });
      console.error('  failed: not a Medium post page (Cloudflare challenge?)');
      continue;
    }
    if (existingIds.has(post.guid) && !opts.force) {
      summary.skipped.push({ title: post.title, guid: post.guid });
      log(`  already in archive: ${post.title} (use --force to re-import)`);
      continue;
    }
    store(post);
    record(post, 'html');
  }

  for (let i = 0; i < targets.length; i++) {
    const { url, id } = targets[i];
    log(`[${i + 1}/${targets.length}] ${url}`);
    if (existingIds.has(mediumGuid(id)) && !opts.force) {
      summary.skipped.push({ guid: mediumGuid(id) });
      log('  already in archive (use --force to re-import)');
      continue;
    }
    try {
      const { post, html, via } = await fetchMediumPost(url, {
        chromePath,
        wayback: opts.wayback,
        log,
        ...fetchOptions,
      });
      if (opts.saveHtml) {
        fs.writeFileSync(path.join(opts.saveHtml, `${id}.html`), html);
      }
      store(post);
      record(post, via);
    } catch (error) {
      summary.failed.push({ source: url, error: error.message });
      console.error(`  failed: ${error.message}`);
    }
    if (i < targets.length - 1 && opts.delay) {
      await sleep(opts.delay);
    }
  }

  let target = archivePath;
  if (opts.push) {
    target = opts.push;
    if (pending.length) {
      const result = await pushPosts(opts.push, token, pending, {
        overwrite: opts.force,
        batchSize: opts.batchSize,
        log,
        timeoutMs: config.importPushTimeoutMs,
      });
      log(
        `Server: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped, ${result.invalid.length} invalid (${result.total} total)`,
      );
      summary.push = result;
    }
  }

  log(
    `\nDone${
      opts.dryRun ? ' (dry run, nothing sent or written)' : ` -> ${target}`
    }: ${summary.imported.length} scraped, ${
      summary.skipped.length
    } already archived, ${summary.failed.length} failed.`,
  );
  main.lastSummary = summary;
  return summary.failed.length && !summary.imported.length ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}

module.exports = { main, parseArgs };
