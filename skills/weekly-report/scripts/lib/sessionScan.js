'use strict';
const fs = require('fs');
const path = require('path');
const { sanitizeProjectPath } = require('./pathSanitize');

// A typed prompt is a plain string, or text parts mixed with pasted images.
// Arrays that carry tool_result parts are tool round-trips, not the user's words.
function extractPrompt(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || content.length === 0) return '';
  if (!content.every((part) => part && (part.type === 'text' || part.type === 'image'))) return '';
  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

// Text Claude Code writes into the user role on its own: interrupt markers,
// slash-command echoes and their output, background task notifications.
const INJECTED_PREFIXES = [
  '[Request interrupted',
  '<command-name>',
  '<command-message>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<local-command-caveat>',
  '<task-notification>',
];

function isTypedByUser(record, text) {
  if (record.isSidechain || record.isMeta || record.isCompactSummary || record.isVisibleInTranscriptOnly) return false;
  // Newer transcripts tag who produced the turn; only "human" is the user typing.
  if (record.origin && record.origin.kind && record.origin.kind !== 'human') return false;
  const head = text.trimStart();
  return !INJECTED_PREFIXES.some((prefix) => head.startsWith(prefix));
}

function readSessionFile(file, since, until) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  let cwd = null;
  const messages = [];
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (err) {
      continue;
    }
    if (!cwd && typeof record.cwd === 'string') cwd = record.cwd;
    if (record.type !== 'user' || !record.message || !record.timestamp) continue;
    const text = extractPrompt(record.message.content);
    if (!text || !isTypedByUser(record, text)) continue;
    const ts = new Date(record.timestamp);
    if (ts >= since && ts < until) {
      messages.push({ timestamp: record.timestamp, text, source: 'claude' });
    }
  }
  return { cwd, messages };
}

function listJsonl(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
      .map((e) => path.join(dir, e.name));
  } catch (err) {
    return [];
  }
}

function getSessionUserMessages(projectRoot, { since, until, claudeProjectsRoot }) {
  const sessionDir = path.join(claudeProjectsRoot, sanitizeProjectPath(projectRoot));
  const results = [];
  for (const file of listJsonl(sessionDir)) {
    results.push(...readSessionFile(file, since, until).messages);
  }
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// Every Claude Code session of the week, whatever folder it was started in, so
// the caller can attribute sessions opened in a parent folder (e.g. the folder
// holding several repos) or in a worktree outside scanRoots. Project dir names
// are a lossy sanitization of the cwd, so the real cwd comes from the records;
// dirName is kept as a fallback for transcripts that don't carry one.
function listClaudeSessions({ since, until, claudeProjectsRoot }) {
  let dirs;
  try {
    dirs = fs.readdirSync(claudeProjectsRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch (err) {
    return [];
  }
  const sessions = [];
  for (const dir of dirs) {
    for (const file of listJsonl(path.join(claudeProjectsRoot, dir.name))) {
      // A transcript untouched since the week started can't hold this week's prompts.
      if (fs.statSync(file).mtime < since) continue;
      const { cwd, messages } = readSessionFile(file, since, until);
      if (messages.length === 0) continue;
      sessions.push({
        source: 'claude',
        sessionId: path.basename(file, '.jsonl'),
        dirName: dir.name,
        cwd,
        messages,
      });
    }
  }
  return sessions;
}

module.exports = { getSessionUserMessages, listClaudeSessions };
