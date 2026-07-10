'use strict';
const fs = require('fs');
const path = require('path');

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function datesInRange(since, until) {
  const dates = [];
  const cur = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));
  while (cur <= end) {
    dates.push({
      year: String(cur.getUTCFullYear()),
      month: String(cur.getUTCMonth() + 1).padStart(2, '0'),
      day: String(cur.getUTCDate()).padStart(2, '0'),
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function findRolloutFiles(codexSessionsRoot, since, until) {
  const files = [];
  for (const { year, month, day } of datesInRange(since, until)) {
    const dir = path.join(codexSessionsRoot, year, month, day);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.jsonl')) files.push(path.join(dir, name));
    }
  }
  return files;
}

// Sessions that were bulk-imported from another tool (e.g. Claude Code transcripts
// pulled into Codex) show up as real rollout files but don't represent Codex usage
// — counting them would double-count work already captured via the Claude session
// scan. Codex records each import in external_agent_session_imports.json, keyed by
// the resulting session's thread id, so we skip any rollout whose session id is
// listed there.
function loadImportedThreadIds(homeDir) {
  const importsPath = path.join(homeDir, '.codex', 'external_agent_session_imports.json');
  try {
    const data = JSON.parse(fs.readFileSync(importsPath, 'utf8'));
    const records = Array.isArray(data.records) ? data.records : [];
    return new Set(records.map((r) => r.imported_thread_id).filter(Boolean));
  } catch (err) {
    return new Set();
  }
}

// Belt-and-suspenders fallback: imported sessions carry a literal
// "<EXTERNAL SESSION IMPORTED>" agent_message marker even when a session isn't
// (or is no longer) listed in the imports registry.
function hasImportMarker(record) {
  if (record.type !== 'event_msg' || !record.payload) return false;
  return record.payload.type === 'agent_message' && record.payload.message === '<EXTERNAL SESSION IMPORTED>';
}

// Codex rollout files are one-per-session, named rollout-<timestamp>-<uuid>.jsonl,
// grouped under sessions/YYYY/MM/DD/. The first session_meta record carries the
// session's cwd; user turns show up as event_msg records with payload.type
// "user_message". There's no per-project directory like Claude's sanitized
// project folders, so we scan the date-bucketed files and match on cwd instead.
function getCodexUserMessages(projectRoot, { since, until, codexSessionsRoot, homeDir }) {
  if (!fs.existsSync(codexSessionsRoot)) return [];
  const targetPath = normalizePath(projectRoot);
  const importedThreadIds = loadImportedThreadIds(homeDir);
  const results = [];

  for (const file of findRolloutFiles(codexSessionsRoot, since, until)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    let cwdMatches = false;
    let isImported = false;
    const pending = [];

    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch (err) {
        continue;
      }
      if (record.type === 'session_meta') {
        const cwd = record.payload && record.payload.cwd;
        cwdMatches = typeof cwd === 'string' && normalizePath(cwd) === targetPath;
        const sessionId = record.payload && (record.payload.session_id || record.payload.id);
        if (sessionId && importedThreadIds.has(sessionId)) isImported = true;
        continue;
      }
      if (hasImportMarker(record)) {
        isImported = true;
        continue;
      }
      if (!cwdMatches || record.type !== 'event_msg') continue;
      const payload = record.payload;
      if (!payload || payload.type !== 'user_message') continue;
      if (typeof payload.message !== 'string' || !payload.message) continue;
      if (!record.timestamp) continue;
      const ts = new Date(record.timestamp);
      if (ts >= since && ts < until) {
        pending.push({ timestamp: record.timestamp, text: payload.message, source: 'codex' });
      }
    }

    if (!isImported) results.push(...pending);
  }
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

module.exports = { getCodexUserMessages };
