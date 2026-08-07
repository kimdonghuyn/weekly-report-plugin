'use strict';

const API_BASE = 'https://api.figma.com';
const MAX_VERSION_PAGES = 20;

async function defaultFetchJson(url, token) {
  const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) throw new Error(`Figma API ${res.status} for ${url}`);
  return res.json();
}

async function collectFileVersions(fileKey, { token, since, until, fetchJson }) {
  const versions = [];
  let url = `${API_BASE}/v1/files/${fileKey}/versions`;
  for (let page = 0; page < MAX_VERSION_PAGES && url; page++) {
    const body = await fetchJson(url, token);
    const pageVersions = body.versions || [];
    for (const v of pageVersions) {
      const at = new Date(v.created_at);
      if (at >= since && at < until) versions.push(v);
    }
    const oldest = pageVersions[pageVersions.length - 1];
    const reachedWeekStart = !oldest || new Date(oldest.created_at) < since;
    url = !reachedWeekStart && body.pagination && body.pagination.next_page
      ? body.pagination.next_page
      : null;
  }
  return versions;
}

// 한 주 동안의 Figma 활동을 팀 → 프로젝트 → 파일 순으로 순회하며 수집한다.
// 실행자의 토큰 하나로 팀 전체를 조회하고, 버전의 user로 사람을 구분한다.
// userHandles가 비어 있으면 모든 사람의 활동을 포함한다.
async function getFigmaActivity({ token, teamIds = [], userHandles = [], since, until, fetchJson = defaultFetchJson }) {
  if (!token || teamIds.length === 0) return [];

  const activity = [];
  for (const teamId of teamIds) {
    let team;
    try {
      team = await fetchJson(`${API_BASE}/v1/teams/${teamId}/projects`, token);
    } catch {
      continue;
    }
    for (const project of team.projects || []) {
      let projectFiles;
      try {
        projectFiles = await fetchJson(`${API_BASE}/v1/projects/${project.id}/files`, token);
      } catch {
        continue;
      }
      for (const file of projectFiles.files || []) {
        if (new Date(file.last_modified) < since) continue;
        let versions;
        try {
          versions = await collectFileVersions(file.key, { token, since, until, fetchJson });
        } catch {
          continue;
        }
        if (userHandles.length > 0) {
          versions = versions.filter((v) => v.user && userHandles.includes(v.user.handle));
        }
        if (versions.length === 0) continue;
        activity.push({
          teamName: team.name,
          projectName: project.name,
          fileName: file.name,
          fileKey: file.key,
          versions: versions.map((v) => ({
            createdAt: v.created_at,
            label: v.label || '',
            description: v.description || '',
            user: { id: v.user && v.user.id, handle: v.user && v.user.handle },
          })),
        });
      }
    }
  }
  return activity;
}

module.exports = { getFigmaActivity };
