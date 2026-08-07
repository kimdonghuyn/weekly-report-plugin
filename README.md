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

저장소를 먼저 클론한다:

```
git clone https://github.com/kimdonghuyn/weekly-report-plugin.git
cd weekly-report-plugin
```

**방법 A — 정식 플러그인으로 설치 (권장, 플러그인 지원 버전의 Codex 필요):**

```
node install-codex.js --plugin
codex plugin add weekly-report@personal
```

`--plugin` 은 저장소를 `~/plugins/weekly-report/`로 복사하고 개인 마켓플레이스
(`~/.agents/plugins/marketplace.json`)에 항목을 등록한다. 이 저장소에는 Codex 플러그인
매니페스트(`.codex-plugin/plugin.json`)가 포함되어 있어 `codex plugin add` 후 두 스킬이
플러그인으로 인식된다. 설치 후 새 스레드에서 사용한다.

**방법 B — 스킬만 복사 (플러그인 미지원 버전 포함, 스킬만 지원하면 동작):**

```
node install-codex.js
```

`skills/` 아래의 두 스킬이 `~/.codex/skills/`로 복사된다. 다른 위치(예: 에이전트 공용
스킬 디렉터리 `~/.agents/skills`)에 설치하려면 `--target=<디렉터리>` 를 사용한다.

설치 후 Codex에서 `/skills` 로 인식 여부를 확인할 수 있고, `$weekly-report` 멘션이나
"이번 주 뭐했는지 정리해줘" 같은 자연어로 호출한다. 스킬이 바로 보이지 않으면 Codex를
재시작한다. 두 방법을 동시에 쓰면 스킬이 중복 인식될 수 있으니 하나만 선택한다.

설정 파일(`~/.claude/weekly-report/config.json`)과 수동 로그는 Claude Code와 Codex가
같은 것을 공유하므로, 한쪽에서 기록하고 다른 쪽에서 보고서를 뽑아도 결과가 같다.

## 업데이트

Claude Code에서 새 버전이 나왔을 때 받는 방법:

```
/plugin marketplace update weekly-report-plugin
```

`/plugin` 명령으로 Marketplaces 탭에 들어가면 "Enable auto-update" 토글로 자동 업데이트를
켤 수도 있다 (서드파티 마켓플레이스는 기본값이 꺼짐).

Codex 설치는 클론한 저장소에서 `git pull` 후 설치 명령을 다시 실행하면 된다
(방법 A는 `node install-codex.js --plugin` 후 `codex plugin add weekly-report@personal`,
방법 B는 `node install-codex.js` — 기존 폴더를 지우고 새로 복사한다).

## 사용법

```
/weekly-report
```

특정 주를 지정하려면 그 주에 포함된 날짜를 인자로 전달한다:

```
/weekly-report --start=2026-06-29
```

## Figma 연동 설정 가이드

Figma 작업(디자인)도 보고서에 넣고 싶을 때 설정한다. 필요 없으면 이 섹션은 건너뛰어도
된다 — 설정하지 않으면 Figma 소스는 조용히 무시된다.

> 💡 **가장 쉬운 방법**: 아래를 직접 하지 않아도, Claude/Codex에게
> **"주간보고에 Figma도 포함되게 설정해줘"** 라고 말하면 대화로 안내받으며 설정할 수 있다.

### 1) 토큰 발급 (1회, 약 1분)

