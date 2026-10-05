# 実装進行記録

2026-10-05 UTC。要件・計画の初期文書は過去時点の状態を保持し、本記録で実装状況を更新する。

## P00 固定版

| 対象 | 完全SHA / 確認 |
| --- | --- |
| 要件PR #1 head | `ff78357d1390b03ff2c81f9b2392b7e391cf95c4` |
| 計画PR #2 head | `40a93fbed02a4e87a900449527df5cfd71f03ff4` |
| 実装開始main | `38534ef0788a9876e73e2f819ad1db5cc63c3858` |
| Kaisen移行元 | `5f4565ee550ce9a1351516aa31ba9b5232c36e05` |
| FightFlight参照元 | `c2b313d37875b93458032d98636fcf5b5d30a138` |

要件PRは22:31:09Z、計画PRは22:31:26Zに本人側で採用済み。実装開始mainと固定計画headは同一treeで、差分は0。実装ブランチ `feat/machimamore-game` を開始mainから作成した。代理マージは実行していない。移行元は固定SHAを別の読取用checkoutに保持し、本作のコードだけを編集する。

## P01 実行基盤

Node 24.19.0 / npm 11.9.0。固定依存: Three.js 0.186.1、@types/three 0.183.1、Vite 8.3.1、TypeScript 5.9.3、tsx 4.21.0、Playwright 1.61.1、検査スクリプト用@types/node 24.19.1。lockfileを固定し、最終依存集合は37パッケージ。

クラウドのhomeへのキャッシュ書込みが許されないため、npm cacheを `/tmp/machimamore-npm-cache` に設定した。WebKit用OSライブラリはroot権限がないためDebian trixieの配布物をworkspace内へ展開し、ブラウザbundleの検査専用library pathに配置した。ゲーム配布物には含めない。Chromium 149とWebKit 26.5の実起動を確認。CIはUbuntu上でPlaywrightの通常の `install --with-deps` を使う。

## 担当

指定された標準形に従い、6.1Sol Maxが操縦・設定移植、純粋ゲーム論理、画面・描画を担当し、Luna Maxがブラウザ反復検査・記録を担当する。公開前の独立レビューは6.1Sol Extra Highで別途実施する。作品の採用・公開の最終判断は本人が行う。

各工程の最終状態と受入検査の対象・証拠は [VERIFICATION.md](VERIFICATION.md) に記録する。実機と本人採用後の公開は自動検査と分ける。

## 工程の照合

| 工程 | 実装・提出物 | 最終検査 |
| --- | --- | --- |
| P02–P04 | 固定60Hz、seed/作戦所有、各50tokenのA/Q/R/D、予約/復帰/引継ぎ、終端凍結 | 台帳・境界・同時成立のunitを実装。提出版の結果はVERIFICATIONへ記録 |
| P05–P07 | 固定版の機体/飛行/視線、9操作、設定保存、航空弾/弾倉/装填/誤射 | 共通軌跡と宙返り比較、入力/保存/弾倉unit、通常ブラウザ操作 |
| P08–P11 | UFO3移動状態/有限回避/予約、固定照準レーザー、街20区画、配点/H/N/結果 | 戦闘unitと独立幾何・障害fixture。独立レビューIR01–IR10修正済 |
| P12–P15 | 通常画面、都市/母艦/UFO、HUD/停止/説明/結果、初期OFF音/有界source、動作軽減 | 通常DOM全作戦と保存画像、音資源と実聴感を分離 |
| P16 | 合法入力の調整/確認seedと5入力方針、勝利/敗北、入力hash | 最終版137件完了。114勝/23敗、fault/打切り0、独立literal式137件一致。全行と不利なseedも保存 |
| P17 | 5画面寸法、200%文字、safe-area、scroll/focus/IME/保持入力回復 | Chromium/WebKitで通常操作と画像を確認。実機と区別 |
| P18 | 最大描画fixture、10再出撃、60秒定常/15分継続、資源上限 | 最終実測記録の時間・資源・中断有無をVERIFICATIONへ記録 |
| P19 | 実機の利用可能性と未確認範囲の報告 | 物理端末なし。影響をVERIFICATIONにblockedとして記録 |
| P20–P21 | 版hash/NOTICE/通信/配布一覧、CI、最終Draft PR | 提出headのCI完了を確認する |
| P22 | 本人採用後の公開手順 | not_run。main採用・本番公開は本人判断の後 |

## 進行中に採用された追補

提出前にmain `4cefae935236f2b8bb6a9e5895ddd05220883eb2` の速度レバー契約PR #3を確認し、文書を保持した。追補は先行実装PRへ無断で変更を混ぜず、飛行runtimeのmain採用後にadapterを統合する順序を明記している。本Draftは固定計画版のNormal4/Easy1を実装し、速度レバー・v2保存・共通35fixtureの実入力統合は未実施。追補の受入を合格と扱わない。
