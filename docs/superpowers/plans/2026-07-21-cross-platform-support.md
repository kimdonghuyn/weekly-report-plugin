# weekly-report-plugin 크로스 플랫폼 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** weekly-report 플러그인이 Claude Code에서 Windows/macOS 양쪽에 동일하게 설치·동작하도록 견고화하고, macOS 없이도 이식성 회귀를 자동 검출하는 CI를 갖춘다.

**Architecture:** 스크립트 로직은 이미 이식성이 있으므로 재작성하지 않는다. (1) SKILL.md의 스크립트 참조를 표준 변수 `CLAUDE_PLUGIN_ROOT`로 통일하고, (2) 파싱을 CRLF/역슬래시에 방어적으로 만들고, (3) 주 라벨 정합성을 테스트로 고정하며, (4) `package.json`/`.gitattributes`/GitHub Actions 매트릭스로 툴링과 검증을 추가한다. 모든 변경은 TDD로 진행한다.

**Tech Stack:** Node.js (내장 `node:test`, `node:assert/strict`), git, GitHub Actions, Markdown.

## Global Constraints

- 대상 하니스: Claude Code, Windows + macOS 전용. bash 없는 순수 CMD 하니스는 비대상.
- Node 기준선: `>=18` (내장 `node:test` 러너 요구).
- 파일 **쓰기**는 항상 LF(`\n`)로 통일한다. 파일 **읽기/파싱**은 CRLF와 LF를 모두 허용한다.
- scanRoots 경로 정규화는 **`collect.js` 한 곳**에서만 수행한다. `gitScan.js`는 손대지 않는다.
- `isoWeekLabel`은 `week.js`와 `append.js`에 중복 존재하는 현행 구조를 유지한다(물리적 통합 금지). 정합성은 테스트로만 보장한다.
- 기존 27개 테스트는 전 과정에서 계속 통과해야 한다(회귀 없음).
- 커밋 메시지 말미에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 를 붙인다.
- 작업 저장소 루트: `C:\project\weekly-report-plugin` (명령의 상대 경로는 이 루트 기준).

---

### Task 1: 툴링 기반 — package.json, .gitattributes, 줄바꿈 정규화

**Files:**
- Create: `package.json`
- Create: `.gitattributes`

**Interfaces:**
- Consumes: 없음.
- Produces: `npm test` 스크립트 (이후 모든 태스크가 검증에 사용). 명령: `npm test` → 내부적으로 `node --test "skills/**/*.test.js"`.

- [ ] **Step 1: `package.json` 생성**

`node --test "skills/**/*.test.js"` 는 Node 자체 glob(21+)을 쓰므로 셸에 무관하게 Windows/macOS 모두 동일하게 동작한다(로컬 Windows에서 27개 통과 확인됨).

`package.json`:

```json
{
  "name": "weekly-report-plugin",
  "version": "1.0.2",
  "description": "Weekly work report generator for Claude Code — aggregates git commits, session activity, and manual logs into per-project reports.",
  "private": true,
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test \"skills/**/*.test.js\""
  }
}
```

- [ ] **Step 2: `.gitattributes` 생성**

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.gif binary
*.ico binary
```

- [ ] **Step 3: 워킹 트리 줄바꿈 정규화**

`.gitattributes` 도입에 맞춰 기존 파일을 LF로 재정규화한다.

Run:
```bash
git add --renormalize .
git status --short
```
Expected: 일부 파일이 정규화 대상으로 스테이징될 수 있음(없으면 그대로 진행).

- [ ] **Step 4: `npm test` 실행하여 전체 통과 확인**

Run: `npm test`
Expected: `# tests 27` / `# pass 27` / `# fail 0` (마지막 요약 라인에 `pass 27`, `fail 0`).

- [ ] **Step 5: 커밋**

