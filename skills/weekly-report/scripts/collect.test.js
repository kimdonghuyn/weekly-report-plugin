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

test('run() merges git commits and manual log entries for the target week', async () => {
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

  const result = await run({ argv: [], homeDir });

  assert.equal(result.weekLabel, week.isoLabel);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].repoName, 'demo-repo');
  assert.equal(result.projects[0].commits.length, 1);
  assert.equal(result.projects[0].commits[0].message, 'do the thing');
  assert.equal(result.projects[0].manualEntries.length, 1);
  assert.equal(result.unmatched.length, 0);
});

test('run() omits repos with zero activity and buckets unmatched manual entries', async () => {
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

  const result = await run({ argv: [], homeDir });

  assert.equal(result.projects.length, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].project, '어떤 프로젝트도 아님');
});

test('run() flags needsSetup when scanRoots is empty, even if manual entries exist', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home3-'));
  const configDir = path.join(homeDir, '.claude', 'weekly-report');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      scanRoots: [],
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
    `## ${today} (테스트)\n- [my-cool-app] 로그인 페이지 리팩터링\n`
  );

  const result = await run({ argv: [], homeDir });

  assert.equal(result.needsSetup, true);
  assert.equal(result.projects.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('run() includes figma activity when the config has a token and team ids', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home5-'));
  const scanRoot = path.join(homeDir, 'project');
  fs.mkdirSync(scanRoot, { recursive: true });

  const configDir = path.join(homeDir, '.claude', 'weekly-report');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      scanRoots: [scanRoot],
      authorEmail: 'me@example.com',
      weekStartsOn: 'monday',
      archivePath: path.join(homeDir, 'archive'),
      figma: { token: 'tok', teamIds: ['T1'], userHandles: [] },
    })
  );

  const week = getWeekRange(new Date());
  const inWeek = new Date(week.start.getTime() + 60_000).toISOString();
  const figmaFetchJson = async (url) => {
    if (url.endsWith('/v1/teams/T1/projects')) {
      return { name: 'Design Team', projects: [{ id: 'P1', name: 'App Design' }] };
    }
    if (url.endsWith('/v1/projects/P1/files')) {
      return { name: 'App Design', files: [{ key: 'F1', name: 'Login Flow', last_modified: inWeek }] };
    }
    if (url.includes('/v1/files/F1/versions')) {
      return {
        versions: [
          { id: 'v1', created_at: inWeek, label: '로그인 개편', description: '', user: { id: 'u1', handle: 'designer-kim' } },
        ],
        pagination: {},
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const result = await run({ argv: [], homeDir, figmaFetchJson });

  assert.equal(result.figmaConfigured, true);
  assert.equal(result.figma.length, 1);
  assert.equal(result.figma[0].fileName, 'Login Flow');
  assert.equal(result.figma[0].versions[0].user.handle, 'designer-kim');
});

test('run() reports figmaConfigured false and calls no fetcher when figma is not set up', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home6-'));
  const scanRoot = path.join(homeDir, 'project');
  fs.mkdirSync(scanRoot, { recursive: true });

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

  let called = false;
  const figmaFetchJson = async () => {
    called = true;
    return {};
  };

  const result = await run({ argv: [], homeDir, figmaFetchJson });

  assert.equal(result.figmaConfigured, false);
  assert.deepEqual(result.figma, []);
  assert.equal(called, false);
});

test('run() does not flag needsSetup when scanRoots is empty but figma is configured', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home7-'));
  const configDir = path.join(homeDir, '.claude', 'weekly-report');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      scanRoots: [],
      authorEmail: '',
      weekStartsOn: 'monday',
      archivePath: path.join(homeDir, 'archive'),
      figma: { token: 'tok', teamIds: ['T1'], userHandles: [] },
    })
  );

  const figmaFetchJson = async () => ({ name: 'Team', projects: [] });
  const result = await run({ argv: [], homeDir, figmaFetchJson });

  assert.equal(result.needsSetup, false);
  assert.equal(result.figmaConfigured, true);
});

test('run() reports needsSetup as false once scanRoots has at least one entry', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home4-'));
  const scanRoot = path.join(homeDir, 'project');
  fs.mkdirSync(scanRoot, { recursive: true });

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

  const result = await run({ argv: [], homeDir });

  assert.equal(result.needsSetup, false);
});

test('run() finds grouped repos once, attributes worktree sessions, and surfaces parent-folder sessions', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-home5-'));
  const scanRoot = path.join(homeDir, 'project');
  const repo = path.join(scanRoot, 'CMS', 'cms-be');
  makeRepoWithCommit(repo);
  const worktree = path.join(homeDir, 'worktrees', 'cms-be-feature');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature/x', worktree], { cwd: repo });
  fs.writeFileSync(path.join(worktree, 'b.txt'), 'x');
  execFileSync('git', ['add', 'b.txt'], { cwd: worktree });
  execFileSync('git', ['commit', '-q', '-m', 'feature work'], { cwd: worktree });

  const configDir = path.join(homeDir, '.claude', 'weekly-report');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      scanRoots: [scanRoot, path.join(scanRoot, 'CMS')], // overlapping roots must not duplicate the repo
      authorEmail: 'me@example.com',
      weekStartsOn: 'monday',
      archivePath: path.join(homeDir, 'archive'),
    })
  );

  const now = new Date().toISOString();
  const claudeDir = path.join(homeDir, '.claude', 'projects', 'worktree-session');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, 'c1.jsonl'),
    JSON.stringify({ type: 'user', cwd: worktree, timestamp: now, message: { role: 'user', content: 'worktree 에서 한 요청' } }) + '\n'
  );

  const codexHome = path.join(homeDir, 'AppData', 'Roaming', 'orca', 'codex-accounts', 'acc', 'home');
  const [y, m, d] = now.slice(0, 10).split('-');
  const rolloutDir = path.join(codexHome, 'sessions', y, m, d);
  fs.mkdirSync(rolloutDir, { recursive: true });
  const rollout = [
    { timestamp: now, type: 'session_meta', payload: { id: 'x1', cwd: scanRoot } },
    { timestamp: now, type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: '상위 폴더에서 한 요청' }] } } },
  ];
  fs.writeFileSync(path.join(rolloutDir, 'rollout-x1.jsonl'), rollout.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const result = await run({ argv: [], homeDir, env: { APPDATA: path.join(homeDir, 'AppData', 'Roaming') }, platform: 'win32' });

  assert.equal(result.projects.length, 1);
  const project = result.projects[0];
  assert.equal(project.repoName, 'cms-be');
  assert.deepEqual(project.commits.map((c) => c.message), ['do the thing', 'feature work']);
  assert.deepEqual(project.worktrees.map((p) => fs.realpathSync(p)), [fs.realpathSync(worktree)]);
  assert.deepEqual(project.sessionMessages.map((m) => m.text), ['worktree 에서 한 요청']);
  assert.deepEqual(project.branches.pendingBranches.map((b) => b.name), ['feature/x']);

  assert.equal(result.unscopedSessions.length, 1);
  assert.equal(result.unscopedSessions[0].source, 'codex');
  assert.deepEqual(result.unscopedSessions[0].candidateRepos, ['cms-be']);
  assert.deepEqual(result.unscopedSessions[0].messages.map((m) => m.text), ['상위 폴더에서 한 요청']);
});
