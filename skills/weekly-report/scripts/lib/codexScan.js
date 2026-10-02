'use strict';
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 3600 * 1000;

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function readDirNames(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    return [];
  }
}

// Rollouts live under sessions/YYYY/MM/DD/ named after the day the session
// started, but a long-running session keeps appending to that file on later
// days. Take a file when its day folder falls inside the week, or when it was
// written to after the week began.
function findRolloutFiles(codexSessionsRoot, since, until) {
  const files = [];
  for (const year of readDirNames(codexSessionsRoot)) {
    for (const month of readDirNames(path.join(codexSessionsRoot, year))) {
      for (const day of readDirNames(path.join(codexSessionsRoot, year, month))) {
        const dir = path.join(codexSessionsRoot, year, month, day);
        const dayStart = Date.UTC(Number(year), Number(month) - 1, Number(day));
        const dayInRange = dayStart + DAY_MS > since.getTime() - DAY_MS && dayStart < until.getTime();
        let names;
        try {
          names = fs.readdirSync(dir);
        } catch (err) {
          continue;
        }
        for (const name of names) {
          if (!name.endsWith('.jsonl')) continue;
          const file = path.join(dir, name);
          if (dayInRange || fs.statSync(file).mtime >= since) files.push(file);
        }
      }
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
function loadImportedThreadIds(codexHome) {
  const importsPath = path.join(codexHome, 'external_agent_session_imports.json');
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

function userMessageItemText(item) {
  if (!item || item.type !== 'UserMessage' || !Array.isArray(item.content)) return '';
  return item.content
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

// Parse one rollout. The cwd starts from session_meta and follows turn_context
// records, since the working folder can change mid-session. Older Codex builds
// log typed prompts as event_msg "user_message"; newer ones log them as
// item_completed events whose item is a "UserMessage". When a file has the
// legacy records we use only those, so a prompt is never counted twice.
function scanRolloutFile(file, { since, until, importedThreadIds }) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let cwd = null;
  let sessionId = null;
  let isImported = false;
  const legacy = [];
  const items = [];

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (err) {
      continue;
    }
    const payload = record.payload;
    if (record.type === 'session_meta' && payload) {
      if (typeof payload.cwd === 'string') cwd = payload.cwd;
      sessionId = payload.session_id || payload.id || sessionId;
      if (sessionId && importedThreadIds.has(sessionId)) isImported = true;
      continue;
    }
    if (record.type === 'turn_context' && payload && typeof payload.cwd === 'string') {
      cwd = payload.cwd;
      continue;
    }
    if (hasImportMarker(record)) {
      isImported = true;
      continue;
    }
    if (record.type !== 'event_msg' || !payload || !record.timestamp) continue;
    if (payload.type === 'user_message' && typeof payload.message === 'string' && payload.message) {
      legacy.push({ timestamp: record.timestamp, text: payload.message, cwd });
    } else if (payload.type === 'item_completed') {
      const text = userMessageItemText(payload.item);
      if (text) items.push({ timestamp: record.timestamp, text, cwd });
    }
  }

  const messages = (legacy.length > 0 ? legacy : items)
    .filter((m) => {
      const ts = new Date(m.timestamp);
      return ts >= since && ts < until;
    })
    .map((m) => ({ timestamp: m.timestamp, text: m.text, source: 'codex', cwd: m.cwd }));
  return { sessionId, isImported, messages };
}

function getCodexUserMessages(projectRoot, { since, until, codexSessionsRoot, homeDir }) {
  if (!fs.existsSync(codexSessionsRoot)) return [];
  const targetPath = normalizePath(projectRoot);
  const importedThreadIds = loadImportedThreadIds(path.join(homeDir, '.codex'));
  const results = [];
  for (const file of findRolloutFiles(codexSessionsRoot, since, until)) {
    const { isImported, messages } = scanRolloutFile(file, { since, until, importedThreadIds });
    if (isImported) continue;
    for (const m of messages) {
      if (m.cwd && normalizePath(m.cwd) === targetPath) {
        results.push({ timestamp: m.timestamp, text: m.text, source: 'codex' });
      }
    }
  }
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function orcaDataDirs({ homeDir, env, platform }) {
  let bases;
  if (platform === 'win32') bases = [env.APPDATA || path.join(homeDir, 'AppData', 'Roaming')];
  else if (platform === 'darwin') bases = [path.join(homeDir, 'Library', 'Application Support')];
  else bases = [env.XDG_CONFIG_HOME || path.join(homeDir, '.config')];
  return bases.flatMap((base) => [path.join(base, 'orca'), path.join(base, 'Orca')]);
}

// Codex keeps its data in CODEX_HOME (default ~/.codex), and launchers can
// point it elsewhere — Orca, for one, runs Codex with a per-account home under
// its own app-data folder, so ~/.codex alone silently misses that work. Collect
// every home we know of, plus any listed in config.codexHomes.
function resolveCodexHomes({ homeDir, env = process.env, platform = process.platform, extraHomes = [] }) {
  const candidates = [];
  if (env.CODEX_HOME) candidates.push(env.CODEX_HOME);
  candidates.push(path.join(homeDir, '.codex'), ...extraHomes);
  for (const orcaDir of orcaDataDirs({ homeDir, env, platform })) {
    candidates.push(path.join(orcaDir, 'codex-runtime-home', 'home'));
    const accountsDir = path.join(orcaDir, 'codex-accounts');
    for (const account of readDirNames(accountsDir)) {
      candidates.push(path.join(accountsDir, account, 'home'));
    }
  }

  const seen = new Set();
  const homes = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, 'sessions'))) continue;
    let key;
    try {
      key = normalizePath(fs.realpathSync(candidate));
    } catch (err) {
      key = normalizePath(candidate);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    homes.push(candidate);
  }
  return homes;
}

// Every Codex session of the week across all homes. The same rollout can be
// mirrored into more than one home, so sessions are de-duplicated by id.
function listCodexSessions({ since, until, codexHomes }) {
  const seenIds = new Set();
  const sessions = [];
  for (const home of codexHomes) {
    const importedThreadIds = loadImportedThreadIds(home);
    for (const file of findRolloutFiles(path.join(home, 'sessions'), since, until)) {
      const { sessionId, isImported, messages } = scanRolloutFile(file, { since, until, importedThreadIds });
      if (isImported || messages.length === 0) continue;
      const id = sessionId || path.basename(file, '.jsonl');
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      sessions.push({ source: 'codex', sessionId: id, cwd: messages[0].cwd, messages });
    }
  }
  return sessions;
}

module.exports = { getCodexUserMessages, listCodexSessions, resolveCodexHomes };
