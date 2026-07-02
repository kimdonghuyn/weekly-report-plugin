'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadOrCreateConfig, defaultConfig } = require('./config');

test('creates default config file (and parent dirs) when missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-config-'));
  const configPath = path.join(tmpDir, 'sub', 'config.json');
  const cfg = loadOrCreateConfig(configPath);
  assert.deepEqual(cfg, defaultConfig());
  assert.equal(fs.existsSync(configPath), true);
});

test('loads an existing config without overwriting it', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-config-'));
  const configPath = path.join(tmpDir, 'config.json');
  const custom = {
    scanRoots: ['D:/work'],
    authorEmail: 'a@b.com',
    weekStartsOn: 'monday',
    archivePath: 'D:/reports',
  };
  fs.writeFileSync(configPath, JSON.stringify(custom));
  const cfg = loadOrCreateConfig(configPath);
  assert.deepEqual(cfg, custom);
});