```bash
git add package.json .gitattributes
git add -u
git commit -m "chore: add package.json, .gitattributes, and npm test script

Establishes Node >=18 baseline, an OS-independent \`npm test\` entry
point (node --test with Node's own glob), and enforces LF line
endings across the repo.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: SKILL.md 스크립트 참조 표준화 (A1)

**Files:**
- Modify: `skills/weekly-report/SKILL.md`
- Modify: `skills/weekly-log/SKILL.md`

**Interfaces:**
- Consumes: Claude Code가 제공하는 `${CLAUDE_PLUGIN_ROOT}` (플러그인 루트 절대 경로).
- Produces: 없음 (문서 변경).

- [ ] **Step 1: `skills/weekly-report/SKILL.md` 수정**

기존:
```bash
node "${CLAUDE_SKILL_DIR}/scripts/collect.js"
```
로 변경:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/weekly-report/scripts/collect.js"
```

- [ ] **Step 2: `skills/weekly-log/SKILL.md` 수정**

기존:
```bash
node "${CLAUDE_SKILL_DIR}/scripts/append.js" "<프로젝트명>" "<작업 내용 한 줄>"
```
로 변경:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/weekly-log/scripts/append.js" "<프로젝트명>" "<작업 내용 한 줄>"
```

- [ ] **Step 3: 잔존 참조 없음 확인**

Run (Grep 도구 사용 권장, 아래는 동등한 셸 명령):
```bash
grep -rn "CLAUDE_SKILL_DIR" skills/
```
Expected: 매치 없음(출력 없음, exit 1).

Run:
```bash
grep -rn "CLAUDE_PLUGIN_ROOT" skills/
```
Expected: 두 SKILL.md에서 각각 1건씩, 위에서 넣은 경로가 정확히 보임.

- [ ] **Step 4: 커밋**

```bash
git add skills/weekly-report/SKILL.md skills/weekly-log/SKILL.md
git commit -m "fix: reference scripts via CLAUDE_PLUGIN_ROOT in SKILL.md

CLAUDE_SKILL_DIR was used only by this plugin; the documented,
widely-used variable is CLAUDE_PLUGIN_ROOT. Quoted POSIX expansion
with forward-slash paths works under Claude Code on Windows and macOS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: manualLog CRLF 방어 파싱 (A2)

**Files:**
- Modify: `skills/weekly-report/scripts/lib/manualLog.js:9`
- Test: `skills/weekly-report/scripts/lib/manualLog.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `parseWeeklyLog(filePath)` 는 CRLF 파일도 LF와 동일하게 파싱한다(시그니처 불변).

- [ ] **Step 1: 실패하는 테스트 추가**

`skills/weekly-report/scripts/lib/manualLog.test.js` 끝에 추가:

```javascript
test('parses entries when the file uses CRLF line endings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-manuallog-crlf-'));
  const file = path.join(dir, '2026-W27.md');
  fs.writeFileSync(
    file,
    [
      '## 2026-07-01 (수)',
      '- [demo-repo] 첫 번째 작업',
      '- [고려대 FE] 두 번째 작업',
    ].join('\r\n'),
    'utf8'
  );

  const entries = parseWeeklyLog(file);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { date: '2026-07-01', project: 'demo-repo', content: '첫 번째 작업' });
  assert.deepEqual(entries[1], { date: '2026-07-01', project: '고려대 FE', content: '두 번째 작업' });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test skills/weekly-report/scripts/lib/manualLog.test.js`
Expected: FAIL. 이유: `content`에 trailing `\r`이 남아 예: `'첫 번째 작업\r'` 로 `deepEqual` 불일치(참고: 현행 정규식은 `\r`을 content로 흡수).

- [ ] **Step 3: 최소 구현 — 줄 분리를 CRLF 허용으로 변경**

`skills/weekly-report/scripts/lib/manualLog.js` 9번째 줄:
```javascript
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
```
을 다음으로 변경:
```javascript
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test skills/weekly-report/scripts/lib/manualLog.test.js`
Expected: PASS (신규 테스트 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add skills/weekly-report/scripts/lib/manualLog.js skills/weekly-report/scripts/lib/manualLog.test.js
git commit -m "fix: parse weekly-log files with CRLF or LF line endings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: sessionScan CRLF 방어 파싱 (A2)

**Files:**
- Modify: `skills/weekly-report/scripts/lib/sessionScan.js:17`
- Test: `skills/weekly-report/scripts/lib/sessionScan.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `getSessionUserMessages(projectRoot, opts)` 는 CRLF로 저장된 `.jsonl` 도 정상 파싱한다(시그니처 불변).

