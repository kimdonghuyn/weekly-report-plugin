'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function detectAuthorEmail() {
  try {
    return execSync('git config --global user.email', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function defaultConfig() {
  return {
    scanRoots: [],
    authorEmail: detectAuthorEmail(),
    weekStartsOn: 'monday',
    archivePath: path.join(os.homedir(), 'Documents', 'WeeklyReports'),
    figma: { token: '', teamIds: [], userHandles: [] },
  };
}

function loadOrCreateConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const cfg = defaultConfig();
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    return cfg;
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

module.exports = { loadOrCreateConfig, defaultConfig };
