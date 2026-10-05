# 独立レビューの記録

ユーザー指定の6.1Sol Extra Highを実装担当とは別の読取レビューに割り当てた。製品ファイルを書き換えず、要件・固定移行元・全製品ソースを読み、独立した幾何/戦闘fixtureとPlaywrightの障害注入で疑いを確認した。指摘の修正は実装担当が行い、修正後の再検査を依頼した。これは人による初回試遊や実機品質の保証とは異なる。

| ID | 発見と修正 | 再確認 |
| --- | --- | --- |
| IR01 | 「静止2秒」が減速時間になり、約119m動いていた。有限減速完了後から120tickの実静止に変更。3Dから直線への縦速度も減速で解放 | 静止区間の変位0、水平直線、速度/加速度unit |
| IR02 | 説明の街破壊減点1000と算式2000が不一致。説明を共有定数から作成 | ソース/説明の照合 |
| IR03 | 確定後elapsed凍結により母艦撤退表示が動かなかった。結果の論理値とは別の3秒表示時間を使用 | 凍結を維持する描画コード読取 |
| IR04 | 太いビームの半径が球だけに適用され街AABB端をすり抜けた。rounded-box連続交差へ統一 | 端から0.5mのfixture、実線量4/60HPと最近接終点を独立照合 |
| IR05 | HUDの宙返り判定が`loopProgress>=0`で常時宙返り表示。実進行`>0`へ修正 | 表示ソース照合 |
| IR06 | 先に弾で破壊されたUFOが、同tickの後刻の接触で自機を破壊した。接触参加者の生存/世代をイベント時に検査 | 弾あり味方D0/敵D1、弾なし実接触は双方D1 |
| IR07 | 後ろの枠の固定照準予約を数える前に前の枠が標的を選び、同じ街に3機予約。固定予約を先に全枠集計 | 独立fixtureの予約slots[0,5]のみ、最大2 |
| IR08 | Easy味方保護の弾通過と「機体が弾を遮る」の説明が不整合。航空弾とレーザー、モード別保護を明記 | 説明とcombatコード照合 |
| IR09 | 準備後render失敗でStart有効/破棄済sceneが残り不可視進行。全prepare/render/resize境界を共通失敗処理へ統一 | scene substitute障害注入でready tick0/Start無効、再準備→通常Start。Start描画失敗はpaused tick0、resize失敗はpaused tick6。200ms後も時計不変、再準備のみでは停止を解除せず明示Resume |
| IR10 | 先行する領域境界修正に加え、建物前velocity即時0を修正。領域/建物の停止距離を先見して有限減速 | 安全y150/v0とy140/v−40で160tick・faultなし、最小高度97.7333/97.6m、最大加速度60m/s²、位置/速度誤差3.41×10⁻¹²。回避不可y100/v−40はtick6で異常停止、速度−33保持で瞬間零化なし |

初期の320×568・568×320画像では開始ボタンが第一viewportの下へ外れた。compactHome修正後の2画像をレビュアーとrootが実際に開き、目的・50戦力・8対8・モード・Startが第一viewportに入ることを確認した。説明/設定/消音は44px以上の操作対象でscroll経路を維持する。最終画像と200%検査はブラウザ記録へ結び付ける。

警告線の`computeLineDistances()`が毎frameでBufferAttributeを置換するGPU buffer churnもThree.js実装と照合し、固定配列更新へ修正した。航空機batchは同じ親・不透明材質・互換属性だけを結合し、可動部分・原作形状・材質・所有/解放を保つことを読み、移植した独立triangle検査を本作で実行する。

停止距離検査の計算量を抑える丸角判定のexpanded-AABB早期棄却も別途レビューした。初版は旧根計算の相対誤差許容を包絡せず、30,275例中11例の微小境界差を生じた。係数scaleによる保守包絡へ修正後、random30,000例と平行/境界/微小半径/零長275例で旧版との接触有無・fractionの差0。旧関数referenceと生成seedを含む再現コードを `scripts/review-rounded-box-*` に保存し、CIで再実行する。

原独立実行はstdinから行い、実行時ソースhashをstdoutへ含めていなかった。保存後の再実行は最終source manifestに結び付けて別記する。`review-ir09-recovery.mjs` は3回の原検査を1つにまとめた再構成であり、保存しただけではその結合driverのpassを主張しない。これはScene代替方式で、native WebGL fault検査や通常全作戦と区別する。

