# Isolated cadence and accepted-input comparison

The tables below preserve isolated trials as recorded before adoption. The final initial parameters now adopt ally cadence34/114 and the copied-pose/CPA input driver as machimamore-2. Earlier candidate JSON keeps its at-trial candidate/adopted flags and is historical evidence. Each run starts from createGame(mode, seed) and uses accepted FlightInput only, with no fixture or authoritative state changes after Start. Limit: 600 logical seconds.

The final120-case run completed with zero faults and zero600-second cutoffs in `artifacts/balance/results-0.json` and `results-1.json`, with pure source digest `8a9232e126b30fcf9afea1e01c28f8ee3411faa1a2dc076faab0f570ae4c33bf` and policy digest `48aca7032cb6807ab2797d9d47b22bbfe4453c55f76269adbcb8e60ff3828051`. Unfavorable34/114 seed29 and historical17/57 seed47 are retained below.

The legacy raw field `cpuMs` is `performance.now()` elapsed wall time per case, recorded with two parallel Node workers. It is diagnostic timing under concurrent load, including brief harness typechecking during the final run; it is neither process CPU consumption nor a performance benchmark.

The first matrix executed 36 candidate cases plus 6 baseline active cases. The second matrix executed 24 original-pilot cases plus 8 precise active cases; 16 identical idle/crash records are shared. Those 74 executions completed without simulation faults; the two subsequent driver matrices add12 successful executions, making86 completed trials. The initial predictive-driver exception before a completed case is retained separately.

The mean table uses the common tuning seeds 11, 29, 47; seed 1 is reported separately below. Time, city HP, and losses are rounded only in this table; raw JSON keeps all precision.

| Cadence / pilot | Mode | Active score | Idle score | Active − idle | Active / idle seconds | Active / idle friendly losses | Active / idle city HP | Active H/N | Crash defeats |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 17/57 original | easy | 69168 | 68251 | +917 | 74.27 / 90.13 | 19.00 / 21.33 | 4492.69 / 4368.68 | 586/3026 | 0/3 |
| 17/57 original | normal | 69083 | 76723 | -7641 | 85.04 / 94.07 | 23.67 / 22.00 | 4411.49 / 4342.81 | 318/670 | 0/3 |
| 17/57 precise | easy | 69795 | 68251 | +1544 | 87.44 / 90.13 | 21.67 / 21.33 | 4428.28 / 4368.68 | 199/772 | 0/3 |
| 17/57 precise | normal | 74638 | 76723 | -2085 | 91.78 / 94.07 | 23.00 / 22.00 | 4361.45 / 4342.81 | 55/58 | 0/3 |
| 28/95 original | easy | 68404 | 64734 | +3670 | 82.94 / 103.82 | 21.33 / 26.00 | 4409.54 / 4201.54 | 679/3096 | 0/3 |
| 28/95 original | normal | 65990 | 71951 | -5961 | 95.82 / 111.68 | 25.33 / 27.33 | 4280.74 / 4132.40 | 361/854 | 0/3 |
| 34/114 original | easy | 65183 | 62118 | +3065 | 90.52 / 115.94 | 24.33 / 28.00 | 4326.16 / 4099.81 | 567/3272 | 3/3 |
| 34/114 original | normal | 62427 | 71896 | -9470 | 102.77 / 116.59 | 28.00 / 29.00 | 4199.37 / 4093.36 | 384/1122 | 3/3 |
| 34/114 precise | easy | 62100 | 62118 | -18 | 110.24 / 115.94 | 28.67 / 28.00 | 4115.17 / 4099.81 | 164/882 | 3/3 |
| 34/114 precise | normal | 68189 | 71896 | -3708 | 118.19 / 116.59 | 29.67 / 29.00 | 4038.18 / 4093.36 | 60/60 | 3/3 |

34/114 per-seed comparison:

