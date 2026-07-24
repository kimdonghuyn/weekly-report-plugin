'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { getGeminiUserMessages } = require('./geminiScan');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wr-gemini-home-'));
}

function tmpRoot(homeDir) {
  return path.join(homeDir, '.gemini', 'tmp');
}

// Write a chats/*.jsonl session: first line = metadata, rest = message records.
function writeJsonlChat(projectDir, fileName, { meta, records }) {
  const chatsDir = path.join(projectDir, 'chats');
  fs.mkdirSync(chatsDir, { recursive: true });
  const lines = [meta, ...records].map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(chatsDir, fileName), lines, 'utf8');
}

// Legacy monolithic chats/*.json: a single object with a history array.
function writeJsonChat(projectDir, fileName, obj) {
  const chatsDir = path.join(projectDir, 'chats');
  fs.mkdirSync(chatsDir, { recursive: true });
  fs.writeFileSync(path.join(chatsDir, fileName), JSON.stringify(obj), 'utf8');
}

function writeProjectRoot(projectDir, cwd) {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.project_root'), cwd, 'utf8');
}

const WEEK = {
  since: new Date('2026-06-29T00:00:00.000Z'),
  until: new Date('2026-07-06T00:00:00.000Z'),
};

test('extracts in-range user messages from a slug dir resolved via .project_root', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'fixture-repo');
  writeProjectRoot(projectDir, 'C:\\project\\fixture-repo');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's1', projectHash: 'h', startTime: '2026-06-30T00:00:00.000Z', kind: 'main' },
    records: [
      { id: 'a', timestamp: '2026-06-30T01:00:00.000Z', type: 'user', content: '이번 주 안에 이슈 정리해줘' },
      { id: 'b', timestamp: '2026-06-30T01:01:00.000Z', type: 'gemini', content: '알겠습니다' },
      { id: 'c', timestamp: '2026-06-20T01:00:00.000Z', type: 'user', content: '지난 주 — 범위 밖' },
    ],
  });

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '이번 주 안에 이슈 정리해줘');
  assert.equal(messages[0].source, 'gemini');
});

test('resolves a legacy sha256-hash dir via in-file directories and reads monolithic .json history', () => {
  const homeDir = makeHome();
  const cwd = 'C:\\project\\fixture-repo';
  const projectDir = path.join(tmpRoot(homeDir), sha256(cwd));
  writeJsonChat(projectDir, 'session.json', {
    sessionId: 's2',
    projectHash: sha256(cwd),
    directories: [cwd],
    history: [
      { id: 'a', timestamp: '2026-06-30T02:00:00.000Z', type: 'user', content: '레거시 json 세션' },
      { id: 'b', timestamp: '2026-06-30T02:01:00.000Z', type: 'gemini', content: '응답' },
    ],
  });

  const messages = getGeminiUserMessages(cwd, {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '레거시 json 세션');
});

test('falls back to logs.json when the dir has no chats/', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'logs-only');
  writeProjectRoot(projectDir, 'C:\\project\\fixture-repo');
  fs.writeFileSync(
    path.join(projectDir, 'logs.json'),
    JSON.stringify([
      { sessionId: 's3', messageId: 0, timestamp: '2026-06-30T03:00:00.000Z', type: 'user', message: 'logs.json 프롬프트' },
      { sessionId: 's3', messageId: 1, timestamp: '2026-06-30T03:01:00.000Z', type: 'user', message: '두 번째' },
    ]),
    'utf8'
  );

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.deepEqual(messages.map((m) => m.text), ['logs.json 프롬프트', '두 번째']);
  assert.equal(messages[0].source, 'gemini');
});

test('prefers chats/ over logs.json when both exist (no duplication)', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'both');
  writeProjectRoot(projectDir, 'C:\\project\\fixture-repo');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's4', kind: 'main' },
    records: [{ id: 'a', timestamp: '2026-06-30T04:00:00.000Z', type: 'user', content: 'chats 프롬프트' }],
  });
  fs.writeFileSync(
    path.join(projectDir, 'logs.json'),
    JSON.stringify([{ sessionId: 's4', messageId: 0, timestamp: '2026-06-30T04:00:00.000Z', type: 'user', message: 'chats 프롬프트' }]),
    'utf8'
  );

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'chats 프롬프트');
});

test('concatenates .text from content part arrays and ignores non-text parts', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'parts');
  writeProjectRoot(projectDir, 'C:\\project\\fixture-repo');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's5', kind: 'main' },
    records: [
      {
        id: 'a',
        timestamp: '2026-06-30T05:00:00.000Z',
        type: 'user',
        content: [{ text: '파일 ' }, { functionCall: { name: 'read' } }, { text: '읽어줘' }],
      },
    ],
  });

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '파일 읽어줘');
});

test('resolves via projects.json (path -> slug map) when no .project_root or directories', () => {
  const homeDir = makeHome();
  const cwd = 'C:\\project\\fixture-repo';
  const projectDir = path.join(tmpRoot(homeDir), 'my-slug');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's6', kind: 'main' },
    records: [{ id: 'a', timestamp: '2026-06-30T06:00:00.000Z', type: 'user', content: 'projects.json 매칭' }],
  });
  fs.mkdirSync(path.join(homeDir, '.gemini'), { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, '.gemini', 'projects.json'),
    JSON.stringify({ projects: { 'C:/project/fixture-repo': 'my-slug' } }),
    'utf8'
  );

  const messages = getGeminiUserMessages(cwd, {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'projects.json 매칭');
});

test('ignores dirs whose cwd points at a different project', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'other');
  writeProjectRoot(projectDir, 'C:\\project\\other-repo');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's7', kind: 'main' },
    records: [{ id: 'a', timestamp: '2026-06-30T07:00:00.000Z', type: 'user', content: '다른 프로젝트' }],
  });

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.deepEqual(messages, []);
});

test('excludes subagent sessions', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'sub');
  writeProjectRoot(projectDir, 'C:\\project\\fixture-repo');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's8', kind: 'subagent' },
    records: [{ id: 'a', timestamp: '2026-06-30T08:00:00.000Z', type: 'user', content: '서브에이전트 내부' }],
  });

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.deepEqual(messages, []);
});

test('skips $set and $rewindTo control lines in jsonl', () => {
  const homeDir = makeHome();
  const projectDir = path.join(tmpRoot(homeDir), 'control');
  writeProjectRoot(projectDir, 'C:\\project\\fixture-repo');
  writeJsonlChat(projectDir, 'session-1.jsonl', {
    meta: { sessionId: 's9', kind: 'main' },
    records: [
      { $set: { summary: 'x' } },
      { id: 'a', timestamp: '2026-06-30T09:00:00.000Z', type: 'user', content: '진짜 프롬프트' },
      { $rewindTo: 'a' },
    ],
  });

  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '진짜 프롬프트');
});

test('returns [] when the gemini tmp directory does not exist', () => {
  const homeDir = makeHome();
  const messages = getGeminiUserMessages('C:\\project\\fixture-repo', {
    ...WEEK,
    geminiTmpRoot: tmpRoot(homeDir),
    homeDir,
  });
  assert.deepEqual(messages, []);
});