通常合法入力の全作戦、通常DOMのStart→結果→Retry、初回の人の試遊、模擬ブラウザ、物理端末を混同しない。review済のソースから長時間性能や実聴感のpassを推論しない。最終状態は [VERIFICATION.md](VERIFICATION.md) と提出headのCIを参照する。

初回のGPU資源転送を開始前へ移した準備処理も独立に読取レビューした。Three.js 0.186.1の転送経路と照合し、不可視プールを通常canvasと同じshader条件で一時描画し、非同期fence完了後にvisibility・culling・drawRange・camera・renderTarget・viewport・scissorを復元する順序を確認した。続く実画面の描画完了後だけreadyを立てる。論理時計・入力・AIに書込みはなく、取消/破棄後の古い準備は復元と再描画を行わない。確認できたソース欠陥はない。初回停止の解消、準備時間、両engineとcontext-loss回帰の成否は別の実行証拠で判定する。

ルール版2の差分は版番号と僚機射撃周期17/57→34/114tick、および説明コメントだけであることを独立照合した。指定50/8・機体HP・弾倉/装填/復帰・レーザー・配点の値は変更していない。全作戦入力ドライバーも読取りと外部WeakMap記憶、複製した機体の予測だけを使用し、製品状態へ書き込まない。

検査スクリプトの証拠境界も再レビューした。準備中の再開が未記録になる入口と、準備失敗時に回復記録が欠ける経路を修正し、正確なframe停止理由・120ms時計凍結・可視Resumeを確認して直後に記録する。60秒と900秒の測定区間ではResumeを呼ばず、停止は中断とする。通常DOM全作戦は実mouse/keyboardだけで操縦し、自然な結果とRetryを確認する。例外時も最後の観測/入力列/原因をfailure.jsonへ保存して再throwする。保存先自体の作成失敗は通常のプロセスエラーとして扱う。これらのソース確認から、未実行の全作戦・長時間検査の成功は推論しない。

最終137件の保存行と独立literal得点検算スクリプトも読取レビューした。製品のscore関数を呼ばず、現行の純論理/入力方針digestを照合し、失敗例や負点を除外しないことを確認した。保存行の再検算はrootが実行し、独立レビュー担当が同じ実行をしたとは扱わない。

小画面HUDのindex/CSS変更と通常DOM campaignのWebKit選択を再レビューした。製品側の新たな具体的欠陥は見つからず、campaignの120ms停止観測後にも画面・phase・frame単独理由を再確認し、可視Resume後のplayingを検査する修正を確認した。スクリーンショットの状態記録は回復検査前に保存する必要があると指摘した。PNG自体の目視で飛行画面か停止overlayかを判定し、実寸法と自機の見え方はsource読取では合格にしない。
### 再割当後の差分レビュー（最終freeze前）

6.1Sol Extra Highの別担当が、portableな`controls-browser.mjs`のbootstrap失敗保存・操縦者identity・入力解放・frame停止回復をsourceで再確認した。宙返りの記録は、回復を挟む場合と途切れない保持を区別する名称とflagへ修正した。campaignはPNGの既知の前状態を即時保存し、撮影後の観測を更新して古いPlaying状態で操作を続けない。durationの撮影後読取が失敗しても、前状態・保存先・読取失敗が残ることを再確認した。

R91/R74に照らし、Scene constructorの`antialias:false`だけの変更が論理・機体geometry/material/color・カメラを変えないことをsourceで確認した。担当者はAA OFFの診断PNGをoriginal解像度で実際に開き、写っているNormal飛行の機体・街・母艦・マーカーを確認した。輪郭の段差は見える。異なるtick/停止状態から正確な改善率は導けず、作成直後の300×150 buffer値を1366×768測定bufferと呼べない。5秒の診断はR93/R94の合格ではない。

compact Normalの再装填・街攻撃・低高度注意の同時表示をDOMだけで構成した保存fixtureで、機体先端と注意表示、開始メッセージと街警告の重なりを確認した。2列配置と重要警告中のcaption抑制後のPNGをレビュアーも開き、機体投影域から15.95px離れることを確認した。抑制をPlayingへ限定し、Resultのメッセージを隠さない差分も読取確認した。これは自然発生した戦闘の証明ではなく、Pausedの論理を凍結してPlayingのCSSだけを適用する組合せfixtureである。再現scriptと撮影前後の観測を `evidence/browser-visual/` に保存した。この担当はテストやブラウザプロセスを起動していない。最終freezeのレビューと実測は別記する。

