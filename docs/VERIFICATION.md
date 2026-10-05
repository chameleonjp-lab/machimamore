# 実装と検査の照合

本作の要件・計画は初期文書として保持し、提出候補の実装状況をここに記録する。`pass` は記載した条件で実行した検査、`blocked` は必要な実機・出力機器が使えない項目、`not_run` は未実施を表す。ソース読取、単体fixture、通常DOM操作、初回の人による試遊、実機測定は異なる証拠である。

## 版と再現

固定版は [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)、ファイルごとの来歴は [PROVENANCE.md](PROVENANCE.md) を参照する。`npm run evidence:source` がコード・検査・設定のSHA256一覧とcontent digestを作り、`npm run check:dist` が配布ファイルのSHA256一覧を作る。CIは提出headごとに生成し、GitHub Actions artifactへ保存する。文書だけの変更はゲーム再生の変更と区別する。

基本検査は `npm ci --ignore-scripts`、`npm test`、`npm run test:review`、`npm run test:evidence`、`npm run build`、`npm run check:dist`、`npm run test:browser`。buildには製品コードと検査スクリプトのTypeScript検査を含む。長時間検査と全作戦比較は通常CIとは別の実測記録である。

初回実装PR [#4](https://github.com/chameleonjp-lab/machimamore/pull/4) は2026-10-05T04:42:29Zに本人側で採用され、mainは `7d65c325f522af5adaffa22cb39ef1b45c4b8ba4` となった。担当agentはmain merge・本番配備を実行していない。後続Draft PR [#5](https://github.com/chameleonjp-lab/machimamore/pull/5)（head `71a092c`）のworkflow・測定driver修正と最終実行証拠を初回採用済みの版から区別する。後続の最新headのCIと公開は別ゲートである。

## 受入条件との対応

この表は実装と検査対象の対応であり、各行の受入全体がpassしたという意味ではない。実行結果と未実施の最終ゲートは後節に記録する。

mainの速度レバー契約PR #3は [THROTTLE_LEVER_ADAPTER.md](THROTTLE_LEVER_ADAPTER.md) の順序どおり別の統合作業を待つ。飛行runtime未到達は初回提出時の状態であり、PR #4採用後はruntimeがmainに存在する。本提出候補のR20・R60〜R63、タッチ数・配置・保存と関連受入の証拠は、固定計画版のNormal4ボタン/Easy1ボタンに限る。新しいNormal3コントロール、レバー入力・アクセシビリティ・v2保存移行・共通35fixtureの実入力接続は未実施であり、旧契約の検査結果を新契約のpassへ流用しない。レバー実装は後続のworkflow・測定driver修正PR #5へ混ぜない。

| 条件 | 実装と検査の対象 | 証拠と限界 |
| --- | --- | --- |
| A01–A03 | 50個の一意token、A/Q/R/D、予約競合、自機優先、179/180tick、塞がれた出撃点 | `simulation-roster`、`simulation-lifecycle` unit。予約中の機体は二重消費しない |
| A04–A07 | 自機復帰、予備0で最小token僚機引継ぎ、Qだけ生存、最後の敵、同時全滅、街0、確定凍結 | `simulation-lifecycle` unit。終端fixtureと通常全作戦は別記 |
| A08 | 2門の実弾計数、両弾倉、359/360tick、保持再開、僚機装填、プール不足異常停止 | `flight-ammunition`、`simulation-combat` unitと通常操作の検査 |
| A09 | 同じ受理入力による共通飛行・5秒宙返り、固定カメラと投影 | `flight-parity`、`flight-assist` unit。固定Kaisenの比較範囲を来歴に明示 |
| A10 | 直線・実静止・3D移動、有限速度/加速度、領域/建物、同位置、役割と街予約 | `simulation-ufo` unitと独立レビューIR01/IR07/IR10。画面外も同じtickで更新 |
| A11–A12 | 警告30tick、12tick間隔×5、各60tick、最後の実ビーム寿命から180tick、固定S/P | `simulation-laser`、`simulation-ufo` unit。0～4本中断、割当拒否を含む |
| A13–A15 | 最近接遮蔽、太さ付き街AABB、連続接触積分、高速横切り、部分寿命、射手破壊後のビーム | `simulation-laser`、`simulation-combat`、独立数値参照 `collision-property`。30/60/120Hz再生一致も別検査 |
| A16 | 20区画×250HP、実HPまでの損傷、破壊一度、街0、実際の衝突 | `simulation-score-city`、`simulation-combat`、`simulation-lifecycle` unit |
| A17–A19 | 独立配点例、分母0、実弾H/N、味方誤射、過剰損傷・再通知・死体加点なし、D≤4000 | `simulation-score-city`、`simulation-combat` unit。自機/僚機の損失と与損傷の所有を区別 |
| A20 | 能動・無操作・保持・墜落反復・最後の敵放置の同seed比較 | 全作戦比較の記録を下記に示す。有限探索を全プレイの保証にしない |
| A21–A23 | 固定計画版の9キー/Normal4・Easy1ボタン、指別所有、互換click、blur、IME、保存/取消/復元/未来形式/今回だけ | `controls-*` unit、`input-recovery`、`game-flow` browser。最終36件は33 pass・3 scoped skip・0 fail。レバー所有・入力とv2保存受入は未実施。実機IME/タッチ感は未確認 |
| A24 | Home/飛行/停止/説明/設定/結果/再出撃、残機・出撃・予備の表示 | `game-flow`、通常DOM全作戦。WebKitのNormal/Easy通常入力で自然な勝利→結果凍結→Retryまでpass。結果fixtureを通常勝利と呼ばない |
| A25 | 原作機体、UFO、母艦、港と街、予告線/実ビーム、損傷と危険の表示 | 保存画像を実際に開いて確認。Web Audioの出力機構/資源検査と聴感は分ける |
| A26 | 固定計画版の操作UIについて指定5寸法、200%文字、safe-area、scroll、Tab/Esc、ラベル、音OFF、動作軽減 | `mobile-layout` browser。最終Chromium/WebKit検査は33 pass・3 scoped skip・0 fail。レバーの44px領域・縦横配置・focus/slider受入は未実施。実機アドレスバー/VoiceOver/点滅実測は未確認 |
| A27 | 停止中の論理凍結、非表示/blur/長gap/WebGL喪失/描画失敗と明示再開 | lifecycle unit、`input-recovery` browser、独立レビューIR09。描画準備失敗ではStart不可 |
| A28 | 実体16、40ビーム、2048弾、瓦礫≤24、音source≤10、10再出撃、15分 | 最大描画fixture、`resource-bounds`、長時間記録。両ブラウザの10再出撃はpass。追加WebKit profileの60,008ms測定は継続Playingだが模擬R93目標は両方未達。900,190msの固定window、177観測・8自然Retryを完了。GPU完了時間と実機Safari性能は未測定 |
| A29–A30 | 外部通信試行0、DB/ランキング/debug不在、NOTICE、依存と配布一覧 | 全browser通信fixture、実distの `production`、`check:dist`。Three.js LICENSE原文の一致を検査 |
| A31–A32 | 固定要件/計画head、依存差分、最終候補の検査とCI | 本文の版記録、Draft PR、GitHub CI。初回PR #4はCI成功・本人採用済み。後続PR #5のcode head `71a092c` もCI成功。最終証拠・文書更新後のheadは [PR #6の最新checks](https://github.com/chameleonjp-lab/machimamore/pull/6/checks) で確認する。main直接push/代理merge/自動mergeは行わない |
| A33 | 本人採用後のmain/tree/artifact/公開URL照合 | PR #4の本人採用を記録。本番配布artifact・公開URLとの照合は`not_run`。P22の公開は別ゲート、[DEPLOYMENT.md](DEPLOYMENT.md)に手順を保存 |

## 実行結果

2026-10-05 UTC、Node24.19.0 / npm11.9.0。修正前・競合負荷下・HMR中断の記録は診断用であり、最終候補のpassへ流用しない。

### 純粋論理・ビルド・独立式

unit・独立幾何・保存得点の実行は最終responsive CSSとbrowser harness変更より前であり、純論理digestは後述の値から変更していない。保存した実出力と最終freeze buildの範囲は [evidence/core-checks.json](evidence/core-checks.json) を参照する。これらを最終全ブラウザsuiteや最新headのCIのpassとは扱わない。

`npm ci --ignore-scripts` は37パッケージを再導入。`npm test` は98/98 pass、fail/skip0。`npm run test:review` は旧丸角交差との30,275例の不一致0、安全停止距離2例と回避不可1例の有限加速度/異常停止を再確認した。`npm run build` は製品と検査スクリプトの型検査を含めpass。主JSは710.76KB（gzip189.76KB）で、Viteの標準500KB警告は残す。`check:dist` はHTML/JS/CSS/NOTICEの4ファイルを検証し、Three.jsのLICENSE原文一致、読取debug hook不在、外部接続設定不在を確認した。

### 合法入力による137作戦

ルール版`machimamore-2`、純論理digest `8a9232e126b30fcf9afea1e01c28f8ee3411faa1a2dc076faab0f570ae4c33bf`。能動操縦driverのdigestは`48aca7032cb6807ab2797d9d47b22bbfe4453c55f76269adbcb8e60ff3828051`。調整seed6個と固定確認seed6個、両モード、5入力方針の[全120行](evidence/balance-final.json)を保存した。[Easyの有効な右旋回キー保持12行](evidence/turn-held-easy.json)と[Normal seed1の街攻撃/能動/無操作/味方攻撃/破壊区画攻撃5行](evidence/normal-negative-comparison.json)も別に保存する。

137件で114勝・23敗、内部fault0、600秒調査上限による打切り0。全件を実装の配点関数に依存しないliteral式で再計算し、得点不一致0、有限HP、H≤N、P+W=味方Dを確認した。`npm run test:evidence` は保存データと現行ソース/入力方針のdigest一致もCIで検査する。caseの`cpuMs`は2worker並列下の経過wall時間で、CPU使用時間や性能benchmarkではない。

| 能動操縦対無操作 | Easy | Normal |
| --- | --- | --- |
| 能動操縦の勝利/自機損失0 | 12/12、全件P0 | 12/12、全件P0 |
| 得点差の平均 | +2463.17 | +338.42 |
| seed別の改善/悪化/同点 | 12/0/0 | 5/6/1 |
| 確認seed6個の平均差 | 全行を保存 | +135.00 |

Normalは結果が混在し、全seedで無操作優位を解消したとは言わない。Easyの能動操縦は右旋回保持を11/12seedで上回り、平均差は+2258.08。Easyの`fire-held`は無効なSpace保持に相当して無操作と同じため、有効なキーを追加して検査した。連続墜落は両モードで11/12敗北だが、seed71は勝利する例外を残した。Normalの街攻撃seed1は街0・tick4432で敗北、score−33677。無限加点や隠し失格/無操作罰点は加えていない。

能動driverは通常の受理FlightInputだけを渡し、開始後のHP/敵/時計/点数を変更しない。観測と複製機体による予測を用いる自動入力であり、人の初見試遊ではない。[採用前の候補比較と不利な条件](evidence/cadence-comparison.md)を最終版から区別する。有限seed検査は全プレイの保証ではない。

### 通常ブラウザ・性能・画像

固定ソースの最終Chromium/WebKit 36件は33 pass・3 skip・0 fail・flaky0。2026-10-05T04:12:19.485Z開始、530371.792ms。skipは両backendのheadless native focus変化を観測できない2件と、WebKitのChromium-CDP専用2指検査1件。合成blurと両backendのWebGL喪失/復旧は実行した。最大描画・音源上限・10再出撃も両backendでpass。全36行と実行条件は [最終summary](evidence/browser-visual/final-browser-summary-2026-10-05.json) に保存した。WebKit 26.5、568×320、seed1296122696、通常のmouse/keyboard入力で両モードが自然な勝利に到達し、結果でtick/入力が凍結、Retryで作戦ID更新・双方50機・得点0を確認した。追加WebKit profileの60秒測定は完了したが模擬R93目標は両方未達で、900,190msの継続測定も完了した。部分検査や5秒AA診断、停止論理にPlaying CSSだけを適用した警告fixtureから、これらの成功を推論しない。提出前の実行結果と条件は [BROWSER_VERIFICATION.md](BROWSER_VERIFICATION.md) に追記する。画像取得後のframe停止だけで画像内容を推定せず、撮影前後の観測と実際に開いたPNGを分けて記録する。60秒/900秒の測定中に安全停止を自動解除しない。

### 通常DOM全作戦と追加操作検査

| モード | 能動作戦時間 / 得点 | 損失と街 | 明示的frame停止再開 |
| --- | --- | --- | --- |
| Normal | 112.50秒 / 69,735 | 自機0・僚機30、街1区画破壊・82.74%残存 | tick0と366の2回 |
| Easy | 111.95秒 / 65,448 | 自機0・僚機27、街破壊0・81.54%残存 | setup tick0の1回 |

[Normal記録](evidence/browser-visual/campaign-webkit-568x320-normal/summary.json) と [Easy記録](evidence/browser-visual/campaign-webkit-568x320-easy/summary.json) は各1,331/1,319入力行、撮影前後、損失・全得点内訳・再出撃、raw hashを保持する。開始後の状態書換えは行わず、driver側の複製状態から通常入力を送る。両件でpage error/外部通信試行0。画像は飛行・戦闘・結果・Retryを実際に開いた。横画面の結果画像はscroll領域の上部であり、全内訳はJSONに保存した。能動操縦driverの勝利は人の初回試遊の代用ではない。

WebKit 393×852の追加操作検査は9キーを設定画面から保存し、4方向と加減速、宙返り448能動tick（この宙返り中の停止0）、保持射撃・共有装填、設定を閉じた後の停止clock、墜落時の保持解除・3秒復帰・新しい操縦の最初のキーを確認した。準備と保持射撃の2回のframe停止は120ms凍結を確認後に見えるResumeで再開した。page error0、実行前後のindexと全src TS/CSS hashが一致。これは停止を含む機能検査で、無中断性能のpassではない。

### 60秒の実測と目標未達

[WebKit 26.5のsummary](evidence/browser-visual/performance-webkit-568x320-2026-10-05/summary.json) と [raw report](evidence/browser-visual/performance-webkit-568x320-2026-10-05/report.json) を保存した。568×320、DPR1、Normal、seed1296122696、音ON、AA OFFで60,008ms・2,816 rAF間隔を測定し、mean21.31ms、p50=17ms、p95=36ms、p99=54ms、max226msとなった。同じ作戦ID25でPlayingのtick38→3642、停止理由なし、gapCount2→2を記録し、連続作戦の条件を満たす。明示Resumeの2回は測定前のsetup/warmupである。

模擬profileのR93比較はp95目標33.4ms、p99目標50msを両方満たさない。status `completed` は測定の完了であり、性能目標のpassではない。同profileの10回Homeはgeometry71・texture4・program14に戻り、観測したwarmup/再出撃の実体・音源数は上限内だった。rAF間隔はGPU完了時間ではなく、公開されたApple GPU/vendor文字列から物理Safari端末や実機R93の合格を推論しない。900秒の結果は次節に記録し、実機性能は別の未確認項目とする。

### 15分継続の観測

WebKit 26.5、568×320、DPR1・renderer pixel ratio1・AA OFF（samples0）、Normal/default seed1296122696/rules machimamore-2。同じ測定profileで900,190msの固定windowを完了し、約5秒ごとの177観測は全件Playingだった。自然な結果から見えるRetryを8回使用し、測定中のResumeは行っていない。Pauseを観測した場合は中断として記録するdriverのままである。準備を含むrun時刻04:46:44.313Z〜05:02:16.938Zを900,190msの測定windowと混同しない。

実体max16、laser30、弾28、装飾1、audio context1/source6/effects5で観測上限内。geometry71・texture4・program14とcontext1は全177観測で一定だった。測定前10再出撃のHome baselineも一致。外部通信試行0、driver例外による中断なし。ブラウザーの個別pageerrorはこの長時間driverで収集しておらず、pageerror0を検証したとは言わない。WebKit heap値、GPU memory/完了時間は取得できず、観測した資源数の安定を全メモリの無漏洩へ一般化しない。

[15分記録](evidence/browser-visual/endurance-webkit-568x320-2026-10-05/summary.json) は全window・transition・extremaとraw hashを保持する。PNGは5枚を実際に開いた。大きな全snapshotと画像のローカル保持/公開転送範囲は後述の注意を参照する。R93の模擬目標未達、実機未確認とは分けた資源・継続の検査である。

### 候補版の証拠とCI

最終ローカル全suite・通常全作戦のverification digestは `0e0a5a4211fe45f0f761af17fd1f2c6ab67ec7d6da9d4b46baf433596d714b9f`。後続の `1a039a80283101b8ad6aa7e8d58dfdf6847c3ea171f57d0933047fa5fbf49890` は、CI保存対象に既存のdist/artifact-manifest.jsonを加えたworkflowだけの変更であり、78ファイル中77のbytesは同一。製品・検査・driverは変更していない。両freezeを独立読取レビューした。測定スクリプトの最初の実行はTSX/esbuildがブラウザ用callbackへ付けた `__name` により、60秒のsampling前に失敗した。匿名callbackと同じpercentile式のinline化で外部helperへの依存を除き、型検査と独立読取レビューを通した。最終verification digest `6f0078ca79e4c38e89954e48cc7486c03c6f046261f401ebf4e3fd34fde55794` は、初回CI版からworkflowとこの測定driverだけの2ファイル差分。製品と36件のbrowser-testは変更していない。実測合否は別記する。

[最初の実装headのCI](https://github.com/chameleonjp-lab/machimamore/actions/runs/37263638133) は全step成功、browser33 pass・3 skip・0 fail。CI artifact内のclean source manifest（PR merge ref7275d607）も `0e0a…` と一致した。[保存した照合](evidence/ci-first-head.json) を最終提出headのCIと区別する。最終証拠commitのCIは別途確認する。

[code-fix headのCI](https://github.com/chameleonjp-lab/machimamore/actions/runs/37265109021) はhead `71a092c70b47d76d9b248a21cfa8a0422a3fc905` で成功し、browser33 pass・3 skip・0 fail・flaky0となった。[取得済みartifactの照合](evidence/ci-code-head.json) はclean merge ref `926772771ceb57fbc2f0c1e5b4aac5edc7be917d`、78エントリのdigest `6f0078ca…55794` を記録する。独立担当も全78実ファイルと4配布ファイルのbytes/SHA-256一致を確認した。これは最終証拠・文書更新前のcode headの成功であり、後続の文書headへ成功を先取りしない。最終提出headの結果は [PR #6の最新checks](https://github.com/chameleonjp-lab/machimamore/pull/6/checks) で確認する。

ローカルで保存・目視した画像の一部について、指定公開repoへの転送が自動承認レビューで拒否された。理由は画像payloadの明示許可が確認できないこと。画像をworkspaceに保持し、送信許可はユーザーへ確認中。重複するper-frame履歴を含む大きな全snapshotもローカルに保持し、公開JSONには全観測行の投影・集計・raw hashとその選択方法を残す。転送未承認の画像をPRに存在すると扱わない。JSONには画像のpath/hash/寸法/実際に開いた範囲を記録する。

## 実機と体験の未確認範囲

物理iPhone/iPad、Safariの実機GPU、タッチの操作感、端末スピーカーの聴感、VoiceOver、実機IMEはこの環境に無いため `blocked`。ブラウザのmobile viewportやLinux WebKitを実機passへ換算しない。初回の人による全作戦試遊、光の点滅を専用機器で測る検査、3D戦闘の非視覚プレイ対応は `not_run`。生成音のcontext/source検査が通っても、実聴感や全機種での性能を保証しない。

P19は、この条件・未確認範囲・影響を提出する工程として扱う。PR #4のmain採用は本人側で完了した。本番配備・公開URL照合は未実施であり、P22の公開ゲートは残る。

後続の修正PR [#5](https://github.com/chameleonjp-lab/machimamore/pull/5) は2026-10-05T04:55:59Zに本人側で採用され、mainは `fa323bef322eb62f350011f3bd5f8af3935e17d9` になった。上記のDraft候補という記述はその提出時点の記録である。最終検証資料は別のDraft PR #6へ提出し、担当agentはマージ・公開を行わない。新しい検査PNGと長時間・作戦の大きなraw記録はローカル保持とし、公開資料には全入力行・全177観測のJSON投影と元記録のhashを保存する。
