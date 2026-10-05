# Browser verification

This document records the browser checks for P17 (mobile layout and accessibility) and P18 (load, resources, and duration). The Playwright regression suite uses the shipped DOM and ordinary mouse, keyboard, and touch events for game actions. A development-only read-only observation hook may be used to inspect counts; it must not provide state mutation and must be absent from the production bundle.

## Commands and separation

The required, bounded regression suite is `npm run test:browser`. It covers the main flow, pause and dialogs, settings save/cancel/reload, keyboard and touch recovery, preparation and first-draw recovery, the five specified viewport sizes, accessibility checks, and the absence of outbound requests. It is the suite suitable for normal CI. The Playwright projects run Chromium and WebKit.

For this Linux workspace, run one local suite process directly so interrupting the shell cannot leave a Playwright child behind. `LP_NUM_THREADS=2` limits llvmpipe worker oversubscription for WebKit; it does not affect the game rules or viewport.

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
LD_LIBRARY_PATH=/workspace/.cache/browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 LP_NUM_THREADS=2 \
node node_modules/@playwright/test/cli.js test
```

Long duration checks live in `scripts/browser-evidence.ts` and are intentionally separate from CI. Run it against a local Vite server after the page and read-only metrics are ready. Both checks default to a 393×852 viewport. Set `BROWSER_EVIDENCE_WIDTH` and `BROWSER_EVIDENCE_HEIGHT` to positive safe integers to select another profile; use the same pair for the 60-second sample, ten relaunches, and 15-minute run. The record includes the CSS viewport, device scale factor, effective renderer pixel ratio, antialias/sample state, and actual WebGL drawing-buffer size.

```sh
npm run dev
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
LD_LIBRARY_PATH=/workspace/.cache/browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node --import tsx scripts/browser-evidence.ts --mode performance
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
LD_LIBRARY_PATH=/workspace/.cache/browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node --import tsx scripts/browser-evidence.ts --mode endurance
```

For a WebKit run at the supported 568×320 landscape profile, keep the same viewport variables for both modes:

```sh
BROWSER_EVIDENCE_ENGINE=webkit BROWSER_EVIDENCE_WIDTH=568 BROWSER_EVIDENCE_HEIGHT=320 \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
LD_LIBRARY_PATH=/workspace/.cache/browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 LP_NUM_THREADS=2 \
node --import tsx scripts/browser-evidence.ts --mode performance
BROWSER_EVIDENCE_ENGINE=webkit BROWSER_EVIDENCE_WIDTH=568 BROWSER_EVIDENCE_HEIGHT=320 \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
LD_LIBRARY_PATH=/workspace/.cache/browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 LP_NUM_THREADS=2 \
node --import tsx scripts/browser-evidence.ts --mode endurance
```

`performance` samples animation-frame intervals during a 60-second steady mission and writes a JSON record. `endurance` warms the renderer, performs ten UI Start→Home cycles with a warm-Home resource comparison, then keeps a mission active for 15 minutes. It uses the visible Retry button after a naturally completed mission, and records an interruption if the app safely pauses. Both modes check actual live counts against the aircraft ≤16, lasers ≤40, projectiles ≤2048, decorations ≤24, contexts ≤1, sources ≤10, and effect sources ≤9 bounds. Each invocation writes its browser version, graphics backend, viewport, run time, URL, mission seed and rules version, observations, and screenshots under `artifacts/browser-evidence/`. These measurements describe the browser and graphics backend used; SwiftShader and emulated mobile viewports are not iPhone/Safari measurements.

P18 is complete only when the observed active-object bounds and return-to-baseline checks pass, and the 15-minute record has no unexplained monotonic growth or functional interruption. An unrun duration check remains `not_run`; a missing browser/device or observation field remains `blocked`. Do not infer a pass from a shorter run.

## Coverage map

| Check | Browser behavior and observation | Requirement |
| --- | --- | --- |
| Home and mission flow | Start from Home; pause, open and close Rules and Settings, resume, return Home, and start a fresh mission. Verify the app's screen state and focus. | R70–R73, A24 |
| Settings transaction | Change a normal control value, cancel and reopen to confirm rollback; change it again, save, reload, and confirm persistence under the Machimamore-only key. Exercise an explicit temporary-use path when storage rejects writes. | R62–R63, A23 |
| Input and interruptions | Change keyboard bindings through the capture UI; dispatch a composition-marked event; exercise two simultaneous Chromium CDP touch pointers and individual release/cancel; test a synthetic `window.blur` handler and separately observe native tab focus/visibility; lose and restore WebGL context during preparation and during play; inject a first-draw failure and retry from the visible UI. Require a deliberate Resume after interruptions. | R62, R83–R84, A21–A22, A27 |
| Viewports and text scale | Inspect 320×568, 393×852, 568×320, 852×393, and 1366×768. Check R71’s title, mission facts, mode selector, and Start within the first 320×568 viewport. Stress text at 200%, safe-area insets, and reduced-motion emulation. Check scroll areas and critical control sizes. | R71, R80–R82, A26 |
| Network boundary | Record all page requests and WebSockets outside the local app origin and fail on any attempted external connection. Aborting an attempted request does not count as evidence of zero attempts. | R100–R101, A29 |
| Rendering and audio bounds | On the normal 8-vs-8 start and the fullest naturally reached screen, read actual object/resource counts and confirm aircraft ≤16, active lasers ≤40, projectiles ≤2048, decorations ≤24, and active audio sources ≤10. Turn sound on in the UI before checking the source cap. | R92, A28 |
| Repeated operation and duration | Use Home / Start ten times and compare resources after each return to the same Home state; then hold one mission open for 15 minutes and check for interruptions and monotonic resource growth. | R91–R94, A28 |

## Evidence and status

Playwright screenshots and traces are saved by the configured test runner under `test-results/`; long-run JSON and screenshots go to `artifacts/browser-evidence/`. These generated directories are ignored by Git. Screenshots preserve the requested viewport dimensions. For P17, open the saved screenshots at their original dimensions and inspect Home, an active mission, Rules, and the settings dialog at mobile and landscape sizes. The test separately measures the required Home elements against the 320×568 viewport; full-page screenshot height does not establish first-screen fit. Record the exact file paths and observed layout issues below; a screenshot existing on disk alone is not a visual pass.

### Focused visual and recovery evidence

The Normal 320×568 compact-notice check is a DOM-only presentation fixture, not a natural combat sample. After reaching a stable mission and clicking the visible Pause control, it records the actual paused phase, screen, pause reason, and tick. It then changes only the DOM screen attribute used by CSS, hides the pause dialog, and sets visible reload text/progress, city warning, and low-altitude warning. The read-only game observer stays manually paused at the same tick before and after the capture; no simulation state is written. The original fixture image showed the bottom of the stacked notices reaching y=339.17px and covering the aircraft prop tip; the natural opening announcement also crossed the long city-warning text. The conditional layout now moves the four notices into two columns and hides that announcement only when Normal mode has both reload and low-altitude notices while Playing. In the opened after-fix PNG the notice stack ends at y=319.17px, 15.95px before the conservative projected aircraft band, and the prop tip and reticle are clear. Both images and the geometry/state record are saved under `docs/evidence/browser-visual/compact-notice-fixture-normal-320x568-2026-10-05{,-after-fix}.{png,json}`. The rerunnable DOM-only harness is `docs/evidence/browser-visual/review-compact-notice-fixture.mjs`; it defaults to 320×568 and uses timestamped output names. This presentation fixture does not assert that the notices occur together during ordinary play.

The focused WebKit context-restoration check ran rather than being skipped: the browser exposed WebGL2 and `WEBGL_lose_context` with both `loseContext()` and `restoreContext()`. The mission stayed paused after restoration until the visible Resume action. The complete report and attached capability record are in `docs/evidence/browser-visual/webkit-context-restoration-report-2026-10-05.json`.

Focused Chromium checks also passed for the complete Home → Start → Pause → Rules / Settings → Resume → fresh-mission flow, corrected two-touch ownership, and all five supported viewport profiles. The two-touch trusted pointer audit showed Fire pointer-up while steering remained held, followed by steering pointer-cancel; the raw turn/climb snapshot confirmed steering changed and then returned to zero. Current focused reports and PNGs are retained under `artifacts/browser-evidence/`; the final complete-suite report will be recorded separately below.

Keep these distinctions in the verification record:

- A screenshot saved and visually inspected is different from a screenshot saved only.
- A browser test passing in Chromium/WebKit is different from a real phone test.
- Renderer call time is not GPU completion time. Report GPU time as unavailable unless the browser exposes a measured GPU completion metric.
- A 60-second sample and a 15-minute endurance run are separate checks.
- A missing WebKit feature, audio device, physical keyboard/IME, or mobile device is recorded as `blocked` or `not_run`, with the affected coverage stated.
- The composition test dispatches browser events with `isComposing` and keyCode 229; it does not drive a physical Japanese IME. Two-finger input uses Chromium CDP touch dispatch and does not establish WebKit or device touch behavior.
- Synthetic `window.blur` dispatch checks the application handler and held-input release. A separate tab-switch test records `document.hidden`, `document.hasFocus()`, and pause reasons; a headless browser that does not produce a native focus/visibility transition is reported as blocked/skipped. Chromium may have Playwright focus emulation disabled over CDP for this observation. WebGL loss uses `WEBGL_lose_context`; the first-render failure is a one-shot exception at the graphics API boundary. These browser injections exercise recovery behavior, not device hardware fault rates.
- The two-touch case uses Chromium CDP `Input.dispatchTouchEvent` with real screen coordinates. In installed Chromium 149, `touchEnd.touchPoints` identifies the contact being ended: ending CDP contact 2 releases the Fire button while contact 1 continues steering. A trusted DOM pointer-event audit records `pointerup` for Fire and then `pointercancel` for the steering surface when the remaining contact is canceled; the read-only input snapshot confirms the same ownership transitions. This verifies the Chromium CDP path and does not establish WebKit or physical-device touch behavior.
- Setup helpers read the screen, Japanese pause reason, and development snapshot in one browser task so a safety pause cannot race a second check into a long wait. Setup and short functional/resource checks may recover only when the reason exactly identifies a frame-gap pause, the snapshot pause reason is only `frame`, the game tick stays frozen for 120 ms, and the test clicks the visible Resume button. Each successful recovery is attached immediately as JSON, including if a later step fails. The fixed 60-second and 15-minute windows do not auto-resume; any in-window pause is recorded as an interruption.
- Active-flight PNGs are visual-review candidates. The test records the app screen, simulation phase, and tick immediately before and after a capture; it does not infer what pixels the PNG contains from those state samples. If capture is followed by the exact frame-gap Pause, the test records the reason, confirms a 120 ms frozen tick, and resumes only through the visible Resume button so the functional UI flow can continue. A human opens the PNG to decide whether it shows active play or the Pause overlay; no overlay is hidden and no image is automatically called a visual pass.

### Renderer diagnostic notes

These short diagnostics are not P18 duration results. The bundled WebKit 26.5 run with a strict, logged warmup (`artifacts/browser-evidence/2026-10-05T01-24-35.071Z-webkit-short-draw.json`) sampled 5.069 seconds and 51 frames at 1366×768: mean 99 ms, p95 154 ms, p99/max 213 ms; all 17 recorded state polls remained active and the run ended in Playing. The preceding cold-start sample (`artifacts/browser-evidence/2026-10-05T01-19-41.488Z-webkit-short-draw.json`) included a 475 ms first interval and then remained in the exact frame-gap Pause for the rest of its 5.068-second sample (15/15 state polls). Keep the cold-start pause as a separate safety-pause observation; it is not evidence of a steady active sample.

Chromium SwiftShader's temporary `ThreadCount=2` and `ThreadCount=1` `SwiftShader.ini` probes (`artifacts/browser-evidence/2026-10-05T01-07-27.392Z-renderer-swiftshader-threadcount-2-15s.json` and `artifacts/browser-evidence/2026-10-05T01-12-05.148Z-renderer-swiftshader-threadcount-1-cwdcheck.json`) did not change its observed five-worker pool. The 2-thread-config probe sampled 15.036 seconds with 117 frames, mean 128.2 ms, p95 266.6 ms, p99 266.7 ms, maximum 400 ms, and 47/50 polls paused; the 1-thread-config probe sampled 3.040 seconds with 28 frames, mean 105.9 ms, p95 283.3 ms, p99/max 350 ms, and 8/9 polls paused. The file did not configure SwiftShader and was removed; neither configuration is adopted. These measurements only explain why the local Chromium software-renderer profile was not used for duration claims.

### Execution record

The final frozen-source regression run started at `2026-10-05T04:12:19.485Z` and took 530,371.792 ms. It used the single-worker Chromium and WebKit projects, passed 33 cases, skipped 3 with no failures or flaky cases, and matched source content digest `0e0a5a4211fe45f0f761af17fd1f2c6ab67ec7d6da9d4b46baf433596d714b9f` across 78 verification inputs. The exact command was:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
LD_LIBRARY_PATH=/workspace/.cache/browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 LP_NUM_THREADS=2 \
node --import tsx ./node_modules/@playwright/test/cli.js test --workers=1
```

