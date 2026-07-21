'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendLogEntry, isoWeekLabel } = require('./append');
const { isoWeekLabel: weekIsoWeekLabel } = require('../../weekly-report/scripts/lib/week');

test('creates the file with a date heading and entry on first append', () => {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-log-'));
  const date = new Date(2026, 6, 2); // Thursday
  const filePath = appendLogEntry({ logsDir, date, project: 'demo-repo', content: '작업 내용' });
  const text = fs.readFileSync(filePath, 'utf8');
  assert.match(text, /^## 2026-07-02 \(목\)/);
  assert.match(text, /- \[demo-repo\] 작업 내용/);
  assert.equal(path.basename(filePath), '2026-W27.md');
});

test('appending twice on the same day writes only one heading', () => {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-log2-'));
  const date = new Date(2026, 6, 2);
  appendLogEntry({ logsDir, date, project: 'demo-repo', content: '오전 작업' });
  const filePath = appendLogEntry({ logsDir, date, project: 'demo-repo', content: '오후 작업' });
  const text = fs.readFileSync(filePath, 'utf8');
  const headingCount = (text.match(/## 2026-07-02/g) || []).length;
  assert.equal(headingCount, 1);
  assert.match(text, /오전 작업/);
  assert.match(text, /오후 작업/);
});

test('isoWeekLabel produces the file name used for lookup', () => {
  assert.equal(isoWeekLabel(new Date(2026, 6, 2)), '2026-W27');
});

test('append isoWeekLabel pins expected labels across boundaries', () => {
  const cases = [
    [new Date(2026, 0, 1), '2026-W01'],
    [new Date(2026, 6, 2), '2026-W27'],
    [new Date(2026, 6, 5), '2026-W27'],
    [new Date(2026, 6, 6), '2026-W28'],
    [new Date(2026, 11, 31), '2026-W53'],
    [new Date(2027, 0, 1), '2026-W53'],
    [new Date(2027, 0, 4), '2027-W01'],
  ];
  for (const [date, expected] of cases) {
    assert.equal(isoWeekLabel(date), expected, `for ${date.toDateString()}`);
  }
});

test('append and week isoWeekLabel agree on every boundary date', () => {
  const dates = [
    new Date(2026, 0, 1),
    new Date(2026, 6, 2),
    new Date(2026, 6, 5),
    new Date(2026, 6, 6),
    new Date(2026, 11, 31),
    new Date(2027, 0, 1),
    new Date(2027, 0, 4),
  ];
  for (const date of dates) {
    assert.equal(isoWeekLabel(date), weekIsoWeekLabel(date), `divergence at ${date.toDateString()}`);
  }
});

test('normalizes a pre-existing CRLF file to LF and keeps a single heading', () => {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-log-crlf-'));
  const date = new Date(2026, 6, 2); // Thursday -> 2026-W27, heading "## 2026-07-02 (목)"
  const filePath = path.join(logsDir, '2026-W27.md');
  fs.writeFileSync(filePath, '## 2026-07-02 (목)\r\n- [demo-repo] 오전 작업\r\n', 'utf8');

  appendLogEntry({ logsDir, date, project: 'demo-repo', content: '오후 작업' });

  const text = fs.readFileSync(filePath, 'utf8');
  assert.ok(!text.includes('\r'), 'expected no CR characters in the output');
  assert.equal((text.match(/## 2026-07-02/g) || []).length, 1);
  assert.match(text, /오전 작업/);
  assert.match(text, /오후 작업/);
});
