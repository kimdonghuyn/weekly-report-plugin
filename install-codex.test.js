'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installSkills, installPlugin } = require('./install-codex');

function makeSkillsSrc() {
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-src-'));
  const skillDir = path.join(srcDir, 'weekly-log');
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: weekly-log\n---\n', 'utf8');
  fs.writeFileSync(path.join(skillDir, 'scripts', 'append.js'), '// script\n', 'utf8');
  return srcDir;
}

test('copies each skill folder with its scripts into the target directory', () => {
  const srcDir = makeSkillsSrc();
  const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-dst-')), 'skills');

  const installed = installSkills({ skillsSrcDir: srcDir, targetDir });

  assert.deepEqual(installed.map((s) => s.name), ['weekly-log']);
  assert.ok(fs.existsSync(path.join(targetDir, 'weekly-log', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(targetDir, 'weekly-log', 'scripts', 'append.js')));
});

test('reinstalling replaces the destination and removes stale files', () => {
  const srcDir = makeSkillsSrc();
  const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-dst2-')), 'skills');
  const staleDir = path.join(targetDir, 'weekly-log');
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'obsolete.js'), '// stale\n', 'utf8');

  installSkills({ skillsSrcDir: srcDir, targetDir });

  assert.ok(!fs.existsSync(path.join(staleDir, 'obsolete.js')), 'stale file should be gone');
  assert.ok(fs.existsSync(path.join(staleDir, 'SKILL.md')));
});

function makePluginRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-repo-'));
  fs.mkdirSync(path.join(repoRoot, '.codex-plugin'));
  fs.writeFileSync(
    path.join(repoRoot, '.codex-plugin', 'plugin.json'),
    JSON.stringify({ name: 'weekly-report', version: '1.3.0' }) + '\n',
    'utf8'
  );
  fs.mkdirSync(path.join(repoRoot, 'skills', 'weekly-log'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'skills', 'weekly-log', 'SKILL.md'), '---\n---\n', 'utf8');
  fs.mkdirSync(path.join(repoRoot, '.git'));
  fs.writeFileSync(path.join(repoRoot, '.git', 'HEAD'), 'ref: refs/heads/master\n', 'utf8');
  return repoRoot;
}

test('installPlugin copies the repo (minus .git) into pluginsDir under the manifest name', () => {
  const repoRoot = makePluginRepo();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-plg-'));
  const pluginsDir = path.join(base, 'plugins');
  const marketplacePath = path.join(base, '.agents', 'plugins', 'marketplace.json');

  const result = installPlugin({ repoRoot, pluginsDir, marketplacePath });

  assert.equal(result.name, 'weekly-report');
  const dest = path.join(pluginsDir, 'weekly-report');
  assert.ok(fs.existsSync(path.join(dest, '.codex-plugin', 'plugin.json')));
  assert.ok(fs.existsSync(path.join(dest, 'skills', 'weekly-log', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(dest, '.git')), '.git should not be copied');
});

test('installPlugin seeds a personal marketplace file with the plugin entry', () => {
  const repoRoot = makePluginRepo();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-plg2-'));
  const marketplacePath = path.join(base, '.agents', 'plugins', 'marketplace.json');

  installPlugin({ repoRoot, pluginsDir: path.join(base, 'plugins'), marketplacePath });

  const market = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  assert.equal(market.name, 'personal');
  assert.equal(market.interface.displayName, 'Personal');
  assert.equal(market.plugins.length, 1);
  const entry = market.plugins[0];
  assert.equal(entry.name, 'weekly-report');
  assert.deepEqual(entry.source, { source: 'local', path: './plugins/weekly-report' });
  assert.equal(entry.policy.installation, 'AVAILABLE');
  assert.equal(entry.policy.authentication, 'ON_INSTALL');
  assert.equal(entry.category, 'Productivity');
});

test('installPlugin replaces its own marketplace entry and keeps other entries intact', () => {
  const repoRoot = makePluginRepo();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-plg3-'));
  const marketplacePath = path.join(base, '.agents', 'plugins', 'marketplace.json');
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  fs.writeFileSync(
    marketplacePath,
    JSON.stringify({
      name: 'my-market',
      interface: { displayName: 'Mine' },
      plugins: [
        { name: 'other-plugin', source: { source: 'local', path: './plugins/other-plugin' } },
        { name: 'weekly-report', source: { source: 'local', path: './old/weekly-report' } },
      ],
    }) + '\n',
    'utf8'
  );

  const result = installPlugin({ repoRoot, pluginsDir: path.join(base, 'plugins'), marketplacePath });

  const market = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  assert.equal(market.name, 'my-market');
  assert.equal(market.interface.displayName, 'Mine');
  assert.deepEqual(market.plugins.map((p) => p.name), ['other-plugin', 'weekly-report']);
  assert.equal(market.plugins[1].source.path, './plugins/weekly-report');
  assert.equal(result.marketplaceName, 'my-market');
});

test('ignores entries in the source that are not skill folders', () => {
  const srcDir = makeSkillsSrc();
  fs.writeFileSync(path.join(srcDir, 'README.md'), 'not a skill\n', 'utf8');
  fs.mkdirSync(path.join(srcDir, 'no-skill-md'));
  const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-dst3-')), 'skills');

  const installed = installSkills({ skillsSrcDir: srcDir, targetDir });

  assert.deepEqual(installed.map((s) => s.name), ['weekly-log']);
  assert.ok(!fs.existsSync(path.join(targetDir, 'no-skill-md')));
});
