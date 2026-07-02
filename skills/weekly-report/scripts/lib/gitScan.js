'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findGitRepos(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const repos = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (fs.existsSync(path.join(full, '.git'))) repos.push(full);
  }
  return repos;
}

const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';

function getCommits(repoPath, { since, until, authorEmail }) {
  let output;
  try {
    output = execFileSync(
      'git',
      [
        'log',
        `--since=${since.toISOString()}`,
        `--until=${until.toISOString()}`,
        `--author=${authorEmail}`,
        `--pretty=format:%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`,
      ],
      { cwd: repoPath, encoding: 'utf8' }
    );
  } catch (err) {
    return [];
  }
  return output
    .split(RECORD_SEP)
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [hash, date, message] = rec.split(FIELD_SEP);
      return { hash, date, message };
    })
    .reverse();
}

module.exports = { findGitRepos, getCommits };
