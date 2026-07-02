'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { run } = require('./collect');
const { getWeekRange } = require('./lib/week');

function makeRepoWithCommit(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'me@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Me'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  execFileSync('git', ['add', 'a.txt'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'do the thing'], { cwd: dir });
}

test('run() merges git commits and manual log entries for the target week', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home-'));
  const scanRoot = path.join(homeDir, 'project');
  makeRepoWithCommit(path.join(scanRoot, 'demo-repo'));

  const configDir = path.join(homeDir, '.claude', 'weekly-report');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      scanRoots: [scanRoot],
      authorEmail: 'me@example.com',
      weekStartsOn: 'monday',
      archivePath: path.join(homeDir, 'archive'),
    })
  );

  const week = getWeekRange(new Date());
  const logsDir = path.join(configDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(logsDir, `${week.isoLabel}.md`),
    `## ${today} (테스트)\n- [demo-repo] 수동으로 기록한 작업\n`
  );

  const result = run({ argv: [], homeDir });

  assert.equal(result.weekLabel, week.isoLabel);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].repoName, 'demo-repo');
  assert.equal(result.projects[0].commits.length, 1);
  assert.equal(result.projects[0].commits[0].message, 'do the thing');
  assert.equal(result.projects[0].manualEntries.length, 1);
  assert.equal(result.unmatched.length, 0);
});

test('run() omits repos with zero activity and buckets unmatched manual entries', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home2-'));
  const scanRoot = path.join(homeDir, 'project');
  fs.mkdirSync(scanRoot, { recursive: true });
  makeRepoWithCommit(path.join(scanRoot, 'quiet-repo')); // commit exists, but by another author below

  const configDir = path.join(homeDir, '.claude', 'weekly-report');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      scanRoots: [scanRoot],
      authorEmail: 'someone-else@example.com', // doesn't match quiet-repo's commit author
      weekStartsOn: 'monday',
      archivePath: path.join(homeDir, 'archive'),
    })
  );

  const week = getWeekRange(new Date());
  const logsDir = path.join(configDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(logsDir, `${week.isoLabel}.md`),
    `## ${today} (테스트)\n- [어떤 프로젝트도 아님] 잡다한 메모\n`
  );

  const result = run({ argv: [], homeDir });

  assert.equal(result.projects.length, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].project, '어떤 프로젝트도 아님');
});
