'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { attributeSessions } = require('./sessionMatch');

const repos = [
  { repoPath: 'C:\\project\\CMS\\cms-be', repoName: 'cms-be', paths: ['C:\\project\\CMS\\cms-be', 'C:\\wt\\cms-be-feature'] },
  { repoPath: 'C:\\project\\CMS\\cms-fe', repoName: 'cms-fe', paths: ['C:\\project\\CMS\\cms-fe'] },
  { repoPath: 'C:\\project\\PM\\pm-bot', repoName: 'pm-bot', paths: ['C:\\project\\PM\\pm-bot'] },
];

function session(source, sessionId, cwd, texts, extra = {}) {
  return {
    source,
    sessionId,
    cwd,
    messages: texts.map((text, i) => ({ timestamp: `2026-06-30T0${i}:00:00.000Z`, text, source })),
    ...extra,
  };
}

test('attributes a session to the repo containing its cwd, including subfolders and worktrees', () => {
  const { byRepo, unscopedSessions } = attributeSessions(
    [
      session('claude', 's1', 'C:\\project\\CMS\\cms-be', ['저장소 루트']),
      session('claude', 's2', 'C:\\project\\CMS\\cms-be\\docs', ['하위 폴더']),
      session('codex', 's3', 'C:\\wt\\cms-be-feature', ['worktree']),
    ],
    repos
  );
  assert.deepEqual(byRepo[0].map((m) => m.text).sort(), ['worktree', '저장소 루트', '하위 폴더']);
  assert.equal(byRepo[0].find((m) => m.text === 'worktree').source, 'codex');
  assert.deepEqual(unscopedSessions, []);
});

test('returns sessions opened in a folder above several repos as unscoped, with the repos under it', () => {
  const { byRepo, unscopedSessions } = attributeSessions(
    [session('codex', 's1', 'C:\\project', ['admin-fe 학교 검색 404 원인 찾아', '수정해']), session('claude', 's2', 'C:\\project\\PM', ['일정 정리'])],
    repos
  );
  assert.ok(byRepo.every((list) => list.length === 0));
  assert.equal(unscopedSessions.length, 2);
  const top = unscopedSessions.find((s) => s.sessionId === 's1');
  assert.deepEqual(top.candidateRepos, ['cms-be', 'cms-fe', 'pm-bot']);
  assert.deepEqual(top.messages.map((m) => m.text), ['admin-fe 학교 검색 404 원인 찾아', '수정해']);
  assert.deepEqual(unscopedSessions.find((s) => s.sessionId === 's2').candidateRepos, ['pm-bot']);
});

test('splits one session by the cwd of each message', () => {
  const s = session('codex', 's1', 'C:\\project', ['위에서', '저장소에서']);
  s.messages[1].cwd = 'C:\\project\\CMS\\cms-fe';
  const { byRepo, unscopedSessions } = attributeSessions([s], repos);
  assert.deepEqual(byRepo[1].map((m) => m.text), ['저장소에서']);
  assert.deepEqual(unscopedSessions[0].messages.map((m) => m.text), ['위에서']);
});

test('ignores sessions in folders unrelated to any scanned repo', () => {
  const { byRepo, unscopedSessions } = attributeSessions([session('claude', 's1', 'C:\\Users\\me\\Downloads', ['기타'])], repos);
  assert.ok(byRepo.every((list) => list.length === 0));
  assert.deepEqual(unscopedSessions, []);
});

test('falls back to the sanitized project dir name when a transcript has no cwd', () => {
  const { byRepo } = attributeSessions([session('claude', 's1', null, ['cwd 없음'], { dirName: 'C--project-CMS-cms-fe' })], repos);
  assert.deepEqual(byRepo[1].map((m) => m.text), ['cwd 없음']);
});
