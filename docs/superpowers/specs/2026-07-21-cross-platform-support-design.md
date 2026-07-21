# weekly-report-plugin 크로스 플랫폼 지원 설계

- 날짜: 2026-07-21
- 상태: 승인 대기
- 대상 하니스: Claude Code (Windows + macOS)
- 동기: 예방적. 현재 Windows에서만 사용 중이나, 이후 macOS에 설치해도 동일하게 동작하도록 보장한다.

## 배경 / 현재 진단

조사 결과 이 플러그인은 이미 상당 부분 이식성이 있다. 아래는 Windows 환경(Node v24.16.0,
git 2.45.1)에서 실제 확인한 사실이다.

| 항목 | 상태 | 근거 |
|---|---|---|
| Node 스크립트 (`path.join`, `os.homedir`) | 이식성 있음 | 테스트 8개 파일 전부 통과 |
| `.claude/projects` 폴더명 sanitize | 양 OS 일치 | Windows `C--..`, macOS `-..` — Claude Code 실제 명명과 동일 |
| `execFileSync('git', …)` | Windows 동작 | `git.exe` 자동 해석, gitScan 테스트 통과 |
| SKILL.md 스크립트 호출 | 동작하나 비표준 | `${CLAUDE_SKILL_DIR}` 의존 (전체 플러그인 캐시에서 이 플러그인만 사용) |
| 주(week) 경계·라벨 타임존 처리 | 내부 정합적 | `getWeekStart`(local) + `isoWeekLabel`(달력일만 UTC 재구성)로 일관 |

따라서 "macOS에서 안 도는" 치명적 버그는 없다. 본 작업의 목표는 **① 취약 지점 견고화**와
**② macOS 하드웨어 없이도 이식성 회귀를 자동 검출하는 예방 장치** 구축이다.

## 목표 / 비목표

**목표**
- SKILL.md의 스크립트 참조를 검증된 표준 변수(`CLAUDE_PLUGIN_ROOT`)로 통일한다.
- 줄바꿈(CRLF/LF)·경로 구분자 차이에 대해 파싱을 방어적으로 만든다.
- 두 스킬이 같은 주에 대해 동일한 로그 파일명을 쓰도록 회귀 테스트로 고정한다.
- Windows/macOS 매트릭스 CI로 매 푸시마다 이식성을 자동 검증한다.
- 문서에 크로스 플랫폼 지원·Node 요구사항·테스트 방법을 명시한다.

**비목표 (YAGNI)**
- bash가 없는 순수 CMD 전용 하니스 지원 (폴리글롯 `.cmd` 래퍼 등) — 대상 하니스가 아니다.
- 스크립트 핵심 로직 재작성 — 이미 이식성이 확인됐다.
- `isoWeekLabel` 물리적 코드 통합 — 스킬 간 디렉터리 결합을 피한다(테스트로 정합성만 보장).

## 변경 항목

### A. 이식성 견고화 (동작 코드)

**A1. SKILL.md 변수 표준화**
- 대상: `skills/weekly-report/SKILL.md`, `skills/weekly-log/SKILL.md`
- 변경:
  - `node "${CLAUDE_SKILL_DIR}/scripts/collect.js"`
    → `node "${CLAUDE_PLUGIN_ROOT}/skills/weekly-report/scripts/collect.js"`
  - `node "${CLAUDE_SKILL_DIR}/scripts/append.js" ...`
    → `node "${CLAUDE_PLUGIN_ROOT}/skills/weekly-log/scripts/append.js" ...`
- 이유: `CLAUDE_PLUGIN_ROOT`는 공식 플러그인 260곳에서 쓰이는 검증된 변수. 따옴표로 감싼
  POSIX 확장 `"$VAR"` + 슬래시 경로는 Claude Code의 셸 컨텍스트에서 Windows/macOS 모두 동작한다.
- 동작은 동일, 신뢰도만 상승.

**A2. CRLF 방어 파싱**
- 대상 파일과 변경:
  - `skills/weekly-report/scripts/lib/manualLog.js`: `readFileSync(...).split('\n')`
    → `.split(/\r?\n/)`
  - `skills/weekly-report/scripts/lib/sessionScan.js`: `.split('\n').filter(Boolean)`
    → `.split(/\r?\n/).filter(Boolean)`
  - `skills/weekly-log/scripts/append.js`: 기존 파일을 읽어 이어쓸 때 `heading` 포함 검사와
    누적 텍스트가 CRLF 파일에서도 안전하도록, 읽은 텍스트를 `\n` 기준으로 다룬다. 쓰기는
    현행대로 항상 `\n`으로 통일한다(파일 내 혼합 방지).
- 이유: macOS(LF)에서 만든 로그를 Windows에서 읽거나 그 반대일 때, `trim()`에 암묵 의존하지 않고
  명시적으로 처리한다.
- 유지: 파일 쓰기는 항상 LF(`\n`)로 고정하여 새로 생성/추가되는 내용이 OS와 무관하게 동일하게 만든다.

**A3. scanRoots 경로 정규화**
- 대상: `skills/weekly-report/scripts/collect.js`의 `run()` 내부, `config.scanRoots`를 순회하며
  `findGitRepos(root)`에 넘기기 직전 지점 **한 곳**.
