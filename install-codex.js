#!/usr/bin/env node
'use strict';
// Codex CLI에는 Claude Code의 플러그인/마켓플레이스 개념이 없으므로,
// skills/ 아래의 각 스킬 폴더를 Codex 스킬 디렉터리로 복사하는 것으로 설치한다.
// 사용법: node install-codex.js [--target=<스킬 디렉터리>]
//   기본 대상: ~/.codex/skills
const fs = require('fs');
const os = require('os');
const path = require('path');

function installSkills({ skillsSrcDir, targetDir }) {
  const installed = [];
  for (const entry of fs.readdirSync(skillsSrcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcSkillDir = path.join(skillsSrcDir, entry.name);
    if (!fs.existsSync(path.join(srcSkillDir, 'SKILL.md'))) continue;
    const dest = path.join(targetDir, entry.name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(srcSkillDir, dest, { recursive: true });
    installed.push({ name: entry.name, dest });
  }
  return installed;
}

function main() {
  const targetArg = process.argv.slice(2).find((a) => a.startsWith('--target='));
  const targetDir = targetArg
    ? path.resolve(targetArg.slice('--target='.length))
    : path.join(os.homedir(), '.codex', 'skills');
  const skillsSrcDir = path.join(__dirname, 'skills');
  const installed = installSkills({ skillsSrcDir, targetDir });
  for (const { name, dest } of installed) {
    console.log(`installed ${name} -> ${dest}`);
  }
  if (installed.length === 0) {
    console.error(`no skills found under ${skillsSrcDir}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { installSkills };
