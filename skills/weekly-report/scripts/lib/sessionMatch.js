'use strict';
const path = require('path');
const { sanitizeProjectPath } = require('./pathSanitize');

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function isWithin(child, parent) {
  return child === parent || child.startsWith(parent + '/');
}

// Attribute each session message to a repo by the folder it was typed in:
// the repo (or one of its worktrees) that contains that folder wins, deepest
// match first. A message typed in a folder that merely contains repos — say
// the directory holding every project — can't be pinned to one repo
// mechanically, so it's returned as an unscoped session together with the
// repos under that folder, for the report writer to sort out from context.
function attributeSessions(sessions, repos) {
  const repoPaths = repos.map((repo) => repo.paths.map(normalizePath));
  const repoDirNames = repos.map((repo) => new Set(repo.paths.map(sanitizeProjectPath)));
  const byRepo = repos.map(() => []);
  const unscoped = new Map();

  const matchRepo = (cwd) => {
    let best = -1;
    let bestLen = -1;
    repoPaths.forEach((paths, i) => {
      for (const p of paths) {
        if (isWithin(cwd, p) && p.length > bestLen) {
          best = i;
          bestLen = p.length;
        }
      }
    });
    return best;
  };

  for (const session of sessions) {
    for (const message of session.messages) {
      const rawCwd = message.cwd || session.cwd;
      const entry = { timestamp: message.timestamp, text: message.text, source: message.source || session.source };
      if (!rawCwd) {
        const i = session.dirName ? repoDirNames.findIndex((names) => names.has(session.dirName)) : -1;
        if (i >= 0) byRepo[i].push(entry);
        continue;
      }
      const cwd = normalizePath(rawCwd);
      const i = matchRepo(cwd);
      if (i >= 0) {
        byRepo[i].push(entry);
        continue;
      }
      const candidates = repos.filter((repo, j) => repoPaths[j].some((p) => isWithin(p, cwd)));
      if (candidates.length === 0) continue;
      const key = `${session.source}:${session.sessionId}:${cwd}`;
      if (!unscoped.has(key)) {
        unscoped.set(key, {
          source: session.source,
          sessionId: session.sessionId,
          cwd: rawCwd,
          candidateRepos: candidates.map((repo) => repo.repoName),
          messages: [],
        });
      }
      unscoped.get(key).messages.push({ timestamp: entry.timestamp, text: entry.text });
    }
  }

  for (const list of byRepo) list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const unscopedSessions = [...unscoped.values()]
    .map((s) => ({ ...s, messages: s.messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }))
    .sort((a, b) => a.messages[0].timestamp.localeCompare(b.messages[0].timestamp));
  return { byRepo, unscopedSessions };
}

module.exports = { attributeSessions };
