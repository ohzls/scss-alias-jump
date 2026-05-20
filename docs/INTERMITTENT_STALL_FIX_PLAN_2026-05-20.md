# SCSS Alias Jump 간헐 먹통 수정 계획

작성일: 2026-05-20
상태: 초안 — 이 슬라이스에서는 런타임 코드 변경 없음
범위: VS Code/Cursor 확장 응답성, 캐시 신선도, 활성화 안정성

## 1. 문제 정의

사용자가 “잘 되다가 갑자기 먹통됐다가 다시 되는” 현상을 보고했다. 현재 증거상 빌드 실패나 설치본 깨짐보다는, provider 런타임 경로의 응답성 문제와 stale state 문제가 더 유력하다.

확인한 근거:

- `npm run compile` 통과.
- `npm run vscode:prepublish` 통과.
- Cursor 설치본 `/Users/seongwonseo/.cursor/extensions/seongwonseo.scss-alias-jump-0.3.0`과 repo 빌드 산출물이 동일.
- Cursor extension-host 로그에서 `seongwonseo.scss-alias-jump`는 `activationEvent: 'onStartupFinished'`로 정상 활성화됨.
- hover/definition provider 경로에서 workspace 전체 스캔을 수행하는 hot path가 있음.
- VS Code 공식 API상 provider는 `CancellationToken`을 받고, `workspace.findFiles(include, exclude?, maxResults?, token?)`도 취소 토큰을 받을 수 있음.

현재 1순위 가설:

> hover/definition provider가 넓은 workspace 스캔을 거의 취소 불가능한 형태로 실행하면서 extension host를 순간적으로 바쁘게 만들고, 이 때문에 Cmd/Ctrl+Click이 간헐적으로 먹통처럼 보인다. 별도 2순위로 Sass path resolution의 `null` 결과 영구 캐시 때문에 transient miss가 reload 전까지 고착될 수 있다.

## 2. 제약과 정책

- alias resolution, VS Code activation, package surface는 contract-sensitive로 취급한다.
- 첫 수정 슬라이스에 광범위 리팩터를 섞지 않는다.
- 기억용 메모보다 재발 방지 guard를 우선한다.
- 기본 대표 검증은 `npm run compile`이다.
- activation/package 동작을 바꾸는 슬라이스는 `npm run vscode:prepublish`도 실행한다.
- 이 계획과 후속 구현 노트는 repo-local docs를 SSOT로 둔다.

## 3. Grok/레드팀 논의 메모

이 환경에는 외부 Grok/xAI를 직접 호출하는 도구가 없다. 따라서 이 섹션은 “Grok에게 반론을 시킨다”는 의도로, 가능한 대안과 반박을 정리한 레드팀 논의 기록이다. 실제 외부 Grok과 대화했다고 가정하지 않는다.

### 대안 A — workspace hover scan 기본값을 끈다

장점:

- 코드 변경 위험이 낮다.
- 체감 stall은 즉시 줄 가능성이 크다.

단점:

- README에 노출된 기본 기능(`hoverWorkspaceScan: true`)을 약화한다.
- definition provider의 scan 문제는 그대로 남는다.
- 근본 원인인 provider cancellation/backpressure를 고치지 않는다.

판단: 긴급 우회책으로만 유지한다. 1차 수정의 본류로 삼지 않는다.

### 대안 B — scan을 scoped/cancellable/bounded로 만든다

장점:

- extension-host saturation 가설을 직접 겨냥한다.
- VS Code provider cancellation 모델과 맞다.
- 기능을 유지하면서 응답성을 개선한다.

단점:

- 여러 검색 helper와 provider call site를 건드려야 한다.
- multi-root workspace fallback을 조심스럽게 보존해야 한다.

판단: 1순위 수정 방향.

### 대안 C — persistent workspace index를 만든다

장점:

- 장기적으로 성능이 가장 좋다.
- hover/definition을 거의 즉시 처리할 수 있다.

