# weekly-report-plugin

Claude Code용 주간 업무 보고서 플러그인. 여러 git 프로젝트에 걸친 한 주간의 작업(git 커밋,
Claude Code 세션에서 실제로 요청한 문구, 수동 기록)을 모아 프로젝트별로 정리된 보고서를 생성한다.

## 포함된 스킬

- **weekly-report** — `/weekly-report` : 이번 주(또는 지정한 주) 작업을 프로젝트별로 정리한
  마크다운 보고서를 생성하고 아카이브 폴더에 저장한다.
- **weekly-log** — 대화 중 "오늘 [프로젝트] ~했어", "이거 기록해줘" 같은 말을 하면 자동으로
  해당 주 로그 파일에 한 줄 기록을 남긴다. `weekly-report`가 이 로그를 함께 집계한다.

## 설치

```
/plugin marketplace add kimdonghuyn/weekly-report-plugin
/plugin install weekly-report@weekly-report-plugin
```

## 사용법

```
/weekly-report
```

특정 주를 지정하려면 그 주에 포함된 날짜를 인자로 전달한다:

```
/weekly-report --start=2026-06-29
```

## 동작 방식

- 설정 파일 `~/.claude/weekly-report/config.json`이 최초 실행 시 자동 생성된다. 스캔할 git
  저장소 루트 및 커밋 작성자 이메일(`authorEmail`)을 이 파일에서 설정한다.
- git 커밋은 설정된 `authorEmail`과 일치하는 본인 커밋만 수집한다.
- Claude Code 세션 기록에서 그 주에 사용자가 실제로 입력한 요청 문구를 함께 참고한다.
- `weekly-log` 스킬로 남긴 수동 기록도 함께 집계되며, 어떤 저장소와도 매칭되지 않는 기록은
  보고서 마지막에 "기타" 섹션으로 추가된다.
- 완성된 보고서는 채팅에 출력됨과 동시에 `<archivePath>/<weekLabel>.md` 파일로 저장된다.

## 라이선스

MIT
