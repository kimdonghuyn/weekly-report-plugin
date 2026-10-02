'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_SCAN_DEPTH = 3;
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', 'out']);
const INTEGRATION_BRANCHES = ['develop', 'main', 'master'];
const PENDING_LOOKBACK_DAYS = 28;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

// Repos are often grouped by client/team (e.g. <root>/CMS/<repo>), so a scan root
// is walked up to maxDepth levels. We stop descending at the first .git we meet
// (nested repos/submodules belong to their parent) and skip dependency/build dirs.
function findGitRepos(root, { maxDepth = DEFAULT_SCAN_DEPTH } = {}) {
  if (!fs.existsSync(root)) return [];
  if (fs.existsSync(path.join(root, '.git'))) return [root];
  const repos = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (fs.existsSync(path.join(full, '.git'))) {
        repos.push(full);
      } else if (depth < maxDepth) {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 1);
  return repos;
}

function listWorktreePaths(repoPath) {
  try {
    return git(repoPath, ['worktree', 'list', '--porcelain'])
      .split(/\r?\n/)
      .filter((line) => line.startsWith('worktree '))
      .map((line) => path.resolve(line.slice('worktree '.length)));
  } catch (err) {
    return [];
  }
}

// Linked worktrees share one object store, so scanning each as its own repo
// double-counts every commit. Group discovered paths by their common git dir and
// report each group once under the main worktree. The group also carries every
// worktree path (including ones outside scanRoots, e.g. tool-managed worktree
// folders) so session activity recorded there can be attributed to the repo.
function groupWorktrees(repoPaths) {
  const groups = new Map();
  for (const repoPath of repoPaths) {
    let commonDir;
    try {
      commonDir = path.resolve(repoPath, git(repoPath, ['rev-parse', '--git-common-dir']).trim());
    } catch (err) {
      commonDir = path.resolve(repoPath, '.git');
    }
    const key = normalizePath(commonDir);
    if (!groups.has(key)) groups.set(key, []);
    const members = groups.get(key);
    if (!members.some((m) => normalizePath(m) === normalizePath(repoPath))) members.push(repoPath);
  }

  return [...groups.values()].map((members) => {
    const worktreePaths = listWorktreePaths(members[0]);
    const mainPath = worktreePaths[0];
    const repoPath =
      (mainPath && members.find((m) => normalizePath(m) === normalizePath(mainPath))) ||
      (mainPath && fs.existsSync(mainPath) ? mainPath : members[0]);
    const paths = [];
    for (const p of [repoPath, ...members, ...worktreePaths]) {
      if (!paths.some((q) => normalizePath(q) === normalizePath(p))) paths.push(p);
    }
    return { repoPath, repoName: path.basename(repoPath), paths };
  });
}

const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';
const LOG_FORMAT = `--pretty=format:%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`;

function parseLog(output) {
  return output
    .split(RECORD_SEP)
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [hash, date, message] = rec.split(FIELD_SEP);
      return { hash, date, message };
    });
}

// Work that lives on a feature branch not yet merged (or merged locally but not
// pushed) is still this week's work, so read every local and remote branch
// instead of only the checked-out HEAD.
function getCommits(repoPath, { since, until, authorEmail }) {
  let output;
  try {
    output = git(repoPath, [
      'log',
      '--branches',
      '--remotes',
      'HEAD',
      `--since=${since.toISOString()}`,
      `--until=${until.toISOString()}`,
      `--author=${authorEmail}`,
      LOG_FORMAT,
    ]);
  } catch (err) {
    return [];
  }
  // git prints newest first; reverse before the (stable) date sort so commits
  // sharing a timestamp stay oldest first.
  return parseLog(output)
    .reverse()
    .sort((a, b) => a.date.localeCompare(b.date));
}

function refExists(repoPath, ref) {
  try {
    git(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch (err) {
    return false;
  }
}

function pickRef(repoPath, name) {
  if (refExists(repoPath, `refs/heads/${name}`)) return name;
  if (refExists(repoPath, `refs/remotes/origin/${name}`)) return `origin/${name}`;
  return null;
}

// Basis for the "next week" section of the report: branches carrying the user's
// own commits that the integration branch (develop, else main/master) does not
// contain yet, plus how many integration commits are still waiting for release.
function getBranchStatus(repoPath, { authorEmail, until }) {
  const baseName = INTEGRATION_BRANCHES.find((name) => pickRef(repoPath, name));
  if (!baseName) return null;
  const base = pickRef(repoPath, baseName);

  let refs;
  try {
    refs = git(repoPath, [
      'for-each-ref',
      `--no-merged=${base}`,
      `--format=%(refname)${FIELD_SEP}%(committerdate:iso-strict)`,
      'refs/heads',
      'refs/remotes',
    ]);
  } catch (err) {
    return null;
  }

  const cutoff = new Date(until.getTime() - PENDING_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const byName = new Map();
  for (const line of refs.split(/\r?\n/).filter(Boolean)) {
    const [fullRef, date] = line.split(FIELD_SEP);
    const isRemote = fullRef.startsWith('refs/remotes/');
    const ref = fullRef.replace(/^refs\/(heads|remotes)\//, '');
    const name = isRemote ? ref.replace(/^[^/]+\//, '') : ref;
    if (name === 'HEAD' || INTEGRATION_BRANCHES.includes(name)) continue;
    if (new Date(date) < cutoff) continue;

    let own;
    try {
      own = parseLog(git(repoPath, ['log', '--no-merges', `--author=${authorEmail}`, LOG_FORMAT, `${base}..${fullRef}`]));
    } catch (err) {
      continue;
    }
    if (own.length === 0) continue;

    const entry = byName.get(name) || { name, local: false, pushed: false };
    if (isRemote) entry.pushed = true;
    else entry.local = true;
    // Local refs win: they include commits that haven't been pushed yet.
    if (!isRemote || entry.ownCommits === undefined) {
      entry.ownCommits = own.length;
      entry.lastCommitDate = own[0].date;
      entry.lastMessage = own[0].message;
    }
    byName.set(name, entry);
  }

  let unreleasedCount = null;
  const releaseBranch = baseName === 'develop' ? pickRef(repoPath, 'main') || pickRef(repoPath, 'master') : null;
  if (releaseBranch) {
    try {
      unreleasedCount = Number(git(repoPath, ['rev-list', '--count', `${releaseBranch}..${base}`]).trim());
    } catch (err) {
      unreleasedCount = null;
    }
  }

  const pendingBranches = [...byName.values()].sort((a, b) => b.lastCommitDate.localeCompare(a.lastCommitDate));
  return { base, releaseBranch, unreleasedCount, pendingBranches };
}

module.exports = { findGitRepos, groupWorktrees, getCommits, getBranchStatus, normalizePath };
