'use strict';
const fs = require('fs');
const path = require('path');

function defaultConfig() {
  return {
    scanRoots: ['C:/project'],
    authorEmail: 'kdh898312@gmail.com',
    weekStartsOn: 'monday',
    archivePath: 'C:/Users/philip/Documents/WeeklyReports',
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
