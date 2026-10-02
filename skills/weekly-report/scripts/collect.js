'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getWeekRange } = require('./lib/week');
const { loadOrCreateConfig } = require('./lib/config');
const { findGitRepos, groupWorktrees, getCommits, getBranchStatus, normalizePath } = require('./lib/gitScan');
const { listClaudeSessions } = require('./lib/sessionScan');
const { listCodexSessions, resolveCodexHomes } = require('./lib/codexScan');
const { listGeminiSessions } = require('./lib/geminiScan');
const { attributeSessions } = require('./lib/sessionMatch');
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

function discoverRepos(scanRoots, scanDepth) {
  const seen = new Set();
  const repoPaths = [];
  for (const rawRoot of scanRoots) {
    for (const repoPath of findGitRepos(normalizeScanRoot(rawRoot), { maxDepth: scanDepth })) {
      const key = normalizePath(repoPath);
      if (seen.has(key)) continue;
      seen.add(key);
      repoPaths.push(repoPath);
    }
  }
  return groupWorktrees(repoPaths);
}

async function run({
  argv = process.argv.slice(2),
  homeDir = os.homedir(),
  env = process.env,
  platform = process.platform,
  figmaFetchJson,
} = {}) {
  const { start } = parseArgs(argv);
  const week = getWeekRange(start);
  const range = { since: week.start, until: week.end };

  const configPath = path.join(homeDir, '.claude', 'weekly-report', 'config.json');
  const config = loadOrCreateConfig(configPath);
  const claudeProjectsRoot = path.join(homeDir, '.claude', 'projects');
  const geminiTmpRoot = path.join(homeDir, '.gemini', 'tmp');
  const codexHomes = resolveCodexHomes({ homeDir, env, platform, extraHomes: config.codexHomes || [] });
  const logsDir = path.join(homeDir, '.claude', 'weekly-report', 'logs');
  const manualEntries = parseWeeklyLog(path.join(logsDir, `${week.isoLabel}.md`));

  const repos = discoverRepos(config.scanRoots, config.scanDepth);
  const sessions = [
    ...listClaudeSessions({ ...range, claudeProjectsRoot }),
    ...listCodexSessions({ ...range, codexHomes }),
    ...listGeminiSessions({ ...range, geminiTmpRoot, homeDir }),
  ];
  const { byRepo, unscopedSessions } = attributeSessions(sessions, repos);

  const projects = [];
  const claimedEntries = new Set();

  repos.forEach((repo, i) => {
    const { repoPath, repoName } = repo;
    const commits = getCommits(repoPath, { ...range, authorEmail: config.authorEmail });
    const sessionMessages = byRepo[i];
    const names = [repoName, ...repo.paths.map((p) => path.basename(p))];
    const ownEntries = manualEntries.filter((e) => names.some((name) => matches(e.project, name)));

    if (commits.length === 0 && sessionMessages.length === 0 && ownEntries.length === 0) return;

    for (const e of ownEntries) claimedEntries.add(e);
    projects.push({
      repoPath,
      repoName,
      worktrees: repo.paths.filter((p) => normalizePath(p) !== normalizePath(repoPath) && fs.existsSync(p)),
      commits,
      sessionMessages,
      manualEntries: ownEntries,
      branches: getBranchStatus(repoPath, { authorEmail: config.authorEmail, until: week.end }),
    });
  });

  const unmatched = manualEntries.filter((e) => !claimedEntries.has(e));

  // Figma는 옵션 소스: 토큰(FIGMA_TOKEN 환경변수 우선)과 teamIds가 설정된 경우에만 조회한다.
  const figmaConfig = config.figma || {};
  const figmaToken = env.FIGMA_TOKEN || figmaConfig.token || '';
  const figmaTeamIds = figmaConfig.teamIds || [];
  const figmaFileKeys = figmaConfig.fileKeys || [];
  const figmaConfigured = Boolean(figmaToken) && (figmaTeamIds.length > 0 || figmaFileKeys.length > 0);
  const figma = figmaConfigured
    ? await getFigmaActivity({
        token: figmaToken,
        teamIds: figmaTeamIds,
        fileKeys: figmaFileKeys,
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
    unscopedSessions,
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
