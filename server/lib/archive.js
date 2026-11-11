'use strict';

const fs = require('fs');
const path = require('path');
const { mergePosts, sortPosts } = require('./posts');
const { getShortId, getSlug, getPostPath } = require('./slug');

const ARCHIVE_VERSION = 1;

/**
 * Persistent post archive stored as a JSON file. Posts are keyed by their
 * stable id (guid, then link, then title) and are never deleted.
 */
class Archive {
  constructor(filePath) {
    this.filePath = filePath;
    this.posts = new Map();
    this.lastFetchAt = null;
    this.lastFetchError = null;
    this._sorted = null;
    this._byShortId = null;
    this._public = null;
    this._mtimeMs = null;
  }

  _readMtime() {
    try {
      return fs.statSync(this.filePath).mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Reload from disk if another process (e.g. the import script) changed
   * the file since we last loaded or saved it.
   * @returns {boolean} true when the archive was reloaded
   */
  reloadIfChanged() {
    const mtime = this._readMtime();
    if (mtime === null || mtime === this._mtimeMs) {
      return false;
    }
    this.load();
    return true;
  }

  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        this._mtimeMs = null;
        return this;
      }
      throw error;
    }
    const data = JSON.parse(raw);
    const posts = Array.isArray(data) ? data : data.posts || [];
    this.posts = new Map();
    for (const post of posts) {
      if (post && post.id) {
        this.posts.set(post.id, post);
      }
    }
    this.lastFetchAt = data.lastFetchAt || null;
    this._sorted = null;
    this._byShortId = null;
    this._public = null;
    this._mtimeMs = this._readMtime();
    return this;
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload = {
      version: ARCHIVE_VERSION,
      updatedAt: new Date().toISOString(),
      lastFetchAt: this.lastFetchAt,
      posts: this.list(),
    };
    // Write atomically so a crash never leaves a truncated archive.
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(tmp, this.filePath);
    this._mtimeMs = this._readMtime();
  }

  merge(items, now = new Date(), { markFetched = true } = {}) {
    const stats = mergePosts(this.posts, items, now);
    if (markFetched) {
      this.lastFetchAt = now.toISOString();
    }
    this._sorted = null;
    this._byShortId = null;
    this._public = null;
    return stats;
  }

  /** Posts newest first. */
  list() {
    if (!this._sorted) {
      this._sorted = sortPosts(this.posts.values());
    }
    return this._sorted;
  }

  /** Find a post by the short id used in /posts/<slug>-<id> URLs. */
  findByShortId(shortId) {
    if (!shortId) {
      return null;
    }
    if (!this._byShortId) {
      this._byShortId = new Map();
      for (const post of this.posts.values()) {
        this._byShortId.set(getShortId(post), post);
      }
    }
    return this._byShortId.get(String(shortId).toLowerCase()) || null;
  }

  /** Posts newest first with their public `slug` and `path`. */
  listPublic() {
    if (!this._public) {
      this._public = this.list().map((post) => ({
        ...post,
        slug: getSlug(post),
        path: getPostPath(post),
      }));
    }
    return this._public;
  }

  get(id) {
    return id ? this.posts.get(id) || null : null;
  }

  get size() {
    return this.posts.size;
  }
}

module.exports = { Archive };