- [ ] **Step 1: 실패하는 테스트 추가**

`skills/weekly-report/scripts/lib/sessionScan.test.js` 끝에 추가:

```javascript
test('parses session records when the .jsonl uses CRLF line endings', () => {
  const claudeProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sessions-crlf-'));
  const sessionDir = path.join(claudeProjectsRoot, 'C--project-fixture-repo');
  fs.mkdirSync(sessionDir, { recursive: true });
  const records = [
    { type: 'user', isSidechain: false, timestamp: '2026-06-30T01:00:00.000Z', message: { role: 'user', content: '크롤 CRLF 요청' } },
    { type: 'user', isSidechain: false, timestamp: '2026-06-30T02:00:00.000Z', message: { role: 'user', content: '두 번째 요청' } },
  ];
  fs.writeFileSync(
    path.join(sessionDir, 'session-crlf.jsonl'),
    records.map((r) => JSON.stringify(r)).join('\r\n') + '\r\n',
    'utf8'
  );

  const messages = getSessionUserMessages('C:\\project\\fixture-repo', {
    since: new Date('2026-06-29T00:00:00.000Z'),
    until: new Date('2026-07-06T00:00:00.000Z'),
    claudeProjectsRoot,
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].text, '크롤 CRLF 요청');
  assert.equal(messages[1].text, '두 번째 요청');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test skills/weekly-report/scripts/lib/sessionScan.test.js`
Expected: 참고 — `JSON.parse`는 trailing `\r`을 공백으로 허용하므로 이 테스트가 현행 코드에서도 통과할 수 있다. 만약 PASS로 나오면, 이 케이스는 이미 안전한 것이므로 Step 3의 코드 변경은 **회귀 방지 목적의 명시화**로 그대로 진행하고 Step 4에서 재확인한다. (RED가 안 나와도 정책상 `\n` 하드코딩을 제거해 의도를 코드에 드러낸다.)

- [ ] **Step 3: 최소 구현 — 줄 분리를 CRLF 허용으로 변경**