1. [figma.com](https://figma.com) 로그인 → 좌측 상단 프로필 클릭 → **Settings**
2. **Security** 탭 → **Personal access tokens** → **Generate new token**
3. 이름은 자유(예: `weekly-report`), 권한은 **File content: Read-only** 면 충분
4. 생성 직후 한 번만 표시되는 `figd_...` 문자열을 복사

⚠️ 토큰은 비밀번호처럼 다룬다. git에 커밋하거나 채팅에 붙여넣지 말 것.

### 2) Team ID 찾기

Figma 좌측 사이드바에서 팀 이름을 클릭하면 주소창이 이런 형태가 된다:

```
https://www.figma.com/files/team/1234567890123456789/우리팀
                              └────────┬────────┘
                                  이 숫자가 team id
```

### 3) config.json 채우기 — 상황별 예시

설정 파일 위치: Windows `C:\Users\<이름>\.claude\weekly-report\config.json`,
macOS `~/.claude/weekly-report/config.json`

**예시 A — 개발 + 디자인을 둘 다 하는 사람** (git 커밋과 본인 Figma 작업을 함께):

```json
{
  "scanRoots": ["C:/Users/kim/projects"],
  "authorEmail": "kim@example.com",
  "weekStartsOn": "monday",
  "archivePath": "C:/Users/kim/Documents/WeeklyReports",
  "figma": {
    "token": "figd_abc123...",
    "teamIds": ["1234567890123456789"],
    "userHandles": ["김철수"]
  }
}
```

**예시 B — 디자이너 (git을 아예 안 쓰는 환경)**: `scanRoots`를 비워두면 Figma와
수동 기록만으로 보고서가 만들어진다:

```json
{
  "scanRoots": [],
  "authorEmail": "",
  "weekStartsOn": "monday",
  "archivePath": "C:/Users/lee/Documents/WeeklyReports",
  "figma": {
    "token": "figd_def456...",
    "teamIds": ["1234567890123456789"],
    "userHandles": ["이영희"]
  }
}
```

**예시 C — 팀장이 팀 전체 디자인 활동을 한 번에 보기**: `userHandles`를 빈 배열로
두면 그 팀 파일에서 작업한 **모든 사람**이 잡힌다. 토큰은 팀장 것 하나면 되고,
팀원들은 아무것도 설치·발급할 필요가 없다:

```json
{
  "figma": {
    "token": "figd_ghi789...",
    "teamIds": ["1234567890123456789", "9876543210987654321"],
    "userHandles": []
  }
}
```

- **Drafts(내 초안) 파일 주의**: 팀 프로젝트에 있는 파일만 자동으로 스캔된다. Drafts에서
  작업하는 파일은 Figma API의 팀 목록에 잡히지 않으므로, 파일 URL
  (`figma.com/design/<파일키>/...`)의 `<파일키>`를 `fileKeys`에 직접 추가한다:

  ```json
  "figma": {
    "token": "figd_...",
    "teamIds": ["1234567890123456789"],
    "fileKeys": [{ "key": "AbCdEf123456", "name": "온보딩 시안" }],
    "userHandles": []
  }
  ```

  또는 파일을 Drafts에서 팀 프로젝트로 옮기면 자동 스캔에 포함된다.
- `userHandles`에는 Figma에서 보이는 **표시 이름(handle)** 을 넣는다 (이메일 아님).
- 토큰을 파일에 두기 싫으면 `token`을 `""`로 두고 환경변수를 쓴다:
  Windows `setx FIGMA_TOKEN "figd_..."` (설정 후 터미널 재시작),
  macOS `export FIGMA_TOKEN="figd_..."` 를 셸 프로필에 추가.

### 4) 실행하면 이렇게 나온다

```
/weekly-report
```

```markdown
# 2026-W32 주간 보고

## shopping-app (git)
- 결제 모듈 리팩터링
  - PG사 응답 오류 처리 보강
  ...

## 디자인 (Figma)

### 앱 디자인 / 로그인 화면.fig
- 로그인 개편 시안 2차 (8/5, 김철수)
- 소셜 로그인 버튼 배치 수정 (8/6, 김철수)

### 앱 디자인 / 온보딩 플로우.fig
- 이영희: 화~목 3일에 걸쳐 작업 (버전 12회 저장)
```

버전에 이름이 붙어 있으면(위 "로그인 개편 시안 2차") 커밋 메시지처럼 그대로 활용되고,
이름 없는 자동 저장만 있으면 작업 빈도로 요약된다.

### 팁

- **버전에 이름을 붙이는 습관**: Figma에서 작업을 마무리할 때 `Ctrl+Alt+S`
  (macOS `Cmd+Opt+S`)로 버전 이름을 남기면 보고서 품질이 크게 올라간다.
  예) "메인 배너 A/B 시안", "아이콘 세트 정리 완료"
- **무료(Starter) 플랜도 OK**: 버전 히스토리 조회가 30일로 제한되지만 주간 보고서는
  최근 7일만 보므로 문제없다.
- **접근 범위**: 토큰은 그 계정이 볼 수 있는 파일만 조회한다. 팀 전체 집계(예시 C)를
  하려면 실행자가 해당 팀 파일들에 접근 가능해야 한다.

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
- **Figma 연동(옵션)**: `config.json`의 `figma` 섹션에 개인 액세스 토큰(또는 `FIGMA_TOKEN`
  환경변수)과 `teamIds`를 채우면, 그 주에 작업된 Figma 파일의 버전 히스토리를 스캔해
  "디자인 (Figma)" 섹션으로 보고서에 포함한다. 버전마다 작성자가 붙어 나오므로 실행자
  토큰 하나로 팀 전체의 디자인 활동을 사람별로 구분해 집계할 수 있다 (`userHandles`를
  지정하면 특정 사람만 필터). 설정하지 않으면 이 소스는 조용히 건너뛴다 — git이 없는
  디자이너 환경에서는 Figma + 수동 기록만으로도 보고서가 만들어진다.
- 완성된 보고서는 채팅에 출력됨과 동시에 `<archivePath>/<weekLabel>.md` 파일로 저장된다.

## 변경 이력

전체 내역은 [CHANGELOG.md](./CHANGELOG.md) 참고.

### 1.5.0 — 2026-08-07
- **Drafts 파일 지원**: 팀 API에 잡히지 않는 Drafts 파일을 `figma.fileKeys`로 직접 지정해
  스캔 가능. 실계정 end-to-end 검증 완료.

### 1.4.0 — 2026-08-07
- **Figma 연동(옵션)**: `config.json`의 `figma` 섹션을 채우면 Figma 파일 버전 히스토리를
  스캔해 "디자인 (Figma)" 섹션으로 보고서에 포함. 실행자 토큰 하나로 팀 전체를 사람별
  구분 집계. 모든 데이터 소스가 옵션이 되어 git 없는 디자이너 환경에서도 사용 가능.

### 1.3.0 — 2026-08-07
- **Codex CLI 지원**: Codex 플러그인 매니페스트(`.codex-plugin/plugin.json`) 추가,
  `install-codex.js` 설치 스크립트 추가 (`--plugin` 으로 정식 플러그인 설치, 기본 모드는
  `~/.codex/skills/`로 스킬 복사, `--target=` 으로 위치 지정 가능). SKILL.md의 스크립트
  참조를 Claude/Codex 양쪽에서 동작하는 상대 경로 서술로 변경. 설정과 수동 로그는 두
  에이전트가 공유.

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