| Mode | Seed | Original active | Precise active | Idle | Crash result | Crash tick | Enemy D at crash end |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| easy | 1 | 65952 | 65716 | 58642 | defeat | 7283 | 47 |
| easy | 11 | 64347 | 61486 | 62146 | defeat | 6891 | 48 |
| easy | 29 | 65616 | 61799 | 62759 | defeat | 7508 | 50 |
| easy | 47 | 65586 | 63014 | 61449 | defeat | 6957 | 48 |
| normal | 1 | 63455 | 69713 | 69944 | defeat | 7283 | 47 |
| normal | 11 | 62160 | 64297 | 71528 | defeat | 6891 | 48 |
| normal | 29 | 63953 | 69202 | 72712 | defeat | 7509 | 50 |
| normal | 47 | 61167 | 71067 | 71449 | defeat | 6957 | 48 |

At 34/114 the original active pilot completes missions faster than idle for all eight mode/seed pairs, protects more city HP in seven of eight pairs, and defeats are reproducible for all eight crash cases. Both active pilots still score below idle for every tested Normal seed. The precise pilot improves accuracy but does less damage and sometimes prolongs the campaign; slowing the wing cadence alone has not resolved the Normal no-input score advantage. These finite tests establish candidate behavior, not a guarantee for unseen seeds or human play.

Source digests and policy/input digests are in each raw JSON file. Historical baseline source: `6a64ac3620ab8a0acc546ae4fb4121cfd21a0d73ea34d92a709e53191a0fcf1a`. 34/114 candidate source: `22e4e26ca55333cbc64c6eaa5ce0feeced898302a88e1e2c1129a0a04d21d1ff`.

## Normal continuous-fire target retention candidate

Six additional runs completed without simulation faults. Product source was not modified. The policy source is preserved in `pilot-defense.source.txt`.

| Cadence | Seed | Active score | Idle score | Active − idle | Active / idle seconds | Active / idle friendly losses | Active / idle city HP | Player kills | Player losses | H/N |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 17-57 | 11 | 69558 | 74106 | -4548 | 86.27 / 95.98 | 23 / 24 | 4388.96 / 4270.00 | 4 | 2 | 53/106 |
| 17-57 | 29 | 74084 | 78247 | -4163 | 87.00 / 96.17 | 20 / 20 | 4390.33 / 4347.19 | 3 | 1 | 50/76 |
| 17-57 | 47 | 74796 | 77817 | -3021 | 81.78 / 90.07 | 20 / 22 | 4420.92 / 4411.23 | 5 | 1 | 71/104 |
| 34-114 | 11 | 66973 | 71528 | -4555 | 106.97 / 114.77 | 30 / 30 | 4203.17 / 4104.50 | 5 | 1 | 60/96 |
| 34-114 | 29 | 64376 | 72712 | -8336 | 102.05 / 112.92 | 29 / 28 | 4156.54 / 4138.47 | 8 | 3 | 58/98 |
| 34-114 | 47 | 69305 | 71449 | -2144 | 107.83 / 122.10 | 28 / 29 | 4116.00 / 4037.09 | 4 | 1 | 50/64 |

Removing the volley wait increases player kills and shortens the campaign, but all six active scores remain below their same-cadence idle references. The accuracy and player-loss penalties outweigh the measured time/city gains for this input strategy. This hypothesis does not close R53.

## Copied-pose aiming and CPA safety candidate

The final driver completed six cases with no simulation faults and no player losses. The initial driver exception and fix are retained in `skillful-driver-initial-failure.txt`. Exact final driver source is `pilot-skillful.source.txt`.

