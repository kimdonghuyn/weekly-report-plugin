#!/usr/bin/env node
'use strict';
// Codex CLI 설치 스크립트. 두 가지 모드를 지원한다:
//   node install-codex.js                  스킬만 ~/.codex/skills 로 복사 (기본)
//   node install-codex.js --target=<DIR>   스킬을 지정 디렉터리로 복사
//   node install-codex.js --plugin         정식 Codex 플러그인으로 설치
//     (~/plugins/weekly-report 복사 + ~/.agents/plugins/marketplace.json 등록,
//      이후 `codex plugin add weekly-report@<marketplace>` 실행 필요)
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

function installPlugin({ repoRoot, pluginsDir, marketplacePath }) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, '.codex-plugin', 'plugin.json'), 'utf8')
  );
  const name = manifest.name;
  const dest = path.join(pluginsDir, name);

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // fs.cpSync의 filter는 Node 버전에 따라 동작이 달라 최상위 항목을 직접 순회한다.
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    fs.cpSync(path.join(repoRoot, entry.name), path.join(dest, entry.name), { recursive: true });
  }

  let market;
  if (fs.existsSync(marketplacePath)) {
    market = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  } else {
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    market = { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
  }
  const entry = {
    name,
    source: { source: 'local', path: `./plugins/${name}` },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Productivity',
  };
  const existing = market.plugins.findIndex((p) => p.name === name);
  if (existing >= 0) market.plugins[existing] = entry;
  else market.plugins.push(entry);
  fs.writeFileSync(marketplacePath, JSON.stringify(market, null, 2) + '\n', 'utf8');

  return { name, dest, marketplacePath, marketplaceName: market.name };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--plugin')) {
    const result = installPlugin({
      repoRoot: __dirname,
      pluginsDir: path.join(os.homedir(), 'plugins'),
      marketplacePath: path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json'),
    });
    console.log(`installed plugin ${result.name} -> ${result.dest}`);
    console.log(`marketplace entry updated in ${result.marketplacePath}`);
    console.log('');
    console.log('Next step — register it with Codex:');
    console.log(`  codex plugin add ${result.name}@${result.marketplaceName}`);
    return;
  }
  const targetArg = args.find((a) => a.startsWith('--target='));
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

module.exports = { installSkills, installPlugin };
