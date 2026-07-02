'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { findGitRepos, getCommits } = require('./gitScan');

function makeRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'me@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Me'], { cwd: dir });
}

function commit(dir, message, fileName) {
  fs.writeFileSync(path.join(dir, fileName), 'x');
  execFileSync('git', ['add', fileName], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir });
}

test('findGitRepos finds only git repos one level deep', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-scan-'));
  makeRepo(path.join(root, 'repo-a'));
  fs.mkdirSync(path.join(root, 'not-a-repo'));
  const repos = findGitRepos(root).map((r) => path.basename(r)).sort();
  assert.deepEqual(repos, ['repo-a']);
});

test('findGitRepos returns [] for a missing root', () => {
  assert.deepEqual(findGitRepos('C:/definitely/not/here'), []);
});

test('getCommits filters by author email and date range, oldest first', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-commits-'));
  makeRepo(root);
  commit(root, 'first commit', 'a.txt');
  commit(root, 'second commit', 'b.txt');
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const until = new Date(Date.now() + 24 * 3600 * 1000);
  const commits = getCommits(root, { since, until, authorEmail: 'me@example.com' });
  assert.equal(commits.length, 2);
  assert.equal(commits[0].message, 'first commit');
  assert.equal(commits[1].message, 'second commit');
});

test('getCommits excludes commits from a different author', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-commits2-'));
  makeRepo(root);
  commit(root, 'only commit', 'a.txt');
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const until = new Date(Date.now() + 24 * 3600 * 1000);
  const commits = getCommits(root, { since, until, authorEmail: 'someone-else@example.com' });
  assert.equal(commits.length, 0);
});