- 변경: 각 `root` 문자열의 역슬래시를 슬래시로 정규화한 뒤 사용한다(`root.replace(/\\/g, '/')`).
  Node의 fs/path는 Windows에서 슬래시를 허용하므로 양 OS에서 안전. `gitScan.js`는 손대지 않는다
  (정규화는 collect의 단일 choke point에서만).
- 이유: Windows 사용자가 `config.json`에 `C:\project`처럼 역슬래시 경로를 붙여넣어도(JSON 이스케이프
  이슈 포함) 동작하도록 한다.

### B. 결정성 / 정합성

**B1. 주 라벨 회귀 테스트**
- 배경: `isoWeekLabel(date)`가 `skills/weekly-report/scripts/lib/week.js`와
  `skills/weekly-log/scripts/append.js` 양쪽에 중복 구현돼 있다. 이 함수는 로그 파일명
  (`<YYYY-Www>.md`)을 결정하므로, 두 구현이 어긋나면 `weekly-log`가 기록한 파일을
  `weekly-report`가 다른 이름으로 찾아 못 읽는다.
- 조치: 물리적 통합 대신, **알려진 날짜 집합에 대해 기대 라벨을 고정**하는 테스트를 양쪽에 둔다.
  - 경계 케이스 포함: 연초(ISO week 1 경계, 예 2026-01-01 목요일 규칙), 연말(W52/W53),
    일요일↔월요일 경계, 월 경계.
  - 두 파일이 같은 입력에 같은 출력을 내는지 명시적으로 대조(assert)한다.
- 이유: divergence를 사람 리뷰가 아니라 테스트로 즉시 잡는다.

### C. "범용 환경"용 툴링

**C1. 루트 `package.json`**
- 위치: 저장소 루트.
- 내용:
  - `"private": true`
  - `"engines": { "node": ">=18" }` — 내장 `node:test` 러너 요구사항 명시.
  - `"scripts": { "test": "node --test skills/**/*.test.js" }`
    - glob이 셸에 의존하지 않도록, 필요 시 `node --test`가 디렉터리를 재귀 탐색하는 방식
      (`node --test skills/`)이나 명시적 파일 목록으로 대체 가능. 최종 형태는 구현 시
      Windows/macOS 양쪽에서 실제 동작을 확인해 확정한다.
- 이유: CI와 사용자 모두에게 정식 테스트 실행 경로를 제공하고 Node 기준선을 문서화한다.

**C2. `.gitattributes`**
- 위치: 저장소 루트.
- 내용: `*.js`, `*.md`, `*.json` 등 텍스트 파일을 `text eol=lf`로 강제.
- 이유: `core.autocrlf=true`인 Windows 클론에서도 저장소 파일이 LF로 유지되어 OS 간 동일 상태 보장.

**C3. GitHub Actions CI**
- 위치: `.github/workflows/test.yml`.
- 내용: `push`/`pull_request` 트리거, 매트릭스 `os: [windows-latest, macos-latest]`
  (선택적으로 `ubuntu-latest` 추가). 각 잡에서 `actions/setup-node`(Node 18+) 후 `npm test`.
- 이유: macOS 하드웨어 없이도 매 변경마다 macOS에서 테스트가 실행되어 실제 이식성 회귀를 검출한다.

### D. 문서

**D1. README 보강**
- 대상: `README.md`.
- 변경:
  - `scanRoots` 예시에 macOS 경로 추가: `["/Users/you/projects", "/Users/you/work"]`.
  - 크로스 플랫폼(Windows/macOS) 지원 명시.
  - Node 요구사항(>=18)과 `npm test` 실행법 안내.
- SKILL.md 변경(A1)에 맞춰 문서 내 설명이 어긋나지 않는지 함께 점검.

## 테스트 전략

- 기존 8개 테스트 파일은 계속 통과해야 한다(회귀 없음).
- 신규/보강 테스트:
  - `manualLog`: CRLF 입력 파싱이 LF와 동일 결과를 내는지.
  - `sessionScan`: CRLF가 섞인 `.jsonl`에서도 레코드가 정상 파싱되는지.
  - `gitScan`(또는 경로 정규화 지점): 역슬래시 root가 슬래시 root와 동일하게 처리되는지.
  - `week`/`append`: 고정 날짜 집합에 대한 라벨 스냅샷 + 두 구현 간 일치 대조.
- 전 테스트를 Windows(로컬)와 macOS(CI)에서 통과시키는 것이 완료 기준.

## 완료 기준 (Definition of Done)

1. 두 SKILL.md가 `CLAUDE_PLUGIN_ROOT` 기반 경로를 사용한다.
2. CRLF/역슬래시 방어 코드와 그에 대한 테스트가 추가되고 전 테스트가 통과한다.
3. 주 라벨 정합성 테스트가 두 스킬에 존재한다.
4. `package.json`·`.gitattributes`·CI 워크플로가 추가되고, CI가 Windows+macOS에서 green이다.
5. README가 크로스 플랫폼 지원과 실행법을 반영한다.

## 리스크 / 유의점

- `node --test`의 glob 확장은 셸에 따라 다르므로, `package.json`의 test 스크립트 형태는 구현 시
  양 OS에서 실동작으로 확정한다(디렉터리 재귀 또는 명시 목록).
- `.gitattributes` 도입 시 기존 워킹 트리와 EOL 차이가 날 수 있으므로, 적용 후 정규화된 상태로
  한 번 커밋한다.
