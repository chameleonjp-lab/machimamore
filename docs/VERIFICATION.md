# 実装と検査の照合

本作の要件・計画は初期文書として保持し、提出候補の実装状況をここに記録する。`pass` は記載した条件で実行した検査、`blocked` は必要な実機・出力機器が使えない項目、`not_run` は未実施を表す。ソース読取、単体fixture、通常DOM操作、初回の人による試遊、実機測定は異なる証拠である。

## 版と再現

固定版は [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)、ファイルごとの来歴は [PROVENANCE.md](PROVENANCE.md) を参照する。`npm run evidence:source` がコード・検査・設定のSHA256一覧とcontent digestを作り、`npm run check:dist` が配布ファイルのSHA256一覧を作る。CIは提出headごとに生成し、GitHub Actions artifactへ保存する。文書だけの変更はゲーム再生の変更と区別する。

基本検査は `npm ci --ignore-scripts`、`npm test`、`npm run test:review`、`npm run test:evidence`、`npm run build`、`npm run check:dist`、`npm run test:browser`。buildには製品コードと検査スクリプトのTypeScript検査を含む。長時間検査と全作戦比較は通常CIとは別の実測記録である。

## 受入条件との対応

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
| A21–A23 | 9キー/Normal4・Easy1ボタン、指別所有、互換click、blur、IME、保存/取消/復元/未来形式/今回だけ | `controls-*` unit、`input-recovery`、`game-flow` browser。実機IME/タッチ感は未確認 |
| A24 | Home/飛行/停止/説明/設定/結果/再出撃、残機・出撃・予備の表示 | `game-flow`、通常DOM全作戦。結果fixtureを通常勝利と呼ばない |
| A25 | 原作機体、UFO、母艦、港と街、予告線/実ビーム、損傷と危険の表示 | 保存画像を実際に開いて確認。Web Audioの出力機構/資源検査と聴感は分ける |
| A26 | 指定5寸法、200%文字、safe-area、scroll、Tab/Esc、ラベル、音OFF、動作軽減 | `mobile-layout` browser。実機アドレスバー/VoiceOver/点滅実測は未確認 |
| A27 | 停止中の論理凍結、非表示/blur/長gap/WebGL喪失/描画失敗と明示再開 | lifecycle unit、`input-recovery` browser、独立レビューIR09。描画準備失敗ではStart不可 |
| A28 | 実体16、40ビーム、2048弾、瓦礫≤24、音source≤10、10再出撃、15分 | 最大描画fixture、`resource-bounds`、長時間記録。GPU完了時間と実機Safari性能は未測定 |
| A29–A30 | 外部通信試行0、DB/ランキング/debug不在、NOTICE、依存と配布一覧 | 全browser通信fixture、実distの `production`、`check:dist`。Three.js LICENSE原文の一致を検査 |
| A31–A32 | 固定要件/計画head、依存差分、最終候補の検査とCI | 本文の版記録、最終Draft PR、GitHub CI。main直接push/代理merge/自動mergeは行わない |
| A33 | 本人採用後のmain/tree/artifact/公開URL照合 | `not_run`。P22は本人採用後の別ゲート、[DEPLOYMENT.md](DEPLOYMENT.md)に手順を保存 |

## 実行結果

2026-10-05 UTC、Node24.19.0 / npm11.9.0。修正前・競合負荷下・HMR中断の記録は診断用であり、最終候補のpassへ流用しない。

### 純粋論理・ビルド・独立式

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

提出前の最終結果を追記する。画像取得後のframe停止だけで画像内容を推定せず、撮影前後の観測と実際に開いたPNGを分けて記録する。60秒/900秒の測定中に安全停止を自動解除しない。

## 実機と体験の未確認範囲

物理iPhone/iPad、Safariの実機GPU、タッチの操作感、端末スピーカーの聴感、VoiceOver、実機IMEはこの環境に無いため `blocked`。ブラウザのmobile viewportやLinux WebKitを実機passへ換算しない。初回の人による全作戦試遊、光の点滅を専用機器で測る検査、3D戦闘の非視覚プレイ対応は `not_run`。生成音のcontext/source検査が通っても、実聴感や全機種での性能を保証しない。

P19は、この条件・未確認範囲・影響を提出する工程として扱う。P22のmain採用と本番公開は未実施。
