'use strict';
const fs = require('fs');
const path = require('path');
const { sanitizeProjectPath } = require('./pathSanitize');

function getSessionUserMessages(projectRoot, { since, until, claudeProjectsRoot }) {
  const sessionDir = path.join(claudeProjectsRoot, sanitizeProjectPath(projectRoot));
  if (!fs.existsSync(sessionDir)) return [];

  const files = fs
    .readdirSync(sessionDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(sessionDir, e.name));

  const results = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch (err) {
        continue;
      }
      if (record.type !== 'user') continue;
      if (record.isSidechain) continue;
      if (!record.message || typeof record.message.content !== 'string') continue;
      if (!record.timestamp) continue;
      const ts = new Date(record.timestamp);
      if (ts >= since && ts < until) {
        results.push({ timestamp: record.timestamp, text: record.message.content, source: 'claude' });
      }
    }
  }
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

module.exports = { getSessionUserMessages };