단점:

- 구조 변경이 크다.
- invalidation, watcher, 메모리 제한, 테스트가 추가로 필요하다.
- 이번 “간헐 먹통” finding fix로는 범위가 과하다.

판단: 보류. cancellable scan 안정화 후 별도 설계로 재검토한다.

### 대안 D — Sass resolution cache invalidation을 고친다

장점:

- “reload하면 다시 된다”류 문제를 직접 줄인다.
- 비교적 좁고 독립적인 수정이다.

단점:

- scan saturation 자체는 해결하지 않는다.

판단: 같은 안정화 작업 안에 넣되, 별도 좁은 슬라이스로 처리한다.

### 대안 E — language/command activation event를 추가한다

장점:

- startup 직후 provider가 아직 등록되지 않은 창을 줄인다.
- `onStartupFinished`는 유지하면서 language/command 기반 deterministic activation을 추가할 수 있다.

단점:

- package surface 변경이므로 prepublish/package metadata 검증이 필요하다.

판단: package-surface 슬라이스로 포함한다.

## 4. 권장 구현 계획

### Slice 1 — 동작 변경 없는 instrumentation/baseline

목표: 코드를 고치기 전에 실패를 falsifiable하게 만든다.

작업:

1. `scssAliasJump.debugLogging`이 켜진 경우에만 비싼 provider 경로의 timing log를 남긴다.
   - class usage scan start/end/cancel/count/duration
   - class definition workspace scan start/end/cancel/count/duration
   - extend reference scan start/end/cancel/count/duration
   - Sass path cache hit/miss/stale-clear
2. 평상시 로그 노이즈를 피하기 위해 기존 debug setting 뒤에 숨긴다.
3. 로그로 다음 질문에 답할 수 있어야 한다.
   - 어떤 provider가 실행됐는가?
   - 어떤 workspace folder를 스캔했는가?
   - 몇 개 파일을 고려했는가?
   - scan이 취소됐는가, timeout됐는가, 정상 완료됐는가?

검증:

- `npm run compile`
- 수동: `scssAliasJump.debugLogging` 활성화 후 `SCSS Alias Jump: Debug Click Test` 실행. provider path와 duration이 Output에 찍히는지 확인.

### Slice 2 — cancellable/scoped/bounded search helper

목표: 오래된 hover/definition 요청이 extension-host 작업을 계속 잡아먹지 못하게 한다.

작업:

1. 공통 scan options 타입을 도입한다.

   ```ts
   export type WorkspaceScanOptions = {
     token?: vscode.CancellationToken;
     scopeUri?: vscode.Uri;
     maxFiles?: number;
     maxResults?: number;
   };
   ```

2. 아래 함수들이 options를 받고 cancellation을 지키도록 바꾼다.
   - `findClassUsages`
   - `findClassUsagesByPrefix`
   - `findClassDefinitionInWorkspace`
   - `findExtendReferences`
   - `findPlaceholderDefinitions`도 필수 포함 (`@extend %...` Cmd/Ctrl-click hot path이므로 optional이 아님)
3. `vscode.workspace.findFiles(pattern, excludePattern, maxFiles, token)`처럼 **4번째 인자**로 cancellation token을 전달한다.
4. 다음 지점마다 `token.isCancellationRequested`를 확인한다.
   - `findFiles` 전
   - `findFiles` 직후
   - 각 file read 전
   - 각 file read 직후
   - line scan 중 N라인마다
   - 긴 scan chunk 사이에서 event loop yield 전후