`skills/weekly-report/scripts/lib/sessionScan.js` 17번째 줄:
```javascript
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
```
을 다음으로 변경:
```javascript
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test skills/weekly-report/scripts/lib/sessionScan.test.js`
Expected: PASS (신규 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add skills/weekly-report/scripts/lib/sessionScan.js skills/weekly-report/scripts/lib/sessionScan.test.js
git commit -m "fix: parse session .jsonl with CRLF or LF line endings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: append 시 CRLF 파일을 LF로 정규화 (A2)

**Files:**
- Modify: `skills/weekly-log/scripts/append.js:26`
- Test: `skills/weekly-log/scripts/append.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `appendLogEntry({ logsDir, date, project, content })` 는 기존 파일이 CRLF여도 결과 파일을 순수 LF로 만든다(시그니처·반환값 불변: 파일 경로 반환).

- [ ] **Step 1: 실패하는 테스트 추가**

`skills/weekly-log/scripts/append.test.js` 끝에 추가:

```javascript
test('normalizes a pre-existing CRLF file to LF and keeps a single heading', () => {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-log-crlf-'));
  const date = new Date(2026, 6, 2); // Thursday -> 2026-W27, heading "## 2026-07-02 (목)"
  const filePath = path.join(logsDir, '2026-W27.md');
  fs.writeFileSync(filePath, '## 2026-07-02 (목)\r\n- [demo-repo] 오전 작업\r\n', 'utf8');

  appendLogEntry({ logsDir, date, project: 'demo-repo', content: '오후 작업' });

  const text = fs.readFileSync(filePath, 'utf8');
  assert.ok(!text.includes('\r'), 'expected no CR characters in the output');
  assert.equal((text.match(/## 2026-07-02/g) || []).length, 1);
  assert.match(text, /오전 작업/);
  assert.match(text, /오후 작업/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test skills/weekly-log/scripts/append.test.js`
Expected: FAIL. 이유: 기존 CRLF 내용을 그대로 읽어 이어붙이므로 결과에 `\r`이 남아 `!text.includes('\r')` 단언 실패.

- [ ] **Step 3: 최소 구현 — 읽은 텍스트를 LF로 정규화**

`skills/weekly-log/scripts/append.js` 26번째 줄:
```javascript
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
```
을 다음으로 변경:
```javascript
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') : '';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test skills/weekly-log/scripts/append.test.js`
Expected: PASS (기존 3개 + 신규 1개).

- [ ] **Step 5: 커밋**

```bash
git add skills/weekly-log/scripts/append.js skills/weekly-log/scripts/append.test.js
git commit -m "fix: normalize existing CRLF log files to LF on append

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: scanRoots 역슬래시 경로 정규화 (A3)

**Files:**
- Modify: `skills/weekly-report/scripts/lib/pathSanitize.js`
- Test: `skills/weekly-report/scripts/lib/pathSanitize.test.js`
- Modify: `skills/weekly-report/scripts/collect.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `normalizeScanRoot(root: string): string` — 역슬래시를 슬래시로 치환. `collect.js`의 `run()` 이 각 `config.scanRoots` 항목에 이를 적용한 뒤 `findGitRepos`에 넘긴다.

- [ ] **Step 1: 실패하는 유닛 테스트 추가**

`skills/weekly-report/scripts/lib/pathSanitize.test.js` 4번째 줄의 require를 다음으로 교체:
```javascript
const { sanitizeProjectPath, normalizeScanRoot } = require('./pathSanitize');
```

파일 끝에 추가:
```javascript
test('normalizeScanRoot converts backslashes to forward slashes', () => {
  assert.equal(normalizeScanRoot('C:\\project'), 'C:/project');
  assert.equal(normalizeScanRoot('C:\\Users\\philip\\work'), 'C:/Users/philip/work');
});

test('normalizeScanRoot leaves forward-slash paths unchanged', () => {
  assert.equal(normalizeScanRoot('/Users/philip/projects'), '/Users/philip/projects');
  assert.equal(normalizeScanRoot('C:/project'), 'C:/project');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test skills/weekly-report/scripts/lib/pathSanitize.test.js`
Expected: FAIL — `normalizeScanRoot is not a function` (import undefined).

- [ ] **Step 3: 최소 구현 — 헬퍼 추가 및 export**

`skills/weekly-report/scripts/lib/pathSanitize.js` 전체를 다음으로 교체:
```javascript
'use strict';

function sanitizeProjectPath(absPath) {
  return absPath.replace(/[^A-Za-z0-9]/g, '-');
}

function normalizeScanRoot(root) {
  return root.replace(/\\/g, '/');
}

module.exports = { sanitizeProjectPath, normalizeScanRoot };
```

- [ ] **Step 4: 유닛 테스트 통과 확인**

Run: `node --test skills/weekly-report/scripts/lib/pathSanitize.test.js`
Expected: PASS (기존 3개 + 신규 2개).

- [ ] **Step 5: `collect.js`에서 정규화 적용**

`skills/weekly-report/scripts/collect.js` 상단 import 블록(8번째 줄 `parseWeeklyLog` require 다음)에 추가:
```javascript
const { normalizeScanRoot } = require('./lib/pathSanitize');
```

그리고 `run()` 내부 34번째 줄:
```javascript
  for (const root of config.scanRoots) {
```
을 다음으로 변경:
```javascript
  for (const rawRoot of config.scanRoots) {
    const root = normalizeScanRoot(rawRoot);
```
(주의: `for` 블록에 한 줄을 추가했으므로 들여쓰기가 유지되는지 확인. 블록 본문·닫는 중괄호는 그대로 둔다.)

- [ ] **Step 6: 전체 collect 테스트 통과 확인**

Run: `node --test skills/weekly-report/scripts/collect.test.js`
Expected: PASS (기존 4개 전부 — 정규화는 슬래시 경로에 무해).

- [ ] **Step 7: 커밋**

```bash
git add skills/weekly-report/scripts/lib/pathSanitize.js skills/weekly-report/scripts/lib/pathSanitize.test.js skills/weekly-report/scripts/collect.js
git commit -m "fix: normalize backslash scanRoots so Windows-style paths work on macOS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 주 라벨 정합성·경계 테스트 (B1)

**Files:**
- Test: `skills/weekly-report/scripts/lib/week.test.js`
- Test: `skills/weekly-log/scripts/append.test.js`

**Interfaces:**
- Consumes: `isoWeekLabel` (양쪽 모듈에서 각각 export됨).
- Produces: 없음 (동작 변경 없이 현행 라벨 로직을 고정하는 회귀 테스트).

경계 날짜별 기대 라벨(현행 구현으로 실측 확정됨):

| 날짜 | 요일 | 기대 라벨 |
|---|---|---|
| 2026-01-01 | Thu | 2026-W01 |
| 2026-07-02 | Thu | 2026-W27 |
| 2026-07-05 | Sun | 2026-W27 |
| 2026-07-06 | Mon | 2026-W28 |
| 2026-12-31 | Thu | 2026-W53 |
| 2027-01-01 | Fri | 2026-W53 |
| 2027-01-04 | Mon | 2027-W01 |

- [ ] **Step 1: `week.test.js`에 경계 스냅샷 테스트 추가**

`skills/weekly-report/scripts/lib/week.test.js` 끝에 추가:
```javascript
test('isoWeekLabel pins expected labels across year and week boundaries', () => {
  const cases = [
    [new Date(2026, 0, 1), '2026-W01'],
    [new Date(2026, 6, 2), '2026-W27'],
    [new Date(2026, 6, 5), '2026-W27'],
    [new Date(2026, 6, 6), '2026-W28'],
    [new Date(2026, 11, 31), '2026-W53'],
    [new Date(2027, 0, 1), '2026-W53'],
    [new Date(2027, 0, 4), '2027-W01'],
  ];
  for (const [date, expected] of cases) {
    assert.equal(isoWeekLabel(date), expected, `for ${date.toDateString()}`);
  }
});
```

- [ ] **Step 2: `append.test.js`에 동일 스냅샷 + 교차 대조 테스트 추가**

`skills/weekly-log/scripts/append.test.js` 7번째 줄 require 아래에 week 모듈 import를 추가:
```javascript
const { isoWeekLabel: weekIsoWeekLabel } = require('../../weekly-report/scripts/lib/week');
```

파일 끝에 추가:
```javascript
test('append isoWeekLabel pins expected labels across boundaries', () => {
  const cases = [
    [new Date(2026, 0, 1), '2026-W01'],
    [new Date(2026, 6, 2), '2026-W27'],
    [new Date(2026, 6, 5), '2026-W27'],
    [new Date(2026, 6, 6), '2026-W28'],
    [new Date(2026, 11, 31), '2026-W53'],
    [new Date(2027, 0, 1), '2026-W53'],
    [new Date(2027, 0, 4), '2027-W01'],
  ];
  for (const [date, expected] of cases) {
    assert.equal(isoWeekLabel(date), expected, `for ${date.toDateString()}`);
  }
});

test('append and week isoWeekLabel agree on every boundary date', () => {
  const dates = [
    new Date(2026, 0, 1),
    new Date(2026, 6, 2),
    new Date(2026, 6, 5),
    new Date(2026, 6, 6),
    new Date(2026, 11, 31),
    new Date(2027, 0, 1),
    new Date(2027, 0, 4),
  ];
  for (const date of dates) {
    assert.equal(isoWeekLabel(date), weekIsoWeekLabel(date), `divergence at ${date.toDateString()}`);
  }
});
```

- [ ] **Step 3: 테스트 통과 확인 (구현 변경 없음)**

Run: `node --test skills/weekly-report/scripts/lib/week.test.js skills/weekly-log/scripts/append.test.js`
Expected: PASS. 현행 라벨 로직을 고정하는 테스트이므로 코드 변경 없이 통과해야 한다. 만약 실패하면 기대값이 아니라 구현이 이미 어긋난 것이므로 멈추고 원인을 조사한다.

- [ ] **Step 4: 커밋**

```bash
git add skills/weekly-report/scripts/lib/week.test.js skills/weekly-log/scripts/append.test.js
git commit -m "test: pin ISO week labels and assert both skills agree

Guards against divergence of the duplicated isoWeekLabel logic that
determines log file names across weekly-log and weekly-report.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Windows + macOS CI 매트릭스 (C3)

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: Task 1의 `npm test` 스크립트.
- Produces: 없음.

- [ ] **Step 1: 워크플로 파일 생성**

`.github/workflows/test.yml`:
```yaml
name: test

on:
  push:
  pull_request:

jobs:
  test:
    name: node ${{ matrix.node }} on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

- [ ] **Step 2: 로컬에서 npm test로 스모크 확인**

CI 자체는 로컬에서 실행할 수 없으므로, 워크플로가 호출하는 명령이 로컬에서 성립하는지만 확인한다.

Run: `npm test`
Expected: `# pass 35` / `# fail 0` (Task 3~7에서 신규 8개 추가되어 27+8=35; 실행 시점 누계와 일치하는지 확인).

- [ ] **Step 3: YAML 파싱 유효성 확인**

Run:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/test.yml','utf8');if(!/runs-on:/.test(s)||!/npm test/.test(s))throw new Error('workflow missing keys');console.log('workflow ok')"
```
Expected: `workflow ok`.

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run npm test on windows, macos, and ubuntu

Runs the suite on macOS every push so cross-platform regressions are
caught without local macOS hardware.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: README 크로스 플랫폼 안내 (D1)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음.

- [ ] **Step 1: `scanRoots` 예시에 macOS 경로 추가**

`README.md`의 다음 줄:
```
    예) `["C:/project", "D:/work"]`
```
을 다음으로 변경:
```
    예) Windows `["C:/project", "D:/work"]`, macOS `["/Users/you/projects", "/Users/you/work"]`
```

- [ ] **Step 2: 크로스 플랫폼·요구사항 섹션 추가**

`README.md` 의 `## 설치` 제목 바로 앞에 다음 블록을 삽입:
```markdown
## 요구 사항

- Windows 또는 macOS의 Claude Code
- Node.js 18 이상 (스크립트 실행 및 `node --test` 러너)
- git (커밋 수집)

플러그인 스크립트는 Windows와 macOS에서 동일하게 동작한다. 개발 시 테스트는 저장소 루트에서:

```
npm test
```

```

- [ ] **Step 3: 렌더 확인 (구조 점검)**

Run:
```bash
grep -n "요구 사항\|npm test\|/Users/you/projects" README.md
```
Expected: 세 문자열이 각각 최소 1회 매치.

- [ ] **Step 4: 커밋**

```bash
git add README.md
git commit -m "docs: document cross-platform support and Node/test requirements

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 검증

- [ ] **전체 스위트 통과**

Run: `npm test`
Expected: `# tests 35` / `# pass 35` / `# fail 0` (기존 27 + 신규 8, 아래 정산 표 참조). 정확한 수치는 실행값으로 확인하되, 필수 통과 기준은 `fail 0`.

## 참고: 신규 테스트 개수 정산

| 파일 | 신규 개수 |
|---|---|
| manualLog.test.js | 1 |
| sessionScan.test.js | 1 |
| append.test.js | 3 (CRLF 1, 경계 1, 교차 1) |
| pathSanitize.test.js | 2 |
| week.test.js | 1 |
| **합계** | **8** (27 → 35) |
