'use strict';
const path = require('path');
const os = require('os');
const { getWeekRange } = require('./lib/week');
const { loadOrCreateConfig } = require('./lib/config');
const { findGitRepos, getCommits } = require('./lib/gitScan');
const { getSessionUserMessages } = require('./lib/sessionScan');
const { getCodexUserMessages } = require('./lib/codexScan');
const { getGeminiUserMessages } = require('./lib/geminiScan');
const { parseWeeklyLog } = require('./lib/manualLog');
const { normalizeScanRoot } = require('./lib/pathSanitize');
const { getFigmaActivity } = require('./lib/figmaScan');

function parseArgs(argv) {
  const startArg = argv.find((a) => a.startsWith('--start='));
  return { start: startArg ? new Date(startArg.slice('--start='.length)) : new Date() };
}

function matches(project, repoName) {
  const p = project.toLowerCase();
  const r = repoName.toLowerCase();
  return p.includes(r) || r.includes(p);
}

async function run({ argv = process.argv.slice(2), homeDir = os.homedir(), figmaFetchJson } = {}) {
  const { start } = parseArgs(argv);
  const week = getWeekRange(start);

  const configPath = path.join(homeDir, '.claude', 'weekly-report', 'config.json');
  const config = loadOrCreateConfig(configPath);
  const claudeProjectsRoot = path.join(homeDir, '.claude', 'projects');
  const codexSessionsRoot = path.join(homeDir, '.codex', 'sessions');
  const geminiTmpRoot = path.join(homeDir, '.gemini', 'tmp');
  const logsDir = path.join(homeDir, '.claude', 'weekly-report', 'logs');
  const manualEntries = parseWeeklyLog(path.join(logsDir, `${week.isoLabel}.md`));

  const projects = [];
  const claimedEntries = new Set();

  for (const rawRoot of config.scanRoots) {
    const root = normalizeScanRoot(rawRoot);
    for (const repoPath of findGitRepos(root)) {
      const repoName = path.basename(repoPath);
      const commits = getCommits(repoPath, { since: week.start, until: week.end, authorEmail: config.authorEmail });
      const claudeMessages = getSessionUserMessages(repoPath, { since: week.start, until: week.end, claudeProjectsRoot });
      const codexMessages = getCodexUserMessages(repoPath, { since: week.start, until: week.end, codexSessionsRoot, homeDir });
      const geminiMessages = getGeminiUserMessages(repoPath, { since: week.start, until: week.end, geminiTmpRoot, homeDir });
      const sessionMessages = [...claudeMessages, ...codexMessages, ...geminiMessages].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
      const ownEntries = manualEntries.filter((e) => matches(e.project, repoName));

      if (commits.length === 0 && sessionMessages.length === 0 && ownEntries.length === 0) continue;

      for (const e of ownEntries) claimedEntries.add(e);
      projects.push({ repoPath, repoName, commits, sessionMessages, manualEntries: ownEntries });
    }
  }

  const unmatched = manualEntries.filter((e) => !claimedEntries.has(e));

  // Figma는 옵션 소스: 토큰(FIGMA_TOKEN 환경변수 우선)과 teamIds가 설정된 경우에만 조회한다.
  const figmaConfig = config.figma || {};
  const figmaToken = process.env.FIGMA_TOKEN || figmaConfig.token || '';
  const figmaTeamIds = figmaConfig.teamIds || [];
  const figmaConfigured = Boolean(figmaToken) && figmaTeamIds.length > 0;
  const figma = figmaConfigured
    ? await getFigmaActivity({
        token: figmaToken,
        teamIds: figmaTeamIds,
        userHandles: figmaConfig.userHandles || [],
        since: week.start,
        until: week.end,
        ...(figmaFetchJson ? { fetchJson: figmaFetchJson } : {}),
      })
    : [];

  return {
    weekLabel: week.isoLabel,
    since: week.start.toISOString(),
    until: week.end.toISOString(),
    archivePath: config.archivePath,
    needsSetup: config.scanRoots.length === 0 && !figmaConfigured,
    projects,
    unmatched,
    figmaConfigured,
    figma,
  };
}

if (require.main === module) {
  run().then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2));
  });
}

module.exports = { run, parseArgs };
