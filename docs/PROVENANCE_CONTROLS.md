# 操縦・入力・設定の来歴

移植元は [Kaisen](https://github.com/chameleonjp-lab/kaisen/tree/5f4565ee550ce9a1351516aa31ba9b5232c36e05) の固定コミット `5f4565ee550ce9a1351516aa31ba9b5232c36e05`。別作品のファイルは変更していない。以下の元blobはその固定treeから取得した値である。

| 本作path | 元path | 元Git blob | 本作への適応 |
| --- | --- | --- | --- |
| `src/flight.ts` | `src/flight.ts` | `3019be9650863c11cc1c57f7bb7e09ab815c9c07` | 型を本作専用の最小飛行契約へ変更。飛行式・速度・宙返り・取消し・加減速計算は維持 |
| `src/flight-view.ts` | `src/flight-view.ts` | `87f83928a00092338391442ec2d7e87e3b4e33da` | 型importのみ変更。カメラ距離・FOV・姿勢・投影・照準円は維持 |
| `src/flight-assist.ts` | `src/flight-assist.ts` | `799efdfb97c3b9ba435e8eaf4080f65b74326773` | 艦向け追尾係数・船体の照準高さを除外。UFOの位置・自由3次元速度・論理遮蔽predicateを受け取る。航空標的用の操縦補助・35%/0.028radの射線補正を維持 |
| `src/ammunition.ts` | `src/ammunition.ts` | `eafa7449c789e6861a1f4ead20a2099723194dc4` | 本作rulesの288/96発・360tickへ接続。自機だけでなく僚機にも同じ共通装填関数を適用可能にする |
| `src/keyboard-settings.ts` | `src/keyboard-settings.ts` | `eb143ac27b3f65b66912d10b89ec17d0efc581b2` | 9操作へ削減。保存を `machimamore-keyboard-v1` に隔離。未知の操作キーを含む割当は採用しない |
| `src/input.ts` | `src/input.ts` | `0edbd1c5f9f07a2d1088539e188bab0329ab53f0` | 4つの飛行ボタンと9キーのみ。保持・単発・指別所有・互換click・解除・IME/修飾抑止を維持 |
| `src/control-settings.ts` | `src/control-settings.ts` | `5208c4da8ebe014552cae855d84c2574ab152292` | Normal4/Easy1、兵装項目・旧兵装配置migrationを除外。保存先を本作の3キーに制限。その他の画面・モード別配置・取消し・失敗rollback・未来version保護・今回だけ適用を維持 |
| `src/control-settings.css` | `src/control-settings.css` | `1235392f369ac27ef3056852512319fe6994300b` | 基本の外観を維持し、Kaisenの `style.css` に分かれていたdialog/preview/安全余白規則を補完。プレビューを実ボタン径・相対座標と一致させる |
| `src/dialog-focus.ts` | `src/dialog-focus.ts` | `5d10d15cb0b9d3de31871af98a7801d638a5055b` | バイト単位で維持 |
| `src/flight-types.ts` | `src/types.ts` の飛行契約 | `305febb2a712794be4b15f9c5696fd5c1da9a9cb` | 新しい最小型。航空機姿勢、9操作入力、弾倉、速度ベクトルを持つ標的に分離。作戦・残機・損傷・世代は本作simulationが所有 |

保存キーは `machimamore-keyboard-v1`、`machimamore-controls-v1`、`machimamore-controls-easy-v1`。Kaisen/FightFlightの保存を読み替えず、保存adapterは本作以外のキーへのwriteを拒否する。全localStorageの初期化や自動importを行わない。

## 検査の来歴と範囲

| 本作検査 | 元検査path | 元blob |
| --- | --- | --- |
| `tests/flight-parity.test.ts` | `tests/flight.test.ts` | `f9ca0f91efcd9068d7dcf01e45ef38ff6a721e54` |
| `tests/controls-settings.test.ts` | `tests/control-settings.test.ts` | `727b01547f2ff19ed47ad6e3a3374ebc512b2e27` |
| `tests/controls-keyboard.test.ts` | `tests/keyboard-settings.test.ts` | `c9147849eeaff964026792894b9f5bfaf7bb71f3` |
| `tests/controls-ownership.test.ts` | `tests/input-ownership.test.ts` | `074779d18ab47b48033350aa8e67e687127521b1` |
| `tests/controls-recovery.test.ts` | `tests/input-recovery.test.ts` | `8bdfa29826a71ae54f44d5dbabf477a52588424c` |
| `tests/controls-dialog-focus.test.ts` | `tests/dialog-focus.test.ts` | `8642f801fd14d59e96b130bf747d32bc2f0bd380` |

`flight-parity` は固定版の独立参照式を使い、65/85/110/141m/sから各600tickの連続操縦で位置・速度・姿勢を比較する。5秒宙返り、2秒クールダウン、操縦意図変更での滑らかな取消し、Easy巡航とNormal加減速も検査する。新しい `flight-assist` 検査は投影と描画の一致、45%のカメラbank、Normalの手動入力、遮蔽されたUFO、自由3次元速度と控えめな射線補正を扱う。

`controls-contracts` は新規検査で、9キー/Normal4・Easy1、入力・ボタン・キー型からの除外、保存の本作専用境界、不正データの安全な読取を確認する。`flight-ammunition` は残弾別の条件、359/360tick境界、繰り返し再装填、自機と僚機の同じ契約を確認する。指別cancel、互換clickによる単発の二重処理、モード/blur/回転/再割当/操縦引継ぎ前のclear、焦点境界はunitで回帰する。

これらは論理・handler・型の検査であり、実ブラウザでの操作、設定の実径・位置・スクロールやiPhone実機の合格を意味しない。本作で実行したbrowser検査は本作の検証記録を参照する。元作の過去passを本作のpassへ流用しない。

## 移植部の実行記録

2026-10-04 UTCの作業treeで `node --import tsx --test tests/controls*.test.ts tests/flight*.test.ts` を実行し、38件pass/0件fail。型の除外を実際のTypeScript compilerで検査する `controls-contracts` もこの38件に含む。`tsc --noEmit` もpass。最終候補全体の完全SHAに対する結果は、本作の統合検証記録に別途結ぶ。

通常の `createGame({mode:'normal'})` → `startGame` → 固定tickでの射撃保持入力を1300tick再生し、716tickで空弾倉・装填360tick、1075tickで残り1tick・実発射384発、1076tickで装填終了・MG286/機関砲94・実発射388発を観測した。開始後にHP・弾薬・時計・残機を書き換えず、自機は同じ残機のまま合法な保持射撃を再開した。この再生は実ブラウザ操作の代わりにはしない。

補足Chromium/SwiftShaderの通常設定画面では、9キーすべてを個別に変更して明示保存した値が本作storageに一致した。共同編集中のHMRによる画面再読込、および初回飛行frame gapによる正規の自動停止が連続操作検査に影響したため、宙返り・長押し装填・復帰入力の実ブラウザ通算合格はこの時点で主張しない。検査担当の単独実行と資源が競合する追加ブラウザは停止した。

Three.jsの第三者表記は `public/third-party-notices.txt` で保持する。元リポジトリ全体にMITライセンスがあると扱わず、今回依頼された固定版の移植として出典を記録する。

最終追加検査: WebKit 26.5 / 393×852、2026-10-05T04:37:18.631Z〜04:38:12.827Z。通常設定画面で9キーを保存し、4方向/加減速、448能動tickの宙返り（その間のframe停止0）、保持射撃から共有装填完了、設定から同じ停止tickへ復帰、墜落時の保持解除・復帰後の新しいキーを確認した。6case pass、page error0、indexと全src TS/CSSの実行前後hash一致。準備tick0と保持射撃tick984のframe停止は120ms凍結後、見えるResumeで再開した。無中断性能とはしない。旧Normal4/Easy1対象で、新レバーの統合検査は未実施。記録は `evidence/browser-visual/controls-webkit-393x852-2026-10-05/` に保持する。
