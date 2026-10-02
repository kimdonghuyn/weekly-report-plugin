'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getSessionUserMessages, listClaudeSessions } = require('./sessionScan');

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

test('parses session records when the .jsonl uses CRLF line endings', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-crlf-'));
  const sessionDir = path.join(claudeProjectsRoot, 'C--project-fixture-repo');
  fs.mkdirSync(sessionDir, { recursive: true });
  const records = [
    { type: 'user', isSidechain: false, timestamp: '2026-06-30T01:00:00.000Z', message: { role: 'user', content: '크롤 CRLF 요청' } },
    { type: 'user', isSidechain: false, timestamp: '2026-06-30T02:00:00.000Z', message: { role: 'user', content: '두 번째 요청' } },
  ];
  fs.writeFileSync(
    path.join(sessionDir, 'session-crlf.jsonl'),
    records.map((r) => JSON.stringify(r)).join('\r\n') + '\r\n',
    'utf8'
  );

  const messages = getSessionUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    claudeProjectsRoot,
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].text, '크롤 CRLF 요청');
  assert.equal(messages[1].text, '두 번째 요청');
});

test('listClaudeSessions reads every project dir, keeps the recorded cwd, and drops injected turns', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-list-'));
  const sessionDir = path.join(claudeProjectsRoot, 'C--project');
  fs.mkdirSync(sessionDir, { recursive: true });
  const ts = '2026-06-30T01:00:00.000Z';
  const user = (content, extra = {}) => ({ type: 'user', cwd: 'C:\\project', timestamp: ts, message: { role: 'user', content }, ...extra });
  const records = [
    user('설계서 검토해줘', { origin: { kind: 'human' } }),
    user([{ type: 'text', text: '이 화면 왜 깨져?' }, { type: 'image', source: {} }]),
    user('This session is being continued from a previous conversation...', { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    user('<task-notification> done </task-notification>', { origin: { kind: 'task-notification' } }),
    user('[Request interrupted by user]'),
    user('<command-name>/model</command-name>'),
    user('<local-command-stdout>Set model</local-command-stdout>'),
  ];
  fs.writeFileSync(path.join(sessionDir, 's1.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const sessions = listClaudeSessions({
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2099-01-01T00:00:00.000Z'),
    claudeProjectsRoot,
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].cwd, 'C:\\project');
  assert.equal(sessions[0].dirName, 'C--project');
  assert.equal(sessions[0].sessionId, 's1');
  assert.deepEqual(sessions[0].messages.map((m) => m.text), ['설계서 검토해줘', '이 화면 왜 깨져?']);
});

test('listClaudeSessions skips transcripts not written to since the week started', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-old-'));
  const sessionDir = path.join(claudeProjectsRoot, 'C--project');
  fs.mkdirSync(sessionDir, { recursive: true });
  const file = path.join(sessionDir, 'old.jsonl');
  fs.writeFileSync(file, JSON.stringify({ type: 'user', timestamp: '2026-06-30T01:00:00.000Z', message: { content: 'x' } }) + '\n');
  const old = new Date('2026-06-01T00:00:00.000Z');
  fs.utimesSync(file, old, old);

  const sessions = listClaudeSessions({
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    claudeProjectsRoot,
  });
  assert.deepEqual(sessions, []);
});
