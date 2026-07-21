'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseWeeklyLog } = require('./manualLog');

test('parses date headings and bracketed project entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-manuallog-'));
  const file = path.join(dir, '2026-W27.md');
  fs.writeFileSync(
    file,
    [
      '## 2026-07-01 (수)',
      '- [intube-cms-user-fe] 메가메뉴 hover 접근성 개선',
      '- [고려대 FE] 인증 흐름 구현',
      '',
      '## 2026-07-02 (목)',
      '- [intube-cms-user-fe] 사이드바 API 호출 제거',
    ].join('\n'),
    'utf8'
  );

  const entries = parseWeeklyLog(file);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], { date: '2026-07-01', project: 'intube-cms-user-fe', content: '메가메뉴 hover 접근성 개선' });
  assert.deepEqual(entries[1], { date: '2026-07-01', project: '고려대 FE', content: '인증 흐름 구현' });
  assert.deepEqual(entries[2], { date: '2026-07-02', project: 'intube-cms-user-fe', content: '사이드바 API 호출 제거' });
});

test('returns [] when the file does not exist', () => {
  assert.deepEqual(parseWeeklyLog('C:/nope/does-not-exist.md'), []);
});

test('parses entries when the file uses CRLF line endings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-manuallog-crlf-'));
  const file = path.join(dir, '2026-W27.md');
  fs.writeFileSync(
    file,
    [
      '## 2026-07-01 (수)',
      '- [demo-repo] 첫 번째 작업',
      '- [고려대 FE] 두 번째 작업',
    ].join('\r\n'),
    'utf8'
  );

  const entries = parseWeeklyLog(file);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { date: '2026-07-01', project: 'demo-repo', content: '첫 번째 작업' });
  assert.deepEqual(entries[1], { date: '2026-07-01', project: '고려대 FE', content: '두 번째 작업' });
});
