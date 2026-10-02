'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexUserMessages, listCodexSessions, resolveCodexHomes } = require('./codexScan');

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

function userMessageItem(timestamp, text) {
  return {
    timestamp,
    type: 'event_msg',
    payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text }] } },
  };
}

function turnContext(timestamp, cwd) {
  return { timestamp, type: 'turn_context', payload: { cwd } };
}

const WEEK = { since: new Date('2026-06-29T00:00:00.000Z'), until: new Date('2026-07-06T00:00:00.000Z') };

test('reads prompts logged in the newer UserMessage item format', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexSessionsRoot = path.join(homeDir, '.codex', 'sessions');
  writeRollout(codexSessionsRoot, {
    year: '2026', month: '06', day: '30',
    fileName: 'rollout-2026-06-30T00-00-00-eeee.jsonl',
    sessionId: 'eeee',
    cwd: 'C:\\project\\fixture-repo',
    lines: [
      // the raw model input also carries injected context; only the item event is the prompt
      { timestamp: '2026-06-30T01:00:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>' }] } },
      userMessageItem('2026-06-30T01:00:01.000Z', '설계서 기준으로 보완할 부분 찾아줘'),
      { timestamp: '2026-06-30T01:00:02.000Z', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'text', text: '답변' }] } } },
    ],
  });

  const messages = getCodexUserMessages('C:\\project\\fixture-repo', { ...WEEK, codexSessionsRoot, homeDir });
  assert.deepEqual(messages.map((m) => m.text), ['설계서 기준으로 보완할 부분 찾아줘']);
});

test('listCodexSessions follows cwd changes from turn_context records', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexHome = path.join(homeDir, '.codex');
  writeRollout(path.join(codexHome, 'sessions'), {
    year: '2026', month: '06', day: '30',
    fileName: 'rollout-2026-06-30T00-00-00-ffff.jsonl',
    sessionId: 'ffff',
    cwd: 'C:\\project',
    lines: [
      userMessageItem('2026-06-30T01:00:00.000Z', '상위 폴더에서 한 요청'),
      turnContext('2026-06-30T02:00:00.000Z', 'C:\\project\\fixture-repo'),
      userMessageItem('2026-06-30T02:00:01.000Z', '저장소로 옮겨서 한 요청'),
    ],
  });

  const sessions = listCodexSessions({ ...WEEK, codexHomes: [codexHome] });
  assert.equal(sessions.length, 1);
  assert.deepEqual(
    sessions[0].messages.map((m) => [m.cwd, m.text]),
    [
      ['C:\\project', '상위 폴더에서 한 요청'],
      ['C:\\project\\fixture-repo', '저장소로 옮겨서 한 요청'],
    ]
  );
});

test('listCodexSessions picks up a session started before the week that was written to during it', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const codexHome = path.join(homeDir, '.codex');
  writeRollout(path.join(codexHome, 'sessions'), {
    year: '2026', month: '06', day: '20',
    fileName: 'rollout-2026-06-20T00-00-00-gggg.jsonl',
    sessionId: 'gggg',
    cwd: 'C:\\project\\fixture-repo',
    lines: [userMessageItem('2026-06-20T01:00:00.000Z', '지난주'), userMessageItem('2026-06-30T01:00:00.000Z', '이번 주에 이어서 한 요청')],
  });

  const sessions = listCodexSessions({ since: WEEK.since, until: new Date('2099-01-01T00:00:00.000Z'), codexHomes: [codexHome] });
  assert.deepEqual(sessions[0].messages.map((m) => m.text), ['이번 주에 이어서 한 요청']);
});

test('listCodexSessions counts a session mirrored into two homes once', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-home-'));
  const homes = [path.join(homeDir, 'a'), path.join(homeDir, 'b')];
  for (const home of homes) {
    writeRollout(path.join(home, 'sessions'), {
      year: '2026', month: '06', day: '30',
      fileName: 'rollout-2026-06-30T00-00-00-hhhh.jsonl',
      sessionId: 'hhhh',
      cwd: 'C:\\project\\fixture-repo',
      lines: [userMessageItem('2026-06-30T01:00:00.000Z', '한 번만')],
    });
  }
  assert.equal(listCodexSessions({ ...WEEK, codexHomes: homes }).length, 1);
});

test('resolveCodexHomes finds CODEX_HOME, ~/.codex and Orca-managed homes', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-homes-'));
  const appData = path.join(homeDir, 'AppData', 'Roaming');
  const custom = path.join(homeDir, 'custom-codex');
  const dirs = [
    path.join(homeDir, '.codex'),
    custom,
    path.join(appData, 'orca', 'codex-runtime-home', 'home'),
    path.join(appData, 'orca', 'codex-accounts', 'acc-1', 'home'),
  ];
  for (const dir of dirs) fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(appData, 'orca', 'codex-accounts', 'acc-2', 'home'), { recursive: true }); // no sessions yet

  const homes = resolveCodexHomes({ homeDir, env: { CODEX_HOME: custom, APPDATA: appData }, platform: 'win32' });
  assert.deepEqual(homes.map((h) => path.resolve(h)).sort(), dirs.map((d) => path.resolve(d)).sort());
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
