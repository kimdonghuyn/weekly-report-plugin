# Changelog

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
