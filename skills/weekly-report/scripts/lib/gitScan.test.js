'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { findGitRepos, groupWorktrees, getCommits, getBranchStatus } = require('./gitScan');

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

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

test('findGitRepos finds only git repos, skipping plain folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-scan-'));
  makeRepo(path.join(root, 'repo-a'));
  fs.mkdirSync(path.join(root, 'not-a-repo'));
  const repos = findGitRepos(root).map((r) => path.basename(r)).sort();
  assert.deepEqual(repos, ['repo-a']);
});

test('findGitRepos walks into grouping folders up to maxDepth', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-scan-nested-'));
  makeRepo(path.join(root, 'CMS', 'cms-be'));
  makeRepo(path.join(root, 'CMS', 'cms-be', 'packages', 'inner')); // inside a repo — not a separate project
  makeRepo(path.join(root, 'a', 'b', 'c', 'too-deep'));
  makeRepo(path.join(root, 'web', 'node_modules', 'dep')); // dependency checkout — skipped
  const repos = findGitRepos(root).map((r) => path.relative(root, r).replace(/\\/g, '/')).sort();
  assert.deepEqual(repos, ['CMS/cms-be']);
  assert.equal(findGitRepos(root, { maxDepth: 4 }).length, 2);
});

test('findGitRepos returns the root itself when it is a repo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-scan-self-'));
  makeRepo(root);
  assert.deepEqual(findGitRepos(root), [root]);
});

test('groupWorktrees reports a repo and its linked worktrees once, under the main worktree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-worktree-'));
  const main = path.join(root, 'app');
  makeRepo(main);
  commit(main, 'init', 'a.txt');
  const linked = path.join(root, 'app-feature');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-worktree-outside-'));
  git(main, ['worktree', 'add', '-q', '-b', 'feature', linked]);
  git(main, ['worktree', 'add', '-q', '-b', 'other', path.join(outside, 'wt')]);

  const groups = groupWorktrees([linked, main]);
  assert.equal(groups.length, 1);
  assert.equal(path.resolve(groups[0].repoPath), path.resolve(main));
  assert.equal(groups[0].repoName, 'app');
  const paths = groups[0].paths.map((p) => fs.realpathSync(p)).sort();
  assert.deepEqual(paths, [main, linked, path.join(outside, 'wt')].map((p) => fs.realpathSync(p)).sort());
});

test('getCommits includes commits on branches other than the checked-out one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-commits-branches-'));
  makeRepo(root);
  commit(root, 'on main', 'a.txt');
  const mainBranch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  git(root, ['switch', '-q', '-c', 'feature/x']);
  commit(root, 'on feature', 'b.txt');
  git(root, ['switch', '-q', mainBranch]);

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const until = new Date(Date.now() + 24 * 3600 * 1000);
  const messages = getCommits(root, { since, until, authorEmail: 'me@example.com' }).map((c) => c.message);
  assert.deepEqual(messages.sort(), ['on feature', 'on main']);
});

test('getBranchStatus lists own unmerged branches and counts commits waiting for release', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-branches-'));
  makeRepo(root);
  commit(root, 'init', 'a.txt');
  git(root, ['branch', '-M', 'main']);
  git(root, ['switch', '-q', '-c', 'develop']);
  commit(root, 'develop only', 'b.txt');
  git(root, ['switch', '-q', '-c', 'feature/merged']);
  commit(root, 'merged work', 'c.txt');
  git(root, ['switch', '-q', 'develop']);
  git(root, ['merge', '-q', '--no-ff', '-m', 'merge', 'feature/merged']);
  git(root, ['switch', '-q', '-c', 'feature/pending']);
  commit(root, 'pending work', 'd.txt');
  git(root, ['switch', '-q', 'develop']);
  git(root, ['switch', '-q', '-c', 'feature/someone-else']);
  fs.writeFileSync(path.join(root, 'e.txt'), 'x');
  git(root, ['add', 'e.txt']);
  git(root, ['-c', 'user.email=other@example.com', 'commit', '-q', '-m', 'not mine']);
  git(root, ['switch', '-q', 'develop']);

  const status = getBranchStatus(root, { authorEmail: 'me@example.com', until: new Date(Date.now() + 3600 * 1000) });
  assert.equal(status.base, 'develop');
  assert.equal(status.releaseBranch, 'main');
  assert.equal(status.unreleasedCount, 3);
  assert.deepEqual(status.pendingBranches.map((b) => b.name), ['feature/pending']);
  assert.equal(status.pendingBranches[0].ownCommits, 1);
  assert.equal(status.pendingBranches[0].lastMessage, 'pending work');
  assert.equal(status.pendingBranches[0].local, true);
  assert.equal(status.pendingBranches[0].pushed, false);
});

test('getBranchStatus returns null when there is no integration branch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-branches-none-'));
  makeRepo(root);
  commit(root, 'init', 'a.txt');
  git(root, ['branch', '-M', 'trunk']);
  assert.equal(getBranchStatus(root, { authorEmail: 'me@example.com', until: new Date() }), null);
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
