# Kaisen UI / audio parity (2026-10-13)

Reference: read-only Kaisen `main` at `b5c44346139901c195084000d172f89374a623b9`. MachiMamore implementation base: `main` at `28960ba326679f7ca32531483495c60dc7fceaf9`.

## Flight display

- Enemy markers use the Kaisen peach diamond, 38×3 px HP bar, and pale distance label. Friendly aircraft use the turquoise circle. Distance labels are limited to 1,500 m; marker drawing and aim-state reads do not advance or mutate the mission.
- The aim ring follows the Kaisen Normal/Easy size and state colors, including the existing selected-target lock and line-of-sight result. The 2.4 km radar uses the same enemy/friendly shapes, a player marker, and hollow marks at its range edge. Its caption is included in the reserved layout bounds.
- The HUD places compact aircraft data at upper left and enemy/city summaries at upper right, with the radar in a free right-side slot. The city direction/district warnings, finite 50-aircraft information, and existing UFO fireworks remain MachiMamore-specific.
- Portrait notices and the opening/ally messages use separate narrow bands beside the sight. In short landscape, notices stay in a bounded center-left band; the opening/ally message uses a compact top band after the timer and before the action buttons, leaving the r49 radar slot clear on the right. Compact warning text retains direction, district HP/count, reload time, or low-altitude guidance; simultaneous notices remain inside their bounded band.
- On 320×568 portrait and short landscape screens, the always-visible flight rows are HP, speed/altitude, friendly survivors, provisional score, and ammunition. The shorter layout hides deployment/reserve breakdown, accuracy, and the victory-time-points note. The pause screen's expandable **戦況詳細** keeps those live values available, including separate reserve/queued counts, city HP/destruction, accuracy shots/hits, and score.

## Propeller sound

The engine uses three oscillator partials at `(40 + speed × 0.13) × 1, 2, 3`, mixed at `.45`, `.20`, and `.12`. MachiMamore's effects master gain remains `.23`; engine gain remains `.0475`. The three engine voices count against the existing ten-source cap and are stopped/disconnected on stop, restart, and disposal. Audio remains off until the player explicitly enables it.

An OfflineAudioContext comparison recorded engine-signal RMS amplitude reductions of about 49.4–49.6% at 65, 110, and 140 m/s; peak amplitude changed from `.0107` to `.0048`. These are electrical signal measurements, not a claim that perceived loudness is halved. Speaker/headphone listening on a device remains unverified.

## Verification status

Final verification input digest: `ad3440fc637784ddc5b91303755e00eb3cf19c7115eb83dc061fffa832e2644c`. The final source stayed unchanged during the 173/173 unit tests, build, distribution check (four output files), and clean diff check. `npm ci --ignore-scripts` also completed. The standard GitHub PR workflow runs Chromium portrait/landscape/desktop and WebKit small portrait; its latest-head result is recorded in the PR.

Local Chromium UI checks passed all three configured viewports. Five fixed-display captures also use the actual product Three.js scene with software rendering: all stayed at tick 0, left game state unchanged, and reported WebGL error 0 and no runtime errors. These captures and local UI checks preceded only the final removal of one trailing blank line in `src/style.css`; there was no layout or rule change afterward. The parent and independent QA actually opened all five images. Notifications, radar, sight, opening messages, and controls remained separate at the captured sizes. Additional checks at 320×568 and 568×320 found all four warning/progress items inside their notice band, all five control center hits accessible, and all eight pause-detail values reachable.

Stored evidence: [Normal portrait](evidence/ui-audio-parity-20261013/normal-portrait.png), [Easy portrait](evidence/ui-audio-parity-20261013/easy-portrait.png), [Normal landscape](evidence/ui-audio-parity-20261013/normal-landscape.png), [320×568 notices](evidence/ui-audio-parity-20261013/small-notices.png), [568×320 notices](evidence/ui-audio-parity-20261013/small-landscape-notices.png), [capture observations](evidence/ui-audio-parity-20261013/candidate-capture.json), and [engine signal measurements](evidence/ui-audio-parity-20261013/propeller-output.json).

The assigned independent reviewer (6.1 Sol Extra High) approved the Draft PR candidate with zero blockers after separately confirming the final digest, reviewing source/test changes and all five images, checking QA records, and rerunning 12 focused UI/audio/fireworks tests (12 passed).

The fixed notice fixture did not overflow its band, so an overflow scroll gesture was not exercised. Local software rendering, fixed display states, and CI WebKit do not establish real iPhone Safari gameplay or perceived speaker/headphone loudness.