5. `workspace.fs.readFile()` 자체는 token을 받지 않으므로, read 전에 `workspace.fs.stat()`으로 큰 파일을 건너뛰는 max file size guard를 둔다.
6. cancellation된 partial result는 complete cache로 저장하지 않는다.
7. 같은 query/scope scan이 반복 hover로 중복 실행되지 않도록 in-flight de-dupe와 작은 global concurrency/backpressure를 둔다.
8. `vscode.RelativePattern`으로 현재 workspace folder를 먼저 검색한다.
9. multi-root 동작은 bounded fallback으로 보존한다.
   - 현재 folder 먼저 검색
   - 결과가 없고 기능 contract상 cross-root가 필요하면 나머지 folder를 순서대로 검색
   - `maxResults` 도달 또는 cancellation 시 즉시 중단
10. scoped search 도입 후 cache key에는 query뿐 아니라 scan kind, primary workspace folder URI, fallback/all-workspace mode, effective exclude/config version을 포함한다.
11. hover의 `withTimeout(findClassUsages(...))` 패턴을 실제 timeout cancellation source로 교체하고 provider token과 연결한다.
12. hover markdown command 경로(`Show all usages/references`)도 `withProgress({ cancellable: true })`로 감싸고 같은 scan options를 전달한다.

예상 동작:

- 마우스/커서 이동으로 obsolete hover 작업이 취소된다.
- 반복 hover/click이 이전 full-workspace scan을 백그라운드에 남기지 않고, 동일 query/scope scan을 중복 실행하지 않는다.
- definition request는 stale exhaustive scan보다 응답성을 우선한다.

검증:

- `npm run compile`
- 대형 workspace 수동 확인:
  - SCSS class 위에서 hover를 반복
  - class selector/import에서 Cmd/Ctrl+Click 반복
  - debug log에서 cancellation, bounded completion, skipped-large-file, in-flight de-dupe 여부 확인
  - editor 응답성 유지 확인

### Slice 3 — search exclude 확장과 설정화

목표: project-specific layout을 깨지 않으면서 불필요한 scan volume을 줄인다.

작업:

1. 현재 `node_modules`, `dist`, `build` 외에 기본 generated/build exclude 후보를 늘린다.
   - `.next`
   - `.nuxt`
   - `.svelte-kit`
   - `coverage`
   - `dist-public`
   - `dist-public2`
   - `dist-internal`
2. `vendor`는 주의한다.
   - 어떤 repo에서는 generated지만, 어떤 repo에서는 source일 수 있다.
   - 기본 hard exclude보다 사용자 설정으로 빼는 쪽을 우선한다.
3. 필요 시 설정을 추가한다.

   ```json
   "scssAliasJump.scanExclude": ["**/.svelte-kit/**", "**/dist-public/**"]
   ```

4. 단, VS Code `workspace.findFiles`의 exclude는 단일 `GlobPattern`이므로 배열 설정은 helper에서 단일 brace glob으로 합치거나, arbitrary pattern은 URI post-filter로 처리한다.
5. custom exclude를 넘길 때 VS Code 기본 `files.exclude`/`search.exclude` 적용 여부를 명시적으로 결정하고 문서화한다.
6. 최종 exclude pattern은 기본 exclude + 사용자 exclude로 구성한다.
7. 설정을 추가하면 `README.md`와 `package.json` configuration도 갱신한다.

검증:

- `npm run compile`
- 수동: debug log에서 known large project의 scan 파일 수가 줄었는지 확인.
- README/package configuration 변경 시 `npm run vscode:prepublish`.

### Slice 4 — Sass resolution cache freshness

목표: 파일 생성, branch switch, alias 변경, workspace 변경 후 cached miss가 reload 전까지 고착되지 않게 한다.

작업:

1. `Map<string, Promise<string | null>>`를 다음 정보를 가진 entry로 바꾼다.
   - promise/result
   - timestamp
   - hit/miss 여부
2. miss에는 hit보다 짧은 TTL을 적용한다.
   - miss TTL 예: 1–3초
   - hit TTL은 더 길게 두되, watcher로 invalidation 가능하게 한다.
3. cache invalidation helper를 export한다.
   - `clearSassResolveCache()`
   - 필요 시 `deleteSassResolveCache(basePathNoExt)`
