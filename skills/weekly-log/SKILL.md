---
name: weekly-log
description: Use when the user reports something they just did or wants it logged for the week, e.g. "오늘 [프로젝트] ~했어", "이거 기록해줘". Appends a one-line entry to that week's log file for later use by the weekly-report skill.
---

# Weekly Log

사용자가 방금 한 작업을 짧게 기록해달라고 할 때 사용한다.

## 실행 절차

1. 사용자의 말에서 프로젝트명과 작업 내용을 파악한다. 프로젝트명이 명시되지 않았으면 어느
   프로젝트에 대한 기록인지 되묻는다.
2. 아래 명령을 실행한다:

   ```bash
   node "<스킬 폴더>/scripts/append.js" "<프로젝트명>" "<작업 내용 한 줄>"
   ```

   `<스킬 폴더>`는 이 SKILL.md 파일이 있는 디렉터리다. Claude Code 플러그인으로 설치된
   경우 `${CLAUDE_PLUGIN_ROOT}/skills/weekly-log` 가 그 경로이고, Codex CLI처럼 스킬
   폴더를 직접 복사해 설치한 환경에서는 이 파일을 읽어온 경로를 기준으로 실행한다.

3. 스크립트가 출력한 파일 경로를 확인만 하고, 사용자에게는 짧게 "기록했습니다" 정도로만
   확인해준다. 장황한 설명은 불필요하다.
