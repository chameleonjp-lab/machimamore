# 短時間の実UI確認

## 対象と基点

2026-10-08 UTCの本人方針: ホーム・ゲーム画面・設定・結果・その他画面を確認し、プレイは本人が行う。使用・命中・物理等の論理は、その修正依頼がある場合にコードと必要最小限のunitで確認する。通常unit/type/buildは維持する。

基点は read-only で確認した main `9e8a5c021dfd286feeb06eb8f6659850d9868a42`。PR #8 は既に本人側でmerge済み。旧head `899e7894e9327d9c30411d0bc43f577f51466acf` へ重複適用しない。公開push、CI起動、merge、配備は実行していない。

## 実装と範囲

- 実製品の `index.html`、`main.ts` の画面遷移・button handlers、`Hud`、`ControlSettings`、`RulesGuide` と既存CSSを共用する。fixture専用HTML/CSSによる似せた画面は作らない。
- 既存 `scene.ts` の Canvas2D 照準・UFO/味方/街マーカーと画面外方向表示を `flight-markers.ts` へ同内容のまま切り出し、製品とUI確認で共有する。3D worldだけを省略する。3D景観、実機GPU、フレームレートは対象外。
- `DEV && MODE === 'ui-test'` のbootだけが `ui-test-driver.ts` を動的に読み込む。ゲーム用requestAnimationFrame/stepGame/物理/AI/射撃/命中/自然な再装填・勝敗待ちは実行しない。固定stateを直接実presenterへ渡す。結果数値は表示例であり、得点計算・勝敗の証明ではない。
- Home、Easy/Normal HUD、再装填/待機/低空・街攻撃、Pause、ルール、touch/keyboard設定、全3結果、起動エラーを確認。設定は各テストの隔離browser contextだけへ保存する。
- 通常test discoveryは `browser-tests/ui-only` の1つの有限な画面巡回。Chromium縦/短い横/desktop、WebKit狭い縦の4件。約1分は目標で、未実測。install/build/server準備と、人による画像の実見時間を画面巡回時間に混ぜない。
- runtime/console error、失敗asset、外部通信を記録し、途中失敗でもdiagnosticsを添付する。スクリーンショット生成だけを画像の人手確認済みとは呼ばない。200%文字、実機、3D/音質、プレイ受入はこの候補では未確認。

## 実行

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run check:dist
npx playwright install --with-deps chromium webkit
npm run test:browser
```

`npm run build` は型検査を含む。`check:dist` はfixture API/driverの本番非混入を確認する。`npm run test:browser -- --list` は収集のみであり、ブラウザー合格ではない。UI単体の短い反復は `node --import tsx --test tests/ui-contract.test.ts`。

直接画面を見る場合は `npm run dev:ui` を使い、`/?ui=home|easy|normal|reload|wait|notices|paused|victory|defeat|interrupted|startup-error` のいずれかを指定する。通常dev mode・本番ではこの入口は有効にならない。

## 保全と旧検査

旧 `browser-tests` の7spec、共通fixture、render-fixture HTMLはbyte不変で保持する。旧Playwright設定を `playwright.gameplay.config.ts` に保存し、新UI-only directoryだけを旧収集から除外する。旧40件は `npm run test:browser:gameplay -- --list` で再確認でき、必要時だけ明示実行する。旧のfocus-loss gate候補は新しいUI確認の成立に不要なので取り込まない。

通常CIは `npm test`、source証拠、type/build、dist検査を維持し、browserだけをUI-onlyへ切り替える。ゲームの数値実証/旧作戦証拠の `test:review` と `test:evidence` はscriptを保持して明示実行用にする。Pages配備は従来の手動・固定SHA・本人採用条件を変えない。

元sourceと変更候補を別directoryで保全し、限定patchを使う。ローカル取得分112fileは基点のGit blob hashと全件一致。remoteの148blob中36blobは既存の歴史的証拠としてremoteに保持し、候補にないことを理由に削除しない。復元は変更pathだけを基点blobへ戻し、新規pathだけを取り除く。既存sourceを丸ごと候補copyで置き換えない。

## 今回の証拠の限界

既存system Chromiumが起動時の `socket() failed: Operation not permitted` で停止。正規の審査経路でも同じ制約だった。別のcloud browserのloopbackも `ERR_BLOCKED_BY_CLIENT`。制約を迂回していない。

したがって実ブラウザー・スクリーンショット・人による画像確認・画面巡回約1分の達成はいずれも未確認。型・build・unit・収集・本番bundle検査は別証拠として報告する。ソースレビューから画面の合格へ読み替えない。
