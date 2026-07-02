'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendLogEntry, isoWeekLabel } = require('./append');

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
