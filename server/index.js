'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROOT, getConfig } = require('./config');
const { loadEnvFile } = require('./lib/env-file');

loadEnvFile(path.join(ROOT, '.env'));

const { Archive } = require('./lib/archive');
const { fetchFeed } = require('./lib/feed');
const { createHandler } = require('./app');

function main() {
  const config = getConfig();

  if (!fs.existsSync(path.join(config.distDir, 'index.html'))) {
    console.error(
      `[server] ${path.join(
        config.distDir,
        'index.html',
      )} not found. Run "npm run build" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const archive = new Archive(config.archivePath);
  try {
    archive.load();
    console.log(
      `[archive] loaded ${archive.size} posts from ${config.archivePath}`,
    );
  } catch (error) {
    // Keep the corrupt file for inspection and start with an empty archive.
    const backup = `${config.archivePath}.corrupt-${Date.now()}`;
    console.error(
      `[archive] could not read ${config.archivePath}: ${error.message}`,
    );
    try {
      fs.renameSync(config.archivePath, backup);
      console.error(`[archive] moved unreadable archive to ${backup}`);
    } catch {
      // ignore
    }
  }

  function reloadArchive() {
    try {
      if (archive.reloadIfChanged()) {
        console.log(
          `[archive] reloaded ${archive.size} posts from ${config.archivePath}`,
        );
      }
    } catch (error) {
      console.error(`[archive] reload failed: ${error.message}`);
    }
  }

  let refreshing = null;

  async function refresh() {
    if (refreshing) {
      return refreshing;
    }
    refreshing = (async () => {
      try {
        const items = await fetchFeed({
          feedUrl: config.feedUrl,
          apiKey: config.rss2JsonApiKey,
          timeoutMs: config.fetchTimeoutMs,
        });
        // Pick up posts written by the import script before merging, so the
        // save below never overwrites them.
        reloadArchive();
        const stats = archive.merge(items);
        archive.save();
        archive.lastFetchError = null;
        console.log(
          `[archive] refreshed: ${stats.added} added, ${stats.updated} updated, ${stats.unchanged} unchanged (${archive.size} total)`,
        );
      } catch (error) {
        archive.lastFetchError = error.message;
        console.error(`[archive] refresh failed: ${error.message}`);
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  const server = http.createServer(createHandler({ config, archive }));

  server.listen(config.port, config.host, () => {
    console.log(`[server] listening on http://${config.host}:${config.port}`);
  });

  refresh();

  let timer = null;
  if (config.refreshIntervalMinutes > 0) {
    timer = setInterval(refresh, config.refreshIntervalMinutes * 60 * 1000);
  }

  // Watch for external changes to the archive (e.g. `npm run import:medium`).
  const reloadTimer = setInterval(
    reloadArchive,
    config.archiveReloadSeconds * 1000,
  );
  reloadTimer.unref();

  function shutdown(signal) {
    console.log(`[server] ${signal} received, shutting down`);
    if (timer) {
      clearInterval(timer);
    }
    clearInterval(reloadTimer);
    // Closing the server lets the process exit once open requests finish.
    server.close();
    setTimeout(() => {
      // eslint-disable-next-line n/no-process-exit
      process.exit(0);
    }, 5000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
