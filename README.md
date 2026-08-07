# weekly-report-plugin

Claude Code·Codex CLI용 주간 업무 보고서 플러그인. 여러 git 프로젝트에 걸친 한 주간의 작업(git 커밋,
Claude Code/Codex CLI/Gemini CLI 세션에서 실제로 요청한 문구, 수동 기록)을 모아 프로젝트별로 정리된 보고서를 생성한다.

## 포함된 스킬

- **weekly-report** — `/weekly-report` : 이번 주(또는 지정한 주) 작업을 프로젝트별로 정리한
  마크다운 보고서를 생성하고 아카이브 폴더에 저장한다.
- **weekly-log** — 대화 중 "오늘 [프로젝트] ~했어", "이거 기록해줘" 같은 말을 하면 자동으로
  해당 주 로그 파일에 한 줄 기록을 남긴다. `weekly-report`가 이 로그를 함께 집계한다.

## 요구 사항

- Windows 또는 macOS의 Claude Code 또는 Codex CLI (스킬 지원 버전)
- Node.js 18 이상 (스크립트 실행 및 `node --test` 러너)
- git (커밋 수집)

플러그인 스크립트는 Windows와 macOS에서 동일하게 동작한다. 개발 시 테스트는 저장소 루트에서 실행한다:

```
npm test
```

## 설치

### Claude Code

```
/plugin marketplace add kimdonghuyn/weekly-report-plugin
/plugin install weekly-report@weekly-report-plugin
```

### Codex CLI

Codex에는 마켓플레이스 개념이 없으므로 스킬 폴더를 직접 복사해 설치한다. 저장소를
클론한 뒤 설치 스크립트를 실행하면 `skills/` 아래의 두 스킬이 `~/.codex/skills/`로
복사된다:

```
git clone https://github.com/kimdonghuyn/weekly-report-plugin.git
cd weekly-report-plugin
node install-codex.js
```

다른 위치(예: 에이전트 공용 스킬 디렉터리 `~/.agents/skills`)에 설치하려면:

```
node install-codex.js --target=<디렉터리>
```

설치 후 Codex에서 `/skills` 로 인식 여부를 확인할 수 있고, `$weekly-report` 멘션이나
"이번 주 뭐했는지 정리해줘" 같은 자연어로 호출한다. 스킬이 바로 보이지 않으면 Codex를
재시작한다.

설정 파일(`~/.claude/weekly-report/config.json`)과 수동 로그는 Claude Code와 Codex가
같은 것을 공유하므로, 한쪽에서 기록하고 다른 쪽에서 보고서를 뽑아도 결과가 같다.

## 업데이트

Claude Code에서 새 버전이 나왔을 때 받는 방법:

```
/plugin marketplace update weekly-report-plugin
```

`/plugin` 명령으로 Marketplaces 탭에 들어가면 "Enable auto-update" 토글로 자동 업데이트를
켤 수도 있다 (서드파티 마켓플레이스는 기본값이 꺼짐).

Codex 설치는 클론한 저장소에서 `git pull` 후 `node install-codex.js` 를 다시 실행하면
된다 (기존 스킬 폴더를 지우고 새로 복사한다).

## 사용법

```
/weekly-report
```

특정 주를 지정하려면 그 주에 포함된 날짜를 인자로 전달한다:

```
/weekly-report --start=2026-06-29
```

## 동작 방식

- 설정 파일 `~/.claude/weekly-report/config.json`이 최초 실행 시 자동 생성된다. 이 파일은
  설치한 사람마다 각자 자기 환경에 맞게 생성/관리되며, 플러그인 코드 자체에는 특정 사용자의
  경로나 이메일이 하드코딩되어 있지 않다.
  - `scanRoots`: 스캔할 git 프로젝트들의 상위 폴더 목록. 최초 실행 시 빈 배열로 생성되므로,
    처음 `/weekly-report`를 실행하면 Claude가 프로젝트 폴더 경로를 물어보고 이 값을 채운다.
    예) Windows `["C:/project", "D:/work"]`, macOS `["/Users/you/projects", "/Users/you/work"]`
  - `authorEmail`: 커밋 작성자 필터. `git config --global user.email` 값으로 자동 채워진다.
  - `archivePath`: 보고서를 저장할 폴더. 기본값은 `~/Documents/WeeklyReports`.