The three skips were observed and scoped: native tab focus did not change `document.hidden`/`document.hasFocus()` in headless Chromium; the same native transition was absent in headless WebKit; and WebKit does not use the Chromium CDP-only two-contact dispatch case. Synthetic blur and the remaining WebKit interruption checks ran. WebKit exposed WebGL2 plus `WEBGL_lose_context` with both loss and restoration functions; its in-play restore case passed and still required visible Resume. The exact per-case results and skip descriptions are in `docs/evidence/browser-visual/final-browser-summary-2026-10-05.json`; the complete Playwright report is `docs/evidence/browser-visual/final-browser-results-2026-10-05.json`. All run PNGs are retained under the ignored `artifacts/browser-evidence/final-36-2026-10-05T04-12-19Z/` directory. The review set under `docs/evidence/browser-visual/final-36-2026-10-05/` contains 44 selected images; 19 were opened at their original dimensions and their findings are listed in `images.json`.

The native-focus skip annotations refer to `browser-tests/input-recovery.spec.ts:248` in the final test source. A later harness-only edit fixed the standalone rAF sampler's serialized callback so it does not depend on tsx's Node-side `__name` helper. The initial sampler invocation failed before producing a sample; its raw diagnostic remains in `docs/evidence/browser-visual/performance-diagnostics/` and is not counted as a result. CI reran the browser suite and all workflow steps successfully at code-fix head `71a092c70b47d76d9b248a21cfa8a0422a3fc905` (run `37265109021`), with the same 33 passed, 3 scoped skips, and 0 failures. The resulting verification-input digest is `6f0078ca79e4c38e89954e48cc7486c03c6f046261f401ebf4e3fd34fde55794`; this changes verification tooling only and does not change the app behavior covered by the earlier browser suite.

