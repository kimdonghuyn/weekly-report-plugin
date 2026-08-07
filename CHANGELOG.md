# Changelog

## 1.3.0 — 2026-08-07

- **Codex CLI 지원**: 두 스킬을 Codex CLI에서도 그대로 쓸 수 있도록 이식성 개선.
  - Codex 플러그인 매니페스트 `.codex-plugin/plugin.json` 추가 (Codex 공식
    `validate_plugin.py` 검증 통과). `node install-codex.js --plugin` 으로
    `~/plugins/weekly-report/` 복사 + 개인 마켓플레이스(`~/.agents/plugins/marketplace.json`)
    등록까지 수행하며, 이후 `codex plugin add weekly-report@personal` 로 설치한다.
  - `install-codex.js` 설치 스크립트 추가 — 기본 모드는 `skills/` 아래의 스킬 폴더를
    `~/.codex/skills/`(또는 `--target=` 로 지정한 디렉터리, 예: `~/.agents/skills`)로
    복사한다. 재실행 시 기존 폴더를 지우고 새로 복사하므로 업데이트에도 그대로 사용.
  - SKILL.md의 스크립트 참조를 Claude 전용 변수 의존에서 "이 SKILL.md가 있는 폴더 기준
    상대 경로" 서술로 변경 — Claude Code(`${CLAUDE_PLUGIN_ROOT}`)와 Codex 양쪽에서 동작.
  - 설정(`~/.claude/weekly-report/config.json`)과 수동 로그는 두 에이전트가 공유한다.

## 1.2.0 — 2026-07-24

- Gemini CLI 세션 기록(`~/.gemini/tmp/<id>/`)을 스캔해서, Claude Code·Codex CLI 세션
  문구와 함께 `sessionMessages`에 합쳐 넣도록 확장. 각 항목에 `source: "gemini"`가 추가됨.
- 프로젝트별 디렉터리(`<id>`)의 cwd를 `.project_root` 마커 → 세션 파일 메타의
  `directories` → `~/.gemini/projects.json` 순으로 판별하여, SHA-256 해시(구버전)와
  슬러그(신버전) 디렉터리 명명 방식을 모두 지원.
- 대화 기록은 연속 로그인 `chats/*.jsonl`(레거시 통짜 `chats/*.json` 포함)을 우선
  사용하고, `chats/`가 없는 설치에서는 `logs.json`으로 폴백. 둘 다 있을 때는 중복
  집계를 피하기 위해 `chats/`만 채택. `kind: "subagent"` 세션은 제외.

## 1.1.1 — 2026-07-21

- **크로스 플랫폼 지원**: Windows와 macOS의 Claude Code에서 동일하게 동작하도록 견고화.
- SKILL.md의 스크립트 참조를 표준 변수 `${CLAUDE_PLUGIN_ROOT}` 기반 경로로 통일
  (기존 비표준 `${CLAUDE_SKILL_DIR}` 제거).
- 로그·세션 파싱을 CRLF/LF 양쪽에 안전하게 처리. `weekly-log` 파일에 이어쓸 때
  기존 CRLF 파일을 LF로 정규화하여 줄바꿈 혼용을 방지.
- `scanRoots`의 역슬래시 경로(`C:\project`)를 정규화하여 macOS에서도 안전하게 처리.
- 중복 구현된 주 라벨(`isoWeekLabel`) 로직이 `weekly-log`와 `weekly-report`에서 항상
  일치하도록 경계값 회귀 테스트 추가.
- `package.json`(Node 18+ 명시, `npm test`), `.gitattributes`(LF 강제),
  Windows/macOS/Ubuntu × Node 18·20 GitHub Actions CI 추가.

## 1.1.0 — 2026-07-10

- Codex CLI 세션 로그(`~/.codex/sessions/**/rollout-*.jsonl`)를 스캔해서, Claude Code
  세션 문구와 함께 `sessionMessages`에 합쳐 넣도록 확장. 각 항목에 `source`
  (`"claude"` 또는 `"codex"`) 필드가 추가됨.
- Codex의 `~/.codex/external_agent_session_imports.json`에 등록된, 다른 도구에서
  가져온("임포트된") 세션은 집계에서 제외. 레지스트리에 누락된 경우를 대비해
  `<EXTERNAL SESSION IMPORTED>` 마커가 있는 세션도 함께 걸러낸다.

## 1.0.2

- `scanRoots`가 비어 있을 때 `needsSetup` 신호를 결과에 노출.

## 1.0.1

- `config.js`에서 특정 사용자용 하드코딩된 기본값 제거.

## 1.0.0

- `weekly-report`, `weekly-log` 스킬을 Claude Code 플러그인으로 패키징.