| Cadence | Seed | Active score | Idle score | Active − idle | Active / idle seconds | Active / idle friendly losses | Active / idle city HP | Player kills | Player losses | H/N |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 17-57 | 11 | 75098 | 74106 | +992 | 95.80 / 95.98 | 26 / 24 | 4259.40 / 4270.00 | 0 | 0 | 8/8 |
| 17-57 | 29 | 79180 | 78247 | +933 | 84.93 / 96.17 | 20 / 20 | 4399.24 / 4347.19 | 0 | 0 | 0/0 |
| 17-57 | 47 | 67380 | 77817 | -10437 | 89.35 / 90.07 | 23 / 22 | 4416.28 / 4411.23 | 0 | 0 | 0/12 |
| 34-114 | 11 | 72389 | 71528 | +861 | 109.75 / 114.77 | 29 / 30 | 4126.41 / 4104.50 | 3 | 0 | 52/52 |
| 34-114 | 29 | 71734 | 72712 | -978 | 122.85 / 112.92 | 27 / 28 | 4086.47 / 4138.47 | 3 | 0 | 48/52 |
| 34-114 | 47 | 74300 | 71449 | +2851 | 109.45 / 122.10 | 25 / 29 | 4137.97 / 4037.09 | 5 | 0 | 75/76 |

17-57: mean active score 73886.00, idle 76723.33, difference -2837.33; active wins the score comparison in 2/3 seeds.

34-114: mean active score 72807.67, idle 71896.33, difference +911.33; active wins the score comparison in 2/3 seeds.

The 34/114 candidate connects legal defensive inputs to score gains in two of three seeds with zero self-loss. Seed29 remains unfavorable and is preserved. The 17/57 seed47 emits twelve non-hitting rounds and is also preserved; future observation of enemy health at launch/arrival can distinguish pre-arrival wing destruction from predictor misses. No score coefficient or hidden penalty was changed. At this historical trial stage, larger confirmation-seed runs and actual DOM execution were still needed; the final pure confirmation results follow below.

## Adopted V2 final120 result

Both partitions completed with the source and policy digests above. The120 unique mode/seed/policy records independently match the literal fixed score formula and preserve finite component bounds. Each mode has49 victories and11 defeats; active is12/12 victories with zero player losses in both modes.

| Mode | Active − idle mean | Greater / equal / lower | Tuning mean | Confirmation mean |
| --- | ---: | ---: | ---: | ---: |
| easy | +2463.17 | 12 / 0 / 0 | +2304.33 | +2622.00 |
| normal | +338.42 | 5 / 1 / 6 | +541.83 | +135.00 |

Normal results remain mixed: six active paths score lower, one ties, and five score higher than idle. Some active paths fire zero rounds; their legal flight still changes interception and city-defense outcomes. These finite comparisons do not establish that every active path beats idle or that no unseen strategy can exploit the scoring. Full favorable and unfavorable records remain in the two raw partition files; see `artifacts/balance/final-summary.json` for per-seed differences and coverage checks.

## Final additional operative-key and negative paths

The separate12-seed Easy ArrowRight held comparison completes12 victories with zero faults. Active exceeds turn-held in11/12 seeds, with mean difference+2258.08 points. Easy fire-held in the frozen120 is inactive Space/neutral; this separate operative ArrowRight action supplies the actual single-key A20 comparison. Loop is not artificially retriggered.

Normal seed1, same final source, legal inputs only:

| Policy | Result | Score | Seconds | City HP | Friendly D | H/N |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| city-fire | defeat | -33677 | 73.87 | 0.00 | 23 | 0/1204 |
| active | victory | 71677 | 107.07 | 4183.31 | 27 | 12/12 |
| idle | victory | 69944 | 124.65 | 4109.64 | 28 | 0/0 |
| friendly | victory | 57486 | 127.77 | 3970.24 | 33 | 0/372 |
| dead-city | victory | 37403 | 120.00 | 3201.73 | 38 | 0/2490 |

Total final evidence:137 completed cases,114 victories,23 defeats, zero faults, zero600-second cutoffs. The independent literal score recomputation matches137/137. Each mode retains a crash-repeat victory exception at seed71; intentional crashes lose11/12 cases per mode, rather than being guaranteed to lose. Full raw files, policy digests, input digests and SHA256 references are preserved in `artifacts/balance/final-additional-summary.json`.