- git 커밋은 설정된 `authorEmail`과 일치하는 본인 커밋만 수집한다.
- Claude Code(`~/.claude/projects`), Codex CLI(`~/.codex/sessions`), Gemini CLI(`~/.gemini/tmp`)
  세션 기록에서 그 주에 사용자가 실제로 입력한 요청 문구를 함께 참고한다. Codex 쪽은 세션의
  `cwd`로 프로젝트를 매칭하며, 다른 도구에서 가져온("임포트된") 세션은 집계에서 제외한다.
  Gemini 쪽은 프로젝트별 디렉터리의 `.project_root`·세션 메타의 `directories`·`projects.json`으로
  프로젝트를 매칭하고, 연속 로그인 `chats/`를 우선 쓰되 없으면 `logs.json`으로 폴백한다.
- `weekly-log` 스킬로 남긴 수동 기록도 함께 집계되며, 어떤 저장소와도 매칭되지 않는 기록은
  보고서 마지막에 "기타" 섹션으로 추가된다.
- 완성된 보고서는 채팅에 출력됨과 동시에 `<archivePath>/<weekLabel>.md` 파일로 저장된다.

## 변경 이력

전체 내역은 [CHANGELOG.md](./CHANGELOG.md) 참고.

### 1.3.0 — 2026-08-07
- **Codex CLI 지원**: `install-codex.js` 설치 스크립트 추가 (`~/.codex/skills/`로 스킬 복사,
  `--target=` 으로 위치 지정 가능). SKILL.md의 스크립트 참조를 Claude/Codex 양쪽에서
  동작하는 상대 경로 서술로 변경. 설정과 수동 로그는 두 에이전트가 공유.

### 1.2.0 — 2026-07-24
- **Gemini CLI 세션 지원**: `~/.gemini/tmp/<id>/`의 대화 기록을 스캔해 Claude Code·Codex
  세션과 함께 `sessionMessages`에 합치고 각 항목에 `source: "gemini"`를 부여.
- 프로젝트 매칭은 `.project_root` → 세션 메타 `directories` → `projects.json` 순으로 판별하여
  SHA-256 해시/슬러그 디렉터리 명명 방식을 모두 지원. `chats/*.jsonl`(레거시 `*.json`) 우선,
  없으면 `logs.json` 폴백. `kind: "subagent"` 세션 제외.

### 1.1.1 — 2026-07-21
- **크로스 플랫폼 지원**: Windows/macOS의 Claude Code에서 동일하게 동작하도록 견고화.
- SKILL.md 스크립트 참조를 표준 변수 `${CLAUDE_PLUGIN_ROOT}` 로 통일(비표준 `${CLAUDE_SKILL_DIR}` 제거).
- 로그·세션 파싱을 CRLF/LF 양쪽에 안전하게 처리, 이어쓰기 시 CRLF→LF 정규화.
- `scanRoots` 역슬래시 경로(`C:\project`)를 정규화하여 macOS에서도 안전 처리.
- 주 라벨(`isoWeekLabel`)이 두 스킬에서 항상 일치하도록 경계값 회귀 테스트 추가.
- `package.json`(Node 18+, `npm test`), `.gitattributes`(LF 강제), Windows/macOS/Ubuntu CI 추가.

### 1.1.0 — 2026-07-10
- Codex CLI 세션 로그(`~/.codex/sessions/**/rollout-*.jsonl`)를 스캔해 Claude Code 세션과 함께
  `sessionMessages`에 합쳐 넣도록 확장. 각 항목에 `source`(`"claude"`/`"codex"`) 필드 추가.
- 다른 도구에서 임포트된 Codex 세션은 집계에서 제외.

### 1.0.2
- `scanRoots`가 비어 있을 때 `needsSetup` 신호를 결과에 노출.

### 1.0.1
- `config.js`에서 특정 사용자용 하드코딩된 기본값 제거.

### 1.0.0
- `weekly-report`, `weekly-log` 스킬을 Claude Code 플러그인으로 패키징.

## 라이선스

[MIT](./LICENSE)