### Campaigns and portable controls

The natural-result WebKit campaign used the visible UI and ordinary Playwright pointer/keyboard input at 568×320. Normal started `2026-10-05T04:28:52.998Z`, reached Victory at tick 6,750 / 112.50 active seconds, destroyed all 50 enemies, lost 30 friendlies, destroyed one city district, retained 82.74% city health, and scored 69,735. It recorded two exact frame-gap pauses, at setup tick 0 and gameplay tick 366; each tick stayed frozen for 120ms before the visible Resume action. The visible Retry button began mission 4 at tick 0 with 50 enemies, 50 friendlies, and score 0. Easy started `2026-10-05T04:33:27.486Z` and reached Victory at tick 6,717 / 111.95 active seconds; all 50 enemies were destroyed, 27 friendlies were lost, city health remained 81.54% with no destroyed districts, and score was 65,448. Its one exact frame-gap pause was at setup tick 0 and remained frozen before visible Resume. Retry began mission 3 at tick 0 with 50 enemies, 50 friendlies, and score 0. Both campaigns recorded no page errors or external connection attempts. Their raw result/input traces, capture metadata, hash summaries, and opened flight/combat/result/retry PNGs are retained in `docs/evidence/browser-visual/campaign-webkit-568x320-normal/` and `docs/evidence/browser-visual/campaign-webkit-568x320-easy/`. The result PNGs show only the top of the scrollable result panel at this viewport; the full result text and counts are in the JSON records.

