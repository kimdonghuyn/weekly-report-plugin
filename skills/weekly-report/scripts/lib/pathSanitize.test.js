'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeProjectPath } = require('./pathSanitize');

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
