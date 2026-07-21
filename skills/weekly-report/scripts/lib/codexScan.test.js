'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexUserMessages } = require('./codexScan');

function writeRollout(codexSessionsRoot, { year, month, day, fileName, sessionId, cwd, lines }) {
  const dir = path.join(codexSessionsRoot, year, month, day);
  fs.mkdirSync(dir, { recursive: true });
  const sessionMeta = {
    timestamp: `${year}-${month}-${day}T00:00:00.000Z`,
    type: 'session_meta',
    payload: { session_id: sessionId, id: sessionId, cwd },
  };
  const records = [sessionMeta, ...lines];
  fs.writeFileSync(path.join(dir, fileName), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function userMessage(timestamp, message) {
  return { timestamp, type: 'event_msg', payload: { type: 'user_message', message } };
}

test('extracts in-range user messages whose session cwd matches the project', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexSessionsRoot = path.join(homeDir, '.codex', 'sessions');
  writeRollout(codexSessionsRoot, {
    year: '2026', month: '06', day: '30',
    fileName: 'rollout-2026-06-30T00-00-00-aaaa.jsonl',
    sessionId: 'aaaa',
    cwd: 'C:\\project\\fixture-repo',
    lines: [
      userMessage('2026-06-30T01:00:00.000Z', '이번 주 안에 처리할 이슈 정리해줘'),
      userMessage('2026-06-20T01:00:00.000Z', '지난 주 작업 — 범위 밖'),
    ],
  });

  const messages = getCodexUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    codexSessionsRoot,
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '이번 주 안에 처리할 이슈 정리해줘');
  assert.equal(messages[0].source, 'codex');
});

test('ignores sessions whose cwd points at a different project', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexSessionsRoot = path.join(homeDir, '.codex', 'sessions');
  writeRollout(codexSessionsRoot, {
    year: '2026', month: '06', day: '30',
    fileName: 'rollout-2026-06-30T00-00-00-bbbb.jsonl',
    sessionId: 'bbbb',
    cwd: 'C:\\project\\other-repo',
    lines: [userMessage('2026-06-30T01:00:00.000Z', '다른 프로젝트 작업')],
  });

  const messages = getCodexUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    codexSessionsRoot,
    homeDir,
  });

  assert.deepEqual(messages, []);
});

test('skips sessions listed in external_agent_session_imports.json', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexSessionsRoot = path.join(homeDir, '.codex', 'sessions');
  writeRollout(codexSessionsRoot, {
    year: '2026', month: '06', day: '30',
    fileName: 'rollout-2026-06-30T00-00-00-cccc.jsonl',
    sessionId: 'cccc',
    cwd: 'C:\\project\\fixture-repo',
    lines: [userMessage('2026-06-30T01:00:00.000Z', 'Claude에서 임포트된 세션')],
  });
  fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, '.codex', 'external_agent_session_imports.json'),
    JSON.stringify({ records: [{ imported_thread_id: 'cccc' }] })
  );

  const messages = getCodexUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    codexSessionsRoot,
    homeDir,
  });

  assert.deepEqual(messages, []);
});

test('skips sessions carrying the <EXTERNAL SESSION IMPORTED> marker even without a registry entry', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexSessionsRoot = path.join(homeDir, '.codex', 'sessions');
  writeRollout(codexSessionsRoot, {
    year: '2026', month: '06', day: '30',
    fileName: 'rollout-2026-06-30T00-00-00-dddd.jsonl',
    sessionId: 'dddd',
    cwd: 'C:\\project\\fixture-repo',
    lines: [
      { timestamp: '2026-06-30T00:30:00.000Z', type: 'event_msg', payload: { type: 'agent_message', message: '<EXTERNAL SESSION IMPORTED>' } },
      userMessage('2026-06-30T01:00:00.000Z', '레지스트리에는 없지만 마커가 있는 세션'),
    ],
  });

  const messages = getCodexUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    codexSessionsRoot,
    homeDir,
  });

  assert.deepEqual(messages, []);
});

test('returns [] when the codex sessions directory does not exist', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-empty-'));
  const messages = getCodexUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    codexSessionsRoot: path.join(homeDir, '.codex', 'sessions'),
    homeDir,
  });
  assert.deepEqual(messages, []);
});
