'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/import-medium');

test('parseArgs delay defaults to 1500 or IMPORT_DELAY_MS', () => {
  assert.equal(parseArgs([], {}).delay, 1500);
  assert.equal(parseArgs([], { IMPORT_DELAY_MS: '2500' }).delay, 2500);
  assert.equal(
    parseArgs(['--delay', '100'], { IMPORT_DELAY_MS: '2500' }).delay,
    100,
  );
  assert.equal(
    parseArgs(['--delay', '0'], { IMPORT_DELAY_MS: '2500' }).delay,
    0,
  );
});
