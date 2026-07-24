'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Gemini CLI has no per-message source/import concept, but a session file's
// content parts are a PartListUnion: either a plain string or an array of Part
// objects. Only text parts carry the user's words; concatenate those and ignore
// functionCall / inlineData / etc.
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

// projects.json maps normalized-absolute-path -> identifier (slug). We invert it
// so a tmp subdir name can be resolved back to its project cwd, covering both the
// slug scheme and the legacy sha256-hash scheme (by hashing each registered path).
function loadProjectsRegistry(homeDir) {
  const idToPath = new Map();
  try {
    const raw = fs.readFileSync(path.join(homeDir, '.gemini', 'projects.json'), 'utf8');
    const data = JSON.parse(raw);
    const projects = data && data.projects && typeof data.projects === 'object' ? data.projects : {};
    for (const [projPath, id] of Object.entries(projects)) {
      if (typeof id === 'string') idToPath.set(id, projPath);
      idToPath.set(sha256(projPath), projPath);
    }
  } catch (err) {
    // no registry / unreadable — fall back to per-dir markers
  }
  return idToPath;
}

function listChatFiles(chatsDir) {
  try {
    return fs
      .readdirSync(chatsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && (e.name.endsWith('.jsonl') || e.name.endsWith('.json')))
      .map((e) => path.join(chatsDir, e.name));
  } catch (err) {
    return [];
  }
}

// A chat file is either JSONL (first line = metadata, rest = message/control
// records) or a legacy monolithic JSON object with a `history` array. Return
// { meta, records } for both shapes.
function readChatFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    try {
      const obj = JSON.parse(text);
      const records = Array.isArray(obj.history) ? obj.history : [];
      return { meta: obj, records };
    } catch (err) {
      return { meta: {}, records: [] };
    }
  }
  const parsed = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch (err) {
      // skip malformed line
    }
  }
  return { meta: parsed[0] || {}, records: parsed.slice(1) };
}

// Resolve a tmp subdir to its project cwd, trying the most reliable markers first:
// the .project_root file, then a session file's `directories`, then the registry.
function resolveDirCwd(projectDir, id, chatFiles, idToPath) {
  try {
    const marker = fs.readFileSync(path.join(projectDir, '.project_root'), 'utf8').trim();
    if (marker) return marker;
  } catch (err) {
    // no marker
  }
  for (const file of chatFiles) {
    const { meta } = readChatFile(file);
    if (meta && Array.isArray(meta.directories) && meta.directories.length > 0) {
      return meta.directories[0];
    }
  }
  return idToPath.get(id) || null;
}

function collectFromChats(chatFiles, since, until) {
  const results = [];
  for (const file of chatFiles) {
    const { meta, records } = readChatFile(file);
    if (meta && meta.kind === 'subagent') continue;
    for (const record of records) {
      if (!record || record.type !== 'user') continue;
      if (!record.timestamp) continue;
      const text = extractText(record.content);
      if (!text) continue;
      const ts = new Date(record.timestamp);
      if (ts >= since && ts < until) {
        results.push({ timestamp: record.timestamp, text, source: 'gemini' });
      }
    }
  }
  return results;
}

function collectFromLogs(projectDir, since, until) {
  const results = [];
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(path.join(projectDir, 'logs.json'), 'utf8'));
  } catch (err) {
    return results;
  }
  if (!Array.isArray(entries)) return results;
  for (const entry of entries) {
    if (!entry || entry.type !== 'user') continue;
    if (typeof entry.message !== 'string' || !entry.message) continue;
    if (!entry.timestamp) continue;
    const ts = new Date(entry.timestamp);
    if (ts >= since && ts < until) {
      results.push({ timestamp: entry.timestamp, text: entry.message, source: 'gemini' });
    }
  }
  return results;
}

// Gemini CLI stores per-project data under ~/.gemini/tmp/<id>/, where <id> is
// either a sha256 of the project path (legacy) or a ProjectRegistry slug. We
// enumerate those dirs, resolve each to its cwd, and — for the dir matching the
// target project — pull the user's typed prompts. chats/ is the rich continuous
// log; logs.json is a simpler prompt-only fallback for installs without chats/.
function getGeminiUserMessages(projectRoot, { since, until, geminiTmpRoot, homeDir }) {
  if (!fs.existsSync(geminiTmpRoot)) return [];
  const targetPath = normalizePath(projectRoot);
  const idToPath = loadProjectsRegistry(homeDir);
  const results = [];

  for (const entry of fs.readdirSync(geminiTmpRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const projectDir = path.join(geminiTmpRoot, id);
    const chatFiles = listChatFiles(path.join(projectDir, 'chats'));

    const cwd = resolveDirCwd(projectDir, id, chatFiles, idToPath);
    if (!cwd || normalizePath(cwd) !== targetPath) continue;

    // Prefer chats/ (richer, reliable timestamps); fall back to logs.json only
    // when there are no chat files, so the same prompt isn't counted twice.
    const fromChats = collectFromChats(chatFiles, since, until);
    if (chatFiles.length > 0) {
      results.push(...fromChats);
    } else {
      results.push(...collectFromLogs(projectDir, since, until));
    }
  }

  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

module.exports = { getGeminiUserMessages };
