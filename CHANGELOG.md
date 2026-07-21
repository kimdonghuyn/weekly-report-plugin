# Changelog

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