4. `activate`에서 invalidation을 등록한다.
   - `workspace.onDidChangeConfiguration` 중 `scssAliasJump.aliases`
   - `workspace.onDidChangeWorkspaceFolders`
   - `**/*.{scss,sass,css}` file watcher의 create/delete 중심 이벤트
   - content-only change는 path existence cache와 직접 관련이 없으므로 기본 global clear 대상에서 제외하거나 debounce/targeted clear만 허용
5. debug mode에서 stale miss expiration과 explicit cache clear를 로그로 남긴다.

예상 동작:

- 한 번 missing이었던 path가 나중에 생기면 Cursor reload 없이 resolve된다.
- alias/workspace 변경 후 stale path result가 남지 않는다.

검증:

- `npm run compile`
- 수동:
  - 일부러 missing partial을 만든 뒤 파일 생성
  - Extension Host reload 없이 jump 재시도
  - alias setting 변경 후 cache clear 로그 확인

### Slice 5 — activation reliability

목표: startup이 완전히 끝난 뒤가 아니라, 관련 파일/명령 사용 시 provider가 확실히 등록되게 한다.

작업:

1. `onStartupFinished`는 유지한다.
2. provider 대상 언어에 language activation event를 추가한다.
   - `onLanguage:scss`
   - `onLanguage:sass`
   - `onLanguage:css`
   - `onLanguage:vue`
   - `onLanguage:svelte`
   - `onLanguage:typescript`
   - `onLanguage:typescriptreact`
   - `onLanguage:javascript`
   - `onLanguage:javascriptreact`
3. contributed command에 command activation event를 추가할지는 Cursor 동작 증거가 있을 때만 결정한다. VS Code `^1.85.0`에서는 contributed command activation이 중복일 수 있으므로, 핵심은 language activation이다.
   - `onCommand:scss-alias-jump.debugScanImports`
   - `onCommand:scss-alias-jump.openImportUnderCursor`
   - `onCommand:scss-alias-jump.debugClickTest`
4. user-visible behavior나 workflow 설명이 바뀌면 README/CHANGELOG 정합성을 확인한다.

검증:

- `npm run compile`
- `npm run vscode:prepublish`
- 수동: Cursor 시작 직후 SCSS/Vue/TSX 파일을 열고 첫 click 전에 extension이 활성화되는지 확인.

### Slice 6 — recurrence guard

목표: 같은 종류의 “완료라고 했지만 실제로는 취소/캐시/활성화가 안 지켜짐”을 방지한다.

작업:

1. 작은 검증 스크립트 `scripts/verify-stability-contract.mjs`를 추가한다.
   - package activation events가 provider 언어와 command를 포함하는지 확인
   - provider-driven scan helper의 `workspace.findFiles` 호출이 cancellation token을 넘기는지 정적 확인
   - hover provider에 underlying scan을 취소하지 않는 timeout wrapper가 남아 있지 않은지 확인
   - Sass resolve cache invalidation export가 존재하는지 확인
2. npm script를 추가한다.

   ```json
   "verify:stability": "node ./scripts/verify-stability-contract.mjs"
   ```

3. 이 검증이 mandatory가 되면 completion checklist/runbook docs를 갱신한다.

검증:

- `npm run compile`
- `npm run verify:stability`
- package-surface 변경이 포함되면 `npm run vscode:prepublish`

## 5. 완료 기준

아래 기준이 충족되기 전에는 수정 완료로 보지 않는다.

- provider scan helper가 cancellation을 받고 실제로 준수한다.
- provider-triggered scan의 `workspace.findFiles` 호출에 `CancellationToken`이 전달된다.
- hover timeout이 underlying scan을 백그라운드에 남기지 않는다.
- 대형 workspace hover/click debug log에서 bounded 또는 cancelled scan이 확인된다.
- Sass path miss cache가 만료되거나 invalidation되어, 일반적인 파일/alias 변경에 reload가 필요 없다.
- activation events가 provider 언어와 contributed command를 포함한다.
- 대표 검증이 통과한다.
  - `npm run compile`
  - `npm run vscode:prepublish`
  - `npm run verify:stability` 추가 후에는 이 명령도 포함

