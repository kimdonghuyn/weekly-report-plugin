'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getSessionUserMessages } = require('./sessionScan');

function writeFixture(sessionDir) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const records = [
    { type: 'ai-title' },
    { type: 'user', isSidechain: false, timestamp: '2026-06-30T01:00:00.000Z', message: { role: 'user', content: '이번 주 안에 처리할 이슈 정리해줘' } },
    { type: 'user', isSidechain: false, timestamp: '2026-06-30T02:00:00.000Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'file contents...' }] } },
    { type: 'user', isSidechain: true, timestamp: '2026-06-30T03:00:00.000Z', message: { role: 'user', content: 'subagent internal prompt' } },
    { type: 'user', isSidechain: false, timestamp: '2026-06-20T01:00:00.000Z', message: { role: 'user', content: '지난 주 작업' } },
    { type: 'assistant', message: { role: 'assistant', content: 'ok' } },
  ];
  fs.writeFileSync(path.join(sessionDir, 'session-a.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

test('extracts only in-range, non-sidechain, string-content user messages', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-'));
  writeFixture(path.join(claudeProjectsRoot, 'C--project-fixture-repo'));

  const messages = getSessionUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    claudeProjectsRoot,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '이번 주 안에 처리할 이슈 정리해줘');
});

test('returns [] when the session directory does not exist', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-empty-'));
  const messages = getSessionUserMessages('C:\\project\\nope', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    claudeProjectsRoot,
  });
  assert.deepEqual(messages, []);
});

test('skips unparseable lines without throwing', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-broken-'));
  const sessionDir = path.join(claudeProjectsRoot, 'C--project-fixture-repo');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'broken.jsonl'), 'not json\n{"type":"user"', 'utf8');

  const messages = getSessionUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    claudeProjectsRoot,
  });
  assert.deepEqual(messages, []);
});
