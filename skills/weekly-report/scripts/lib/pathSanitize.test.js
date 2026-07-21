'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeProjectPath, normalizeScanRoot } = require('./pathSanitize');

test('sanitizes a simple project path', () => {
  assert.equal(
    sanitizeProjectPath('C:\\project\\intube-cms-user-fe'),
    'C--project-intube-cms-user-fe'
  );
});

test('sanitizes a bare user home path', () => {
  assert.equal(sanitizeProjectPath('C:\\Users\\philip'), 'C--Users-philip');
});

test('sanitizes a deeper path with an already-hyphenated folder name', () => {
  assert.equal(
    sanitizeProjectPath('C:\\Users\\philip\\IdeaProjects\\next-study'),
    'C--Users-philip-IdeaProjects-next-study'
  );
});

test('normalizeScanRoot converts backslashes to forward slashes', () => {
  assert.equal(normalizeScanRoot('C:\\project'), 'C:/project');
  assert.equal(normalizeScanRoot('C:\\Users\\philip\\work'), 'C:/Users/philip/work');
});

test('normalizeScanRoot leaves forward-slash paths unchanged', () => {
  assert.equal(normalizeScanRoot('/Users/philip/projects'), '/Users/philip/projects');
  assert.equal(normalizeScanRoot('C:/project'), 'C:/project');
});