## 6. 리스크 통제

- 각 slice는 작게 유지하고 독립적으로 검증한다.
- 응답성 문제를 고치는 동안 parser 로직을 재작성하지 않는다. 단, 실패 검증이 parser를 원인으로 특정하면 예외.
- multi-root workspace에서는 기존의 “현재 folder 우선, 필요 시 fallback” 동작을 보존한다.
- scan scope 축소는 false negative 위험이 있으므로, 기능 contract상 필요한 곳에는 bounded fallback을 둔다.
- Slice 2 이후에도 debug log상 stall이 지속되면, 더 큰 리팩터 전에 Cursor/extension-host contention을 별도 조사한다.

## 7. 권장 구현 순서

1. Slice 2 — cancellable/scoped scan
2. Slice 4 — Sass cache freshness
3. Slice 5 — activation events
4. Slice 6 — recurrence guard script
5. Slice 3 — scan log상 generated-folder volume이 여전히 크면 exclude 설정화
6. Slice 1 instrumentation은 Slice 2 전에 독립 적용하거나, 각 slice에 `debugLogging` 뒤로 접어 넣는다.

이 순서의 이유: cancellation과 stale-cache 수정이 가장 강한 root-cause 가설을 가장 적은 제품 동작 변경으로 직접 겨냥한다. exclude 튜닝이나 persistent indexing은 core cancellation fix보다 먼저 하면 원인 검증이 흐려질 수 있다.


## 8. 레드팀 addendum — 2026-05-20

레드팀 리뷰 결과, 기존 계획은 방향은 맞지만 그대로 구현하면 stall을 완전히 막지 못할 수 있다는 blocking finding이 나왔다. 아래 항목은 구현 전 계획에 반영되어야 한다.

### Blocking findings folded into implementation plan

1. `findPlaceholderDefinitions`는 optional이 아니라 필수 cancellable 대상이다. `@extend %...` definition provider hot path에서 호출된다.
2. `CancellationToken`은 `workspace.findFiles`는 취소할 수 있지만 `workspace.fs.readFile()`과 이미 시작된 synchronous line scan은 직접 멈추지 못한다. max file size guard, N-line token check, chunk yield가 필요하다.
3. repeated hover는 cache 완료 전 동일 scan을 여러 개 띄울 수 있다. in-flight de-dupe, latest-request-wins cancellation, global scan concurrency limit이 필요하다.
4. scoped search를 넣으면 기존 `className`/`placeholderName` only cache key는 잘못된다. scope/config/fallback mode를 cache key에 넣어야 한다.
5. `workspace.findFiles` token은 4번째 인자다. recurrence guard는 단순 grep이 아니라 callsite/argument-position까지 확인해야 한다.
6. exclude 배열 설정은 VS Code `GlobPattern` 단일 인자와 맞지 않는다. helper에서 단일 glob 또는 post-filter 정책을 명확히 해야 한다.
7. Sass path cache watcher는 create/delete 중심으로 제한하고 debounce해야 한다. change마다 global clear하면 새 overhead가 된다.
8. activation event는 startup gap 완화책일 뿐 runtime stall fix evidence가 아니다.
9. verification은 compile/manual만으로 부족하다. cancellation/backpressure/cache invalidation을 검증하는 deterministic harness 또는 guard가 필요하다.

### Revised acceptance criteria additions

