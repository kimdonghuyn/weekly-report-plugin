'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getFigmaActivity } = require('./figmaScan');

const SINCE = new Date('2026-08-03T00:00:00Z');
const UNTIL = new Date('2026-08-10T00:00:00Z');

function makeFetcher(responses) {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (!(url in responses)) throw new Error(`unexpected url: ${url}`);
    const value = responses[url];
    if (value instanceof Error) throw value;
    return value;
  };
  return { fetchJson, calls };
}

const BASE = 'https://api.figma.com';

function baseResponses() {
  return {
    [`${BASE}/v1/teams/T1/projects`]: {
      name: 'Design Team',
      projects: [{ id: 'P1', name: 'App Design' }],
    },
    [`${BASE}/v1/projects/P1/files`]: {
      name: 'App Design',
      files: [
        { key: 'F1', name: 'Login Flow', last_modified: '2026-08-05T10:00:00Z' },
        { key: 'F2', name: 'Old File', last_modified: '2026-07-01T10:00:00Z' },
      ],
    },
    [`${BASE}/v1/files/F1/versions`]: {
      versions: [
        {
          id: 'v3',
          created_at: '2026-08-05T10:00:00Z',
          label: '로그인 개편 v2',
          description: '',
          user: { id: 'u1', handle: 'designer-kim' },
        },
        {
          id: 'v2',
          created_at: '2026-08-04T09:00:00Z',
          label: '',
          description: '',
          user: { id: 'u2', handle: 'designer-lee' },
        },
        {
          id: 'v1',
          created_at: '2026-07-20T09:00:00Z',
          label: 'old',
          description: '',
          user: { id: 'u1', handle: 'designer-kim' },
        },
      ],
      pagination: {},
    },
  };
}

test('aggregates in-range versions per file and skips files not modified since the week start', async () => {
  const { fetchJson, calls } = makeFetcher(baseResponses());

  const activity = await getFigmaActivity({
    token: 'tok',
    teamIds: ['T1'],
    since: SINCE,
    until: UNTIL,
    fetchJson,
  });

  assert.equal(activity.length, 1);
  const file = activity[0];
  assert.equal(file.teamName, 'Design Team');
  assert.equal(file.projectName, 'App Design');
  assert.equal(file.fileName, 'Login Flow');
  assert.deepEqual(
    file.versions.map((v) => v.user.handle),
    ['designer-kim', 'designer-lee']
  );
  assert.ok(!calls.includes(`${BASE}/v1/files/F2/versions`), 'stale file must not be fetched');
});

test('filters versions by userHandles when provided', async () => {
  const { fetchJson } = makeFetcher(baseResponses());

  const activity = await getFigmaActivity({
    token: 'tok',
    teamIds: ['T1'],
    userHandles: ['designer-lee'],
    since: SINCE,
    until: UNTIL,
    fetchJson,
  });

  assert.equal(activity.length, 1);
  assert.deepEqual(
    activity[0].versions.map((v) => v.user.handle),
    ['designer-lee']
  );
});

test('omits files whose in-range versions are all filtered out', async () => {
  const { fetchJson } = makeFetcher(baseResponses());

  const activity = await getFigmaActivity({
    token: 'tok',
    teamIds: ['T1'],
    userHandles: ['nobody'],
    since: SINCE,
    until: UNTIL,
    fetchJson,
  });

  assert.deepEqual(activity, []);
});

test('follows pagination while the oldest fetched version is still inside the week', async () => {
  const responses = baseResponses();
  responses[`${BASE}/v1/files/F1/versions`] = {
    versions: [
      {
        id: 'v9',
        created_at: '2026-08-06T10:00:00Z',
        label: '',
        description: '',
        user: { id: 'u1', handle: 'designer-kim' },
      },
    ],
    pagination: { next_page: `${BASE}/v1/files/F1/versions?before=9` },
  };
  responses[`${BASE}/v1/files/F1/versions?before=9`] = {
    versions: [
      {
        id: 'v8',
        created_at: '2026-08-03T08:00:00Z',
        label: '',
        description: '',
        user: { id: 'u1', handle: 'designer-kim' },
      },
      {
        id: 'v7',
        created_at: '2026-07-30T08:00:00Z',
        label: '',
        description: '',
        user: { id: 'u1', handle: 'designer-kim' },
      },
    ],
    pagination: { next_page: `${BASE}/v1/files/F1/versions?before=7` },
  };
  const { fetchJson, calls } = makeFetcher(responses);

  const activity = await getFigmaActivity({
    token: 'tok',
    teamIds: ['T1'],
    since: SINCE,
    until: UNTIL,
    fetchJson,
  });

  assert.equal(activity[0].versions.length, 2);
  assert.ok(
    !calls.includes(`${BASE}/v1/files/F1/versions?before=7`),
    'must stop paginating once versions fall before the week start'
  );
});

test('returns [] when token or teamIds are missing', async () => {
  const { fetchJson, calls } = makeFetcher({});
  assert.deepEqual(
    await getFigmaActivity({ token: '', teamIds: ['T1'], since: SINCE, until: UNTIL, fetchJson }),
    []
  );
  assert.deepEqual(
    await getFigmaActivity({ token: 'tok', teamIds: [], since: SINCE, until: UNTIL, fetchJson }),
    []
  );
  assert.deepEqual(calls, []);
});

test('skips teams and files that fail to fetch instead of throwing', async () => {
  const responses = baseResponses();
  responses[`${BASE}/v1/teams/T2/projects`] = new Error('403 Forbidden');
  responses[`${BASE}/v1/files/F1/versions`] = new Error('429 Too Many Requests');
  const { fetchJson } = makeFetcher(responses);

  const activity = await getFigmaActivity({
    token: 'tok',
    teamIds: ['T1', 'T2'],
    since: SINCE,
    until: UNTIL,
    fetchJson,
  });

  assert.deepEqual(activity, []);
});
