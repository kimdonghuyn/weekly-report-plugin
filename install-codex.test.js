'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installSkills } = require('./install-codex');

function makeSkillsSrc() {
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-src-'));
  const skillDir = path.join(srcDir, 'weekly-log');
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: weekly-log\n---\n', 'utf8');
  fs.writeFileSync(path.join(skillDir, 'scripts', 'append.js'), '// script\n', 'utf8');
  return srcDir;
}

test('copies each skill folder with its scripts into the target directory', () => {
  const srcDir = makeSkillsSrc();
  const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-dst-')), 'skills');

  const installed = installSkills({ skillsSrcDir: srcDir, targetDir });

  assert.deepEqual(installed.map((s) => s.name), ['weekly-log']);
  assert.ok(fs.existsSync(path.join(targetDir, 'weekly-log', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(targetDir, 'weekly-log', 'scripts', 'append.js')));
});

test('reinstalling replaces the destination and removes stale files', () => {
  const srcDir = makeSkillsSrc();
  const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-dst2-')), 'skills');
  const staleDir = path.join(targetDir, 'weekly-log');
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'obsolete.js'), '// stale\n', 'utf8');

  installSkills({ skillsSrcDir: srcDir, targetDir });

  assert.ok(!fs.existsSync(path.join(staleDir, 'obsolete.js')), 'stale file should be gone');
  assert.ok(fs.existsSync(path.join(staleDir, 'SKILL.md')));
});

test('ignores entries in the source that are not skill folders', () => {
  const srcDir = makeSkillsSrc();
  fs.writeFileSync(path.join(srcDir, 'README.md'), 'not a skill\n', 'utf8');
  fs.mkdirSync(path.join(srcDir, 'no-skill-md'));
  const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wr-codex-dst3-')), 'skills');

  const installed = installSkills({ skillsSrcDir: srcDir, targetDir });

  assert.deepEqual(installed.map((s) => s.name), ['weekly-log']);
  assert.ok(!fs.existsSync(path.join(targetDir, 'no-skill-md')));
});
