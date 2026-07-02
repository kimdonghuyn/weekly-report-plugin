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

- 설정 파일 `~/.claude/weekly-report/config.json`이 최초 실행 시 자동 생성된다. 이 파일은
  설치한 사람마다 각자 자기 환경에 맞게 생성/관리되며, 플러그인 코드 자체에는 특정 사용자의
  경로나 이메일이 하드코딩되어 있지 않다.
  - `scanRoots`: 스캔할 git 프로젝트들의 상위 폴더 목록. 최초 실행 시 빈 배열로 생성되므로,
    처음 `/weekly-report`를 실행하면 Claude가 프로젝트 폴더 경로를 물어보고 이 값을 채운다.
    예) `["C:/project", "D:/work"]`
  - `authorEmail`: 커밋 작성자 필터. `git config --global user.email` 값으로 자동 채워진다.
  - `archivePath`: 보고서를 저장할 폴더. 기본값은 `~/Documents/WeeklyReports`.
- git 커밋은 설정된 `authorEmail`과 일치하는 본인 커밋만 수집한다.
- Claude Code 세션 기록에서 그 주에 사용자가 실제로 입력한 요청 문구를 함께 참고한다.
- `weekly-log` 스킬로 남긴 수동 기록도 함께 집계되며, 어떤 저장소와도 매칭되지 않는 기록은
  보고서 마지막에 "기타" 섹션으로 추가된다.
- 완성된 보고서는 채팅에 출력됨과 동시에 `<archivePath>/<weekLabel>.md` 파일로 저장된다.

## 라이선스

MIT