The portable-controls WebKit check ran at 393×852 on the fixed local controls server. It passed all six checks: saved all nine keyboard bindings through Settings; drove four directions and throttle through accepted input; completed a 448-tick loop with no interruption; held Fire through shared reload and one exact frame-gap pause at tick 984, confirmed the tick frozen for 120ms, then used visible Resume; returned from Settings to the same paused tick; and cleared held inputs on crash before accepting the new respawned pilot's first turn input. The driver confirmed all `src/*.ts`, `src/*.css`, and `index.html` hashes were identical before and after. Its raw report, summary, and opened keyboard/reload PNGs are retained in `docs/evidence/browser-visual/controls-webkit-393x852-2026-10-05/`.

### P18 WebKit duration and resource records

The 60-second measurement ran bundled WebKit 26.5 at a 568×320 viewport, DPR 1, with WebGL2 antialias disabled and zero samples. The browser-reported vendor/renderer strings were `Apple Inc.` / `Apple GPU`; this is the bundled browser's reported backend for an emulated viewport, not a physical iPhone/Safari measurement. The rAF window ran for 60,008ms with 2,816 intervals and remained on the same active mission with no Pause: mean 21.31ms, p50 17ms, p95 36ms, p99 54ms, maximum 226ms. The simulated R93 limits of p95 ≤33.4ms and p99 ≤50ms were not met, so this record does not establish those timing targets. The sampler completed without a driver exception, but it does not collect pageerror events. The same run completed ten Start→Home cycles with the renderer returning to the same warm baseline after each: 71 geometries, 4 textures, and 14 programs. Active maxima were 16 aircraft, 30 lasers, 39 projectiles, 0 decorations, 1 audio context, 6 audio sources, and 5 active effect sources, all within the recorded bounds. Raw data and four opened PNGs are in `docs/evidence/browser-visual/performance-webkit-568x320-2026-10-05/`; its summary records the 60-second results, ten cycle baselines, and SHA-256 hashes.

