---
name: weekly-report
description: Use when the user asks for a weekly report, work summary, or an "이번 주 뭐했는지 정리해줘" style request spanning multiple projects. Aggregates git commits, Claude Code/Codex CLI/Gemini CLI session activity, and manual weekly-log entries into a per-project report.
---

# Weekly Report

주간 업무 보고서를 작성한다. 여러 git 프로젝트에 걸친 한 주간의 작업을 모아 프로젝트별로
정리된 보고서를 만든다.

## 실행 절차

1. 데이터 수집 스크립트를 실행한다:

   ```bash
   node "<스킬 폴더>/scripts/collect.js"
   ```

   `<스킬 폴더>`는 이 SKILL.md 파일이 있는 디렉터리다. Claude Code 플러그인으로 설치된
   경우 `${CLAUDE_PLUGIN_ROOT}/skills/weekly-report` 가 그 경로이고, Codex CLI처럼 스킬
   폴더를 직접 복사해 설치한 환경에서는 이 파일을 읽어온 경로를 기준으로 실행한다.

   특정 주를 지정하려면 그 주에 포함된 아무 날짜나 `--start=YYYY-MM-DD` 로 넘긴다.

2. 스크립트는 아래 구조의 JSON을 표준출력으로 반환한다:

   ```json
   {
     "weekLabel": "2026-W27",
     "since": "...", "until": "...",
     "archivePath": "<config.json의 archivePath 값>",
     "needsSetup": false,
     "projects": [
       { "repoPath": "...", "repoName": "...", "commits": [...], "sessionMessages": [...], "manualEntries": [...] }
     ],
     "unmatched": [...]
   }
   ```

   **`needsSetup`이 `true`이면 아직 스캔할 프로젝트 폴더가 설정되지 않은 것이다** (설치 후
   최초 실행이거나 `config.json`의 `scanRoots`가 비어 있는 상태). 이 경우 `projects`는 항상
   비어 있고 `weekly-log`로 기록해둔 내용도 전부 `unmatched`로만 잡힌다 — "이번 주 활동
   없음"이 아니라 "설정 안 됨"이므로, 보고서를 바로 쓰지 말고 먼저 사용자에게 git
   프로젝트들이 모여 있는 폴더 경로를 물어봐서(여러 개 가능) `~/.claude/weekly-report/config.json`의
   `scanRoots` 배열에 채운 뒤 1번부터 다시 실행한다. `authorEmail`은 `git config --global
   user.email` 값으로 자동 채워지므로 보통 그대로 둬도 되지만, 커밋에 쓰는 이메일이 다르면
   이 값도 같이 확인한다.

3. `projects` 배열의 각 프로젝트에 대해 `commits`(커밋 메시지), `sessionMessages`(그 주 동안
   사용자가 Claude에게 실제로 요청한 문구), `manualEntries`(수동 기록)를 모두 참고해서 다음
   스타일로 섹션을 작성한다:
   - 프로젝트명을 제목으로
   - 의미 단위로 묶은 카테고리를 불릿으로 (커밋 메시지를 그대로 나열하지 않는다)
   - 카테고리 아래 세부 작업은 하위 불릿으로

   활동이 전혀 없는 프로젝트는 이미 배열에서 빠져 있으므로 신경 쓸 필요 없다.

4. `unmatched` 배열(어떤 저장소와도 매칭되지 않은 수동 로그)이 있으면 맨 마지막에 "기타" 섹션으로
   추가한다. 프로젝트명 오타나 `scanRoots`에 없는 경로 때문에 매칭이 안 됐을 수 있으니, 항목이
   있으면 왜 매칭되지 않았는지 짐작되는 이유를 함께 언급해준다.

5. 완성된 보고서를 마크다운으로 채팅에 출력한다.

6. 동시에 같은 내용을 `<archivePath>/<weekLabel>.md` 파일로 저장한다 (디렉터리가 없으면 생성하고,
   파일이 이미 있으면 덮어쓴다 — 그 주의 최신 상태를 반영하는 것이 목적이므로 append 하지 않는다).

## 참고

- 커밋은 설정된 `authorEmail`과 일치하는 본인 커밋만 포함되어 있다.
- `sessionMessages`는 사용자가 그 주에 실제로 타이핑한 요청 문구다. 그대로 인용하지 말고 자연스러운
  보고서 문장으로 바꿔 쓴다.
- 설정 파일은 `~/.claude/weekly-report/config.json`이며 최초 실행 시 자동 생성된다. 스캔 루트를
  추가/변경하려면 이 파일을 직접 수정한다. `scanRoots`, `authorEmail`, `archivePath` 모두
  설치한 사람의 환경에 맞게 개별적으로 설정되는 값이며, 플러그인 자체에는 특정 사용자의
  경로나 이메일이 들어있지 않다.