- `findPlaceholderDefinitions` 포함 모든 provider-triggered workspace scan helper가 cancellation/options를 받는다.
- 큰 파일 skip, chunked/yielding scan, no-cache-on-cancel 정책이 구현된다.
- 동일 query/scope scan이 동시에 여러 개 실행되지 않음을 검증한다.
- static guard는 `workspace.findFiles`의 4번째 인자 token 전달을 확인한다.
- dynamic/harness 검증은 timeout wrapper가 underlying scan을 실제 취소하는지 확인한다.

## 9. 구현 진행 기록 — 2026-05-20

적용 범위:

- `src/scan.ts` 공통 scan gate 추가
  - `workspace.findFiles(include, exclude, maxResults, token)` 4번째 인자 token 전달
  - primary workspace folder 우선, fallback workspace 순서 유지
  - `scanExclude` 배열은 post-filter로 처리
  - in-flight scan de-dupe와 global scan concurrency limit 적용
  - scope/config/timeout mode 포함 cache key 생성
- `src/fsText.ts`
  - `workspace.fs.stat()` 기반 max file size guard 추가
  - read 전/후 cancellation check 추가
- `src/classUsage.ts`, `src/extendRefs.ts`, `src/placeholders.ts`
  - provider-triggered workspace scans에 `WorkspaceScanOptions`/token 전달
  - line-loop cancellation check와 file-loop yield 추가
  - cancel된 scan은 cache에 저장하지 않도록 완료 직전 token check 수행
- `src/providers/hoverProvider.ts`, `src/providers/definitionProvider.ts`, `src/commands.ts`
  - hover timeout-only wrapper 제거
  - provider token을 scan helper로 전달
  - full-scan command를 `withProgress({ cancellable: true })`로 실행
- `src/sassResolve.ts`, `src/extension.ts`
  - Sass path miss cache short TTL 적용
  - Sass file create/delete, alias config, workspace folder 변경 시 cache clear
- `package.json`, `README.md`, `CHANGELOG.md`
  - language and contributed-command activation events 추가
  - scan guard 설정과 stability 검증 script 문서화
- `scripts/verify-stability-contract.mjs`
  - cancellation/backpressure/cache/activation contract 정적 guard 추가

검증:

- `npm run compile` 통과
- `npm run verify:stability` 통과
- `npm run vscode:prepublish` 통과

남은 수동 검증:

- Cursor/VS Code에서 대형 workspace를 열고 hover/Cmd-click 반복 시 Output log와 UI 응답성을 확인한다.
- 필요하면 `scssAliasJump.scanExclude`에 프로젝트별 generated folder를 추가한다.


## 10. Alias-link regression follow-up — 2026-05-20

Observed regression:

- In NLRC `_popoverMenu.scss`, clicking `@use '@/assets/css/scss/components/button' as *;` opened a missing `button` editor instead of `_button.scss`.

Root cause:

- The NLRC workspace did not have `scssAliasJump.aliases` configured, so this extension did not resolve `@/…`; Cursor/VS Code's built-in Sass link then tried to open an unresolved `button` target.

Fix:

- `resolveAliasToAbsolute` now treats `@/…` as `${currentWorkspaceFolder}/src/…` only when no explicit alias matches.
- Document links now set the resolved target immediately, while keeping lazy resolve as a defensive fallback.
- `verify:stability` includes a regression check for implicit `@/` fallback and explicit alias precedence.


## 11. Publish automation follow-up — 2026-05-20

Added Marketplace publish automation after the 0.3.1 release slice:

- `scripts/publish.mjs` validates publisher metadata, package/package-lock version parity, and dated CHANGELOG entry for the current version.
- The script builds a verified VSIX via `scripts/bundle.mjs`, then publishes that exact file using `vsce publish --packagePath`.
- PAT is read from `VSCE_PAT` by default and is never printed in the command line.
- `npm run publish:marketplace:dry` is the mandatory local preflight.
- `.github/workflows/publish-vscode-extension.yml` supports manual dry runs and tag-triggered `v*` publishes with the `VSCE_PAT` repository secret.