The browser invocation started at `2026-10-05T04:46:44.313Z` and finished at `2026-10-05T05:02:16.938Z`, including setup. Its fixed measured window lasted 900,190ms and recorded 177 observations at roughly five-second intervals; the report stores sample times relative to that window, not an absolute window-start timestamp. Two setup-only frame-gap pauses at tick 0 were each confirmed frozen for 120ms and resumed through the visible button before the fixed window. All 177 window samples were in Playing; the driver completed without exception and observed no Pause interruption. It recorded no outbound attempts. This script does not collect pageerror events, so its completed status is not evidence that no page-level exceptions occurred. Eight naturally completed missions were restarted through the visible Retry control at 111.273, 223.300, 334.963, 447.353, 559.703, 673.043, 785.701, and 899.764 seconds. Observed maxima were 16 aircraft, 30 lasers, 28 projectiles, 1 decoration, 71 geometries, 4 textures, 14 programs, 1 audio context, 6 audio sources, and 5 effect sources. Geometry, texture, and program counts remained exactly 71/4/14 across all samples. The compact 177-row projection, five opened 568×320 PNGs, and hash summary are in `docs/evidence/browser-visual/endurance-webkit-568x320-2026-10-05/`. The 9.95MB raw JSON remains in ignored `artifacts/browser-evidence/`; its local path, SHA-256, and byte count are in the folder's `summary.json`. This is bundled WebKit evidence for the recorded renderer, not a claim about a physical Apple device.

An earlier formal-source diagnostic run completed both browser projects with 20 passes, 10 failures, and 2 skips in 7m 30s. It exposed setup-time frame pauses, no native tab blur in headless, and browser-specific context-loss timing; this run predates the setup stabilization and fault-timing test changes below and is not the final regression result. Later Playwright runs replaced the ignored `test-results/` output, so this run's screenshots and traces are no longer retained; its contemporaneous counts are historical only.

The previous complete single-process diagnostic run had 22 passes, 8 failures, and 4 skips in about 11.8 minutes on the earlier setup helper. It exposed a check-then-wait race when the safe frame-gap pause arrived during setup, native touch coordinates below the viewport after Normal keyboard settings expanded Home, and default 60-second budgets for the five-profile and ten-relaunch aggregates. The atomic state sample, touch-target validation, and justified test budgets have since been corrected. This run remains diagnostic evidence only; do not report it as a final browser pass.

A later final-candidate run was explicitly stopped after the first 11 Chromium cases, before any WebKit test ran: 7 passed, 2 failed, 1 was interrupted, 1 skipped, and 23 did not run. The `game-flow` failure was a screenshot-harness error: the screenshot operation was followed by the documented frame-gap Pause on all three attempts, while the then-current PNGs were opened and showed active play at 00:03.15, 00:08.00, and 00:09.95. The helper incorrectly made its post-capture UI state a success condition. It now records pre/post UI state and accepts a PNG as a visual-review candidate only after strict frame-pause freeze confirmation and visible Resume; the core flow remains independently asserted. The two-touch test reached gameplay but `#fire` remained hidden in the hybrid desktop pointer profile. The test now uses a touch-first mobile emulation and selects Normal mode through native touch so it can assert the input presentation before dispatching two simultaneous CDP contacts. I also opened the first 320×568 active-flight candidate. Home fits, but the `mission-hud` and `flight-data` panels overlap, and the visible city warning covers part of the HUD. The viewport test now checks those panel intersections and preserves their rectangles in an attachment so the responsive fix can be reviewed. This stopped run is diagnostic, not a suite pass. Later Playwright runs replaced its ignored `test-results/` report and attachments, so they are no longer retained.