### 最終freezeのソース限定承認（2026-10-05 UTC）

独立担当6.1Sol Extra Highは、content digest `0e0a5a4211fe45f0f761af17fd1f2c6ab67ec7d6da9d4b46baf433596d714b9f` の最終差分をソース限定で承認した。`artifacts/source-manifest.json` の78エントリについて実ファイルのSHA-256を読取りで再計算し、全件一致・不一致0を確認した。ファイル配列から再計算したcontent digestも上記値と一致した。

frame停止回復、宙返り保持の証拠区別、撮影前後・読取失敗の記録保持、2指入力の所有・解除と操縦量のassertion、WebGL復元の観測済みcapabilityによるskip、小画面のPlaying限定caption抑制を再確認し、レビューした差分に提出を妨げる具体的なソース欠陥は見つからなかった。保存済みPNGの目視とfixtureの条件は前節の範囲に限る。

この担当は製品・検査コードを変更せず、テスト・ブラウザ・GPU検査を実行していない。承認時点で最終全ブラウザsuite、通常DOM全作戦、60秒/900秒の性能・耐久、再出撃資源検査、最新提出headのCIは別ゲートとしてpendingであり、本承認からpassを推論しない。実行結果は [VERIFICATION.md](VERIFICATION.md) と [BROWSER_VERIFICATION.md](BROWSER_VERIFICATION.md) に別記する。これはruntimeの合格、本人採用、release・公開の承認ではない。

### 新しいmainの速度レバー契約と今回の範囲

