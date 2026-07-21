'use strict';
const fs = require('fs');

const DATE_HEADING_RE = /^##\s+(\d{4}-\d{2}-\d{2})/;
const ENTRY_RE = /^-\s*\[([^\]]+)\]\s*(.+)$/;

function parseWeeklyLog(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const entries = [];
  let currentDate = null;
  for (const line of lines) {
    const dateMatch = line.match(DATE_HEADING_RE);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }
    const entryMatch = line.match(ENTRY_RE);
    if (entryMatch && currentDate) {
      entries.push({ date: currentDate, project: entryMatch[1].trim(), content: entryMatch[2].trim() });
    }
  }
  return entries;
}

module.exports = { parseWeeklyLog };