I opened the following Chromium PNGs with the image viewer before the GPU warm fix. Their `test-results/` files have since been replaced by later Playwright runs; treat the paths as historical and regenerate/open the final candidates before claiming visual review:

| Capture | Path | Visual finding |
| --- | --- | --- |
| 320×568 Home | `test-results/mobile-layout-home-layout--1a474-supported-viewport-profiles-chromium/home-portrait-small.png` | Title, intro, 50/50 totals, 8×8 deployment, mode and Start are visible within the first viewport. |
| 393×852 Home | `test-results/game-flow-Home-→-Start-→-P-15be1-gs-→-Resume-→-fresh-mission-chromium/home-393x852.png` | Main copy and all Home actions are visible. |
| 568×320 Home | `test-results/mobile-layout-home-layout--1a474-supported-viewport-profiles-chromium/home-landscape-small.png` | Mode and Start remain visible; no visible clipping. |
| 852×393 Home | `test-results/mobile-layout-home-layout--1a474-supported-viewport-profiles-chromium/home-landscape-large.png` | Wider layout keeps the intro and action panel readable. |
| 1366×768 Home | `test-results/mobile-layout-home-layout--1a474-supported-viewport-profiles-chromium/home-desktop.png` | Desktop composition remains readable with a separate action panel. |
| 393×852 mission / Rules / Settings | `test-results/game-flow-Home-→-Start-→-P-15be1-gs-→-Resume-→-fresh-mission-chromium/mission-393x852.png`; `rules-paused-393x852.png`; `settings-portrait-393x852.png` | Aircraft and HUD are visible; Rules and Touch Settings content fit the portrait dialog with internal scrolling. |
| 320×568 Settings at 200% text scale | `test-results/mobile-layout-settings-rem-adf4f-safe-area-insets-and-scroll-chromium/settings-200-percent-safe-area-320x568.png` | Close and Save remain visible; content scrolls. The footer labels wrap across several lines at this width. This is CSS text-scale emulation, not browser zoom. |

| Area | Result | Target/environment | Evidence and notes |
| --- | --- | --- | --- |
| Local browser regression | `pass` — 33 passed, 3 scoped skips, 0 failures | Chromium 149 and bundled WebKit, one worker | The frozen-source run and exact per-case results are recorded above. CI run `37265109021` also passed the browser suite and all workflow steps at code-fix head `71a092c70b47d76d9b248a21cfa8a0422a3fc905`. |
| P17 viewport and accessibility | `pass` in browser emulation | Five simulated sizes in Chromium and WebKit; physical-device status separate | 44 final-run screenshots are retained; 19 were opened at original size. The Normal compact-notice presentation fixture and pre/post geometry are recorded above. |
| P18 60-second performance | `completed`; R93 simulated p95/p99 limits exceeded | Bundled WebKit 26.5, reported Apple GPU backend, 568×320 DPR 1 | 60,008ms; 2,816 intervals; mean 21.31ms, p95 36ms, p99 54ms, max 226ms; mission stayed active. The target miss is recorded, not reported as a timing pass. |
| P18 ten relaunches | `pass` — ten Start→Home cycles returned to baseline | Same WebKit 26.5 page and 568×320 viewport | Renderer counts returned to 71 geometries, 4 textures, and 14 programs after every Home return; active maxima stayed within limits. |
| P18 15-minute endurance | `pass` — 900,190ms, 177/177 Playing observations | Bundled WebKit 26.5, reported Apple GPU backend, 568×320 DPR 1 | Eight natural results used visible Retry; no Pause interruption or outbound attempt, no resource-bound violation, and no growth in geometry/texture/program counts. Pageerror events were not collected by this driver. |
| Physical iOS/Safari, real IME, VoiceOver, audible output, and flicker measurement | `blocked` | No physical device, platform IME, assistive technology, or calibrated output measurement is available in this browser session | Record device/model, OS/browser, assistive technology, audible/flicker method and limits if later run. |