提出前にmainのPR [#3](https://github.com/chameleonjp-lab/machimamore/pull/3)（merge `4cefae9`）の [THROTTLE_LEVER_CONTRACT.md](THROTTLE_LEVER_CONTRACT.md) と [THROTTLE_LEVER_ADAPTER.md](THROTTLE_LEVER_ADAPTER.md) の全文を読んだ。契約は「進行中の独立実装PRは勝手に編集しない」、adapterは「統合は飛行/input/設定コードがmainへ届くまでblocked」と明記する。新しい文書・fixtureは作業ブランチのmerge `aed2319` で保持し、今回のfreezeへレバー実装・保存移行を追加しない判断はこの停止条件に沿う。ゲームのソースは変更していない。

速度レバーは統合待ちであり、本作が対応済み・受入済みとは扱わない。R20・R60〜R63、タッチコントロール数、配置・保存の既存証拠は旧Normal4ボタン/Easy1ボタンの契約に対するものとして限定する。新しいNormal3コントロール、アナログ入力、v2保存移行と関連受入は、runtimeがmainへ届いた後に契約どおり接続・検査する別作業としてpendingに残す。

### 配布manifest保存のworkflow差分承認（2026-10-05 UTC）

独立担当6.1Sol Extra Highは、GitHub Actionsのupload対象へ `dist/artifact-manifest.json` を1行追加する差分を、証拠保存のためのworkflow変更としてソース限定で承認した。`check:dist` がこのファイルを生成し、その後のPlaywright用serverはdev/previewだけを起動してdistを再buildしないため、upload時まで保持する順序になっている。検査コマンド・権限・公開先・製品の動作は変更していない。

先行CIから取得された `artifacts/ci-first-source-manifest.json` と現在のmanifestの各78エントリを独立に比較した。content digestは `0e0a5a4211fe45f0f761af17fd1f2c6ab67ec7d6da9d4b46baf433596d714b9f` から `1a039a80283101b8ad6aa7e8d58dfdf6847c3ea171f57d0933047fa5fbf49890` へ変わり、差は `.github/workflows/checks.yml` の1ファイルだけ（895→935 bytes）だった。残る77エントリと全製品・テスト・入力driverのbytesは一致する。現在の78実ファイルのSHA-256とファイル配列のcontent digestも再計算し、不一致0を確認した。保存用 [source-manifest.json](evidence/source-manifest.json) は現在のmanifestと一致する。

先行CIのmanifestはmerge commit `7275d607e44eaa82ea13eae65c0eeb9ab87940e0`、`workingTreeDirty:false` と旧digestを記録し、その取得済みbrowser reportのstatsは33 pass・3 skip・0 unexpected・flaky0・errors0だった。これは旧workflow版の実行記録であり、新しい提出headのCI成功と書き換えない。新digestは作業treeの候補を表し、最終headでCIを再実行して結び付ける。既存runtime証拠が旧digestに属することと、workflow以外のbytesが一致することを別々に記録する。本差分のレビューではテスト・ブラウザ・GPU検査を実行しておらず、全作戦・長時間性能やreleaseの承認を追加しない。

### duration driverの直列化修正と新freeze（2026-10-05 UTC）

保存した [WebKitの失敗記録](evidence/browser-visual/performance-diagnostics/2026-10-05T04-39-06.370Z-performance-tsx-helper-failure.json) は `page.evaluate: ReferenceError: Can't find variable: __name`、status `failed` で、`performance` の測定結果を持たない。独立担当6.1Sol Extra Highは、その原因となる `steadyFrameSample` の名前付きarrowを、配列へpushする匿名functionとinlineのpercentile計算へ置き換えた差分をソース限定で承認した。匿名functionは名前を推論する代入先を持たず、直列化するcallback内の参照はbrowser内で定義される値とbrowser APIだけになる。

最初のrAFからの測定時間、各rAF間隔、`ceil(p*n)-1` によるp50/p95/p99、mean/max、`60_000` の測定呼出しは同じである。Playing/作戦IDによる連続測定判定、測定中にResumeしない条件、900秒の時計・Pause中断・資源観測の経路も変更していない。レビューした差分にblockingなソース欠陥は見つからなかった。

先行CIの78エントリへ前節で承認したworkflowエントリだけを反映し、前freezeのdigest `1a039a80283101b8ad6aa7e8d58dfdf6847c3ea171f57d0933047fa5fbf49890` を独立に再構成して照合した。新freezeの78エントリとの差は `scripts/browser-evidence.ts` だけ（29,879→30,062 bytes、SHA-256 `0fae86128b6ed98d221f91c4362cc861c66e2fc4e93d3e43ceae63a929fa7f2a` → `1a13a312c61091c45ff68da4dea6b15bb6b57bf056594865e05010618fb7394c`）で、残る77エントリと全製品・browser test・他の入力driverは一致する。現在の78実ファイルとcontent digestを再計算し、不一致0、digest `6f0078ca79e4c38e89954e48cc7486c03c6f046261f401ebf4e3fd34fde55794` を確認した。保存用manifestも一致する。

この担当は検査driverを編集せず、テスト・ブラウザ・GPU検査を実行していない。新しいduration driverによる60秒/900秒の実行結果と最終headのCIは別の証拠として確認する。旧driverの失敗を成功へ変換せず、本ソース承認だけでは性能・耐久・releaseをpassにしない。

### 60秒実行記録の静的照合と初回PR採用後の状態

独立担当は [60秒summary](evidence/browser-visual/performance-webkit-568x320-2026-10-05/summary.json) と [raw report](evidence/browser-visual/performance-webkit-568x320-2026-10-05/report.json) を読取りで照合した。60,008ms・2,816 rAF間隔、mean21.309659ms、p50=17ms、p95=36ms、p99=54ms、max226ms、同じ作戦ID25でPlayingのtick38→3642、pauseReasonsなし、gapCount2→2は双方で一致する。mean×sampleCountも60,008msと一致する。明示Resumeの2件はsetup/warmupの記録であり、測定中の回復ではない。

同profileの10回Homeのgeometry71・texture4・program14への復帰、warmup/再出撃で観測した最大数と上限比較、およびPNG4件とraw reportの保存bytes/SHA-256も不一致0を確認した。これは保存済み実行記録の静的照合であり、担当自身がブラウザを実行したという意味ではない。rAF全2816件からpercentileを独立再計算したとは主張しない。

測定は完了したが、p95=36msは33.4ms目標、p99=54msは50ms目標をそれぞれ超える。模擬profileのR93比較は両方未達として保持する。browserのApple GPU/vendor文字列は物理端末の証拠ではなく、GPU完了時間・実機Safari性能のpassへ換算しない。900秒の完了記録と後続の最終head CIは別ゲートであり、総合runtime/release承認は追加しない。

rootが再取得したPR情報により、初回実装PR [#4](https://github.com/chameleonjp-lab/machimamore/pull/4) は2026-10-05T04:42:29Zに本人側で採用され、mainは `7d65c325f522af5adaffa22cb39ef1b45c4b8ba4` となったことを現状記録へ反映した。担当agentはmain merge・配備を行っていない。前節の「runtimeがmainへ届くまで」の停止条件は初回提出時の理由として保持する。runtime到達後のレバー統合は別のfollow-upとしてpendingであり、当時DraftだったPR [#5](https://github.com/chameleonjp-lab/machimamore/pull/5)（head `71a092c`）のworkflow・測定driver修正と最終証拠へ混ぜない。固定要件/計画/移行調査・contract/adapterは変更していない。

rootからの採用情報では、code-fix PR #5も2026-10-05T04:55:59Zに本人側でmergeされ、現在のmainは `fa323bef322eb62f350011f3bd5f8af3935e17d9` である。担当agentによるmerge・配備ではない。最終の文書・compact証拠は別のDraft PR [#6](https://github.com/chameleonjp-lab/machimamore/pull/6)（`docs/final-verification`）へ提出する。レバー契約の統合・新受入は引き続き別作業でpendingとし、既存ゲームの証拠をレバー対応の証明へ読み替えない。

### code-fix headのCI artifact照合

独立担当は [ci-code-head.json](evidence/ci-code-head.json) の保存metadataを静的に照合した。head `71a092c70b47d76d9b248a21cfa8a0422a3fc905`、run [37265109021](https://github.com/chameleonjp-lab/machimamore/actions/runs/37265109021) はsuccess、browser statsは33 expected・3 skipped・0 unexpected・flaky0を記録する。clean merge ref `926772771ceb57fbc2f0c1e5b4aac5edc7be917d` のファイル配列からdigestを再計算し、`6f0078ca79e4c38e89954e48cc7486c03c6f046261f401ebf4e3fd34fde55794` と一致した。CIの78エントリはローカルmanifestと同一で、全78実ファイルのbytes/SHA-256不一致0だった。

追加したupload対象の配布manifestも取得済みmetadataに含まれ、4エントリがローカルの配布manifestと一致する。実際のHTML・JS・CSS・NOTICEのbytes/SHA-256も不一致0を確認した。これは保存済みCI metadataと現在のファイルの照合であり、独立担当自身によるCI・製品テスト実行ではない。最終証拠・文書headの成功は先取りせず、[PR #6の最新checks](https://github.com/chameleonjp-lab/machimamore/pull/6/checks) で確認する。900秒実行の完了、模擬R93の目標未達、物理端末と公開の未確認範囲はCI成功と分ける。

### 900秒の観測証拠に限った承認

独立担当6.1Sol Extra Highは、ローカルの9,947,365-byte raw reportと [endurance summary](evidence/browser-visual/endurance-webkit-568x320-2026-10-05/summary.json) を静的に照合し、このWebKit 26.5・568×320・DPR1・Normal・音ON・AA OFFの観測証拠を範囲限定で承認した。900,190msのwall-clock window、177件のPlaying標本、最初33ms/最後899,764ms、約5秒間隔（5,019〜5,479ms）、同じ作戦内のtick増加、全標本のgapCount2、8件の自然なResultから可視Retryへの作戦ID25→33の連鎖が整合する。windowは複数作戦とResult/Retryの遷移を含み、単一作戦の能動時計900秒という意味ではない。

177標本から最大数を再計算すると、機体16・ビーム30・弾28・装飾1・AudioContext1・音source6・effect source5で、記録した上限内だった。geometry71・texture4・program14は全標本で同一で、測定前の10回Homeも同じwarm baselineへ戻る。summaryの最大/最小とbaseline、Retry一覧・経過時間・profile、raw reportおよびPNG5件のbytes/SHA-256はいずれも不一致0だった。raw reportのSHA-256は `aeb4351f88a3c72f42ffb0b529c67594483705a2ea1a04971b5b623a39a32f8c`。現在の78ソース実ファイルもdigest `6f0078ca79e4c38e89954e48cc7486c03c6f046261f401ebf4e3fd34fde55794` と一致する。

ソースの測定window内にはResume経路がなく、観測したPauseは中断、自然なResultだけが可視Retryへ進む。記録した2回の120ms凍結確認・可視Resumeはwindow前のsetupであり、終了PNGの前後もPlayingで追加回復なしだった。外部通信試行は空で、driverは例外なしに完了している。ただしdriverはbrowser `pageerror` イベントを収集していないため、ブラウザpage error0を実測したとは扱わない。

これは約5秒ごとの標本と保存済み実行記録の承認であり、全frameの最大負荷、JavaScript heap/GPU memory bytesの安定、GPU完了時間、物理端末の性能・操作感・聴感、公開版の合格を保証しない。60秒の模擬R93目標はp95=36ms/p99=54msで両方未達のまま残す。担当はテスト・ブラウザ・GPU検査を実行しておらず、PNGのhash確認を独立目視と呼ばない。raw/PNGはローカル保存の証拠で、公開repoに転送済みとは主張しない。公開用compact標本の静的照合は次節に記録する。最終文書headのCIは [PR #6の最新checks](https://github.com/chameleonjp-lab/machimamore/pull/6/checks) へ結び付ける。総合release・実機passの承認は追加しない。

### 公開用compact証拠の静的照合と範囲限定承認

独立担当は [endurance observations.json](evidence/browser-visual/endurance-webkit-568x320-2026-10-05/observations.json) の177行をローカルrawと全件照合した。各行はrawの全観測fieldを保持し、timingだけをgapCount/maxFrameGapへ投影する。追加した`screenAtPoll`を除く全177行、8件の作戦遷移、10件の再出撃baseline、setup回復・warmup、profile・測定window・全体実行時刻が一致した。最大/最小は177行から独立再計算してsummaryと一致した。rawの共有最大値はsetupからwindow終了まで更新されるため、誤った`maximumObservedBeforeEnduranceWindow`名を`maximumObservedAcrossSetupAndWindow`へ訂正した。`screenAtPoll`はrawの別記録ではなく、保持したPlaying phaseとdriverの画面/Retry制御から導いた注記であると明示した。データ値・測定方法・製品ソースは変更していない。

訂正後のcompactは128,533 bytes、SHA-256 `0b62df406e5f196179d4f17291d0e52d4e20e4e8f7fbb2849ef74c4c0ba9d4da`。summaryのprojection bytes/hashも一致する。900,190msはsetupを除くwall-clock windowで、記録したstartedAt/finishedAtはsetupを含む全体実行時刻である。windowの絶対開始時刻を別に実測したとは扱わない。

[Normal input-trace.json](evidence/browser-visual/campaign-webkit-568x320-normal/input-trace.json) の1,331行と [Easy input-trace.json](evidence/browser-visual/campaign-webkit-568x320-easy/input-trace.json) の1,319行も、それぞれローカル`result.json`の全inputTraceと順序・値が一致した。resultText、凍結した結果/Retryの選択field、pageErrors・外部通信試行、実行metadata、raw bytes/SHA-256はいずれも不一致0だった。Normal compactは720,845 bytes・SHA-256 `cb4bc3f784cff4bd2eafd8acf7674afad362d5bb11796dc910be4f9c899d362e`、Easyは716,324 bytes・SHA-256 `24fda9bddbe695787f331baf792467ed48c40c12d7a342ee396c0480e55cc6ba`。各行のaccepted-input観測はその行の操作前であるというdriverの記録順を保持する。

campaignの実行digestは`0e0a5a4211fe45f0f761af17fd1f2c6ab67ec7d6da9d4b46baf433596d714b9f`のまま保持する。現在の`6f0078ca79e4c38e89954e48cc7486c03c6f046261f401ebf4e3fd34fde55794`までの78-entry manifest差はworkflowとduration driverの2ファイルのみで、全製品とcampaign driverのbytesは一致した。compact照合を別digestで実行したcampaignへ読み替えない。

以上のcompact投影と証拠境界を範囲限定で承認する。enduranceのbrowser pageerrorは未収集、heap/GPU memory・GPU完了時間・物理端末は未確認、模擬R93の両目標は未達のままである。大きいrawとPNGはローカル保存に限定し、この文書提出で公開repoへ転送済みとは主張しない。承認は保存済みJSONとソースの静的照合であり、新たなテスト実行・総合release・実機合格の承認ではない。最終文書headのCI成功は [PR #6の最新checks](https://github.com/chameleonjp-lab/machimamore/pull/6/checks) で別に確認する。
