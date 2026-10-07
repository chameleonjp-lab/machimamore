# 共通UI・速度レバー統合候補（2026-10-07 UTC）

本記録は main `1d27a697ea62dbfa676e1e78968c164552459ec5` から作成したローカル候補だけを対象にする。以前の実装・ブラウザー・配備記録は当時の履歴として保持する。GitHub/Driveへの書込、PR、CI、merge、本番公開は今回行っていない。

## 固定元と限定差分

- GitHub connectorのread-only取得でmain一致を確認。履歴画像等を除く99 source blobと、再計算比較用の旧137作戦報告3 blobを取得し、全102件のGit blob SHAを照合した。baseとsource manifestをローカル保全した
- 共通シェル参照: カイセン `519fd0d50dfb2ce9a1145c0b58a1301b5c74d032`。全幅app、縦積みの基本Home、短い横画面の2列、明朝見出し、briefingの非独立カード化、共通panelを専用CSSへ分離。都市説明・50対50・8対8・独自HUD/結果は保持
- 共通実装参照: 2026-10-07のFantasia共通UI候補のレバー・保存回復実装。M自身の`input.ts`への限定追補とし、`flight-types`依存、PC9キー、世代交代処理を保持。世界/拠点/兵装/他作品保存キーは持ち込まない
- `src/throttle-lever.ts` SHA-256: `e83fe3c570581d16cb76e08ef9a039bbe9d4a50da6575366ac7e126bf3f30cf0`
- `docs/fixtures/throttle-lever-v1.json` SHA-256: `416c5ac01d4d14d1f45d94385e07233090740db04382e468db1f0c64689df8ca`
- 共通契約本文 SHA-256: `cd0e7db83c54cf349fb6a178a8abcd22bf09f78376cb4b836784faa2ae721864`

## 接続・保護

Normalは射撃・宙返り・速度レバーの3操作、Easyは宙返り1操作。爆弾/魚雷は追加しない。PC9操作と再割当は維持する。実input sampleから`FlightInput.throttle`、実`advanceThrottle`、authoritative `stepGame`へ接続。65..141 m/s、18 m/s毎秒、8%deadzone、明示0優先/legacy未指定fallback、離した後のtarget保持を試験する。

mainは従来のpendingLoop/Fire/Accelerate/Brakeを保持し、`sample(false)`でframeを観測、実固定tickごとに`sampleThrottle`で短押しを一度だけ消費する。既存保留W/Sのframe間保持も残す。`syncPilotOwnership`はmission/token/generation変更時にcapture・キー・保留・raw throttleを解除し、交代した機体へ入力を渡さない。sampleより前に完了したW/S・再割当キー・focus矢印の短押しも1tick分保持し、Cancel/blur/focusout/pause/世代交代時は破棄する。

touch保存先はM専用v2、keyboard keyは既存v1のまま。旧touch v1 rawは読取移行だけで保持。全対象preflight、未来version拒否、原raw journal、部分失敗rollback、復元拒否時の旧値読取、Cancel→再open→未変更Saveによる復元再試行、session-only、他作品key拒否を検査した。

レバーは長方形safe bounds、設定と実画面の同寸法、utility操作回避、44px handle、所有pointer・capture・focusの独立解除を実装する。縦寸法44pxしか得られない場合は22px両端でtravel=0となるため、レバーを無効化/非表示にし既存の配置不可メッセージを表示する。

## ローカル検査

Node24.19.0 / npm11.9.0。既存ローカル依存を新copyへ準備。Fとの共通lock entryはすべて一致。M固有`@types/node`24.19.1/`undici-types`7.24.6は既存ローカルcopyのversion・install-lock integrity一致を確認。インストール済み37 packageのversionをM lockと照合し、package/lockは変更していない。新registry取得は行っていない。

- `npm test`: 142/142 pass、fail/skip 0（最終値は添付manifestの検査logも参照）
- 共通35 fixture: axis11/pointer10/combine6/advance8を実関数・実M throttle更新で確認
- `npm run build`: required strict製品コード＋browser/scripts型検査を含めpass
- 追加throttle/contract unitの補足strict: pass
- 全unitを追加でstrict型検査すると5件の既存型エラー。変更前baseでも同じ5件を再現。aircraft-batch2件、controls-keyboard1件、controls-settings fixture1件、simulation-ufo1件。既存npm test/required buildはこの全unit型検査を含まない。全unitのstrict-cleanとは呼ばない
- `npm run test:review`: 独立丸角交差30,275例の不一致0、UFO安全停止fixture3件pass
- `npm run check:dist`: HTML/JS/CSS/NOTICEの4ファイルpass。Three.js LICENSE原文維持、read-only開発hook/外部接続設定をreleaseへ混入しない
- `playwright test --list`: Chromium/WebKit合計40件、7ファイル収集。旧mobile-layout/保存先期待を3操作/v2へ更新し、実lever/legacy保存・reloadの2仕様を追加した
- 独立read-onlyレビュー: 初回指摘の設定キー短押し欠落・ゼロ長railを修正後、141 unitとrequired typecheckを再実行してpass。review範囲に未解決code blockerなし

## 未確認・公開ゲート

native browserのsocket EPERMが事前確認されているため、今回ブラウザーの起動を再試行せず、別手段で回避していない。Chromium/WebKit実行、Home/設定/HUDの実画面、44px実hit、200%文字/zoom、safe area、保存画面の連続操作、画像比較は未確認。40件の収集を実行passとは扱わない。実機タッチ、VoiceOver、音、GPU/長時間性能も未確認。Viteの500KB chunk警告は継続している。

公開前にはこの同一候補でブラウザー受入を実行し、本人の外部提出承認と別の公開承認を得る必要がある。過去のbrowser/CI/配備成功を本候補へ流用しない。

## 復元

baseの全取得source、変更前3作戦報告、Git blob/SHA-256 manifest、候補ファイル、forward patchを別copyに保全。patchの逆適用または対象ファイルだけをbaseから戻し、新規追加pathは別フォルダーへ退避して復元できる。保存についてもv1 rawは変更せず、失敗batchの復元rawはM専用journalに保持する。破壊的削除やmainへの直接反映は含まない。

### 短いtouch入力の追補

共有DOM helperにも、通常pointerupまでに実tick未消費のアナログ量を1tickだけ残す修正を適用した。release直後のhandle/aria表示は中央へ戻り、未消費量だけsample(false)間で維持する。pointercancel/lostcapture/clear/blur等は未消費量を破棄し、既に消費したholdは解放時に再生しない。M実stepGameを通る追加回帰を含めunitは142/142 pass。共通純関数hashは不変。追補後の`src/throttle-control.ts` SHA-256は `90ab345e800df435f236abf7fb8e014c7b471f65fe04640d3f4d36be518bdefe`。

### 137作戦の新source再計算

既存 `test:evidence` は保存済み作戦報告と現行physics source digestの一致を要求するため、旧結果を再ラベルせず、既存driverをそのまま新sourceで再実行した。新規純関数依存`throttle-lever.ts`も、balance/turn-held/negative driverと独立検算scriptのdigest対象へ追加した。

- 120本の通常比較、Easy有効右旋回保持12本、Normal不利比較5本、合計137本を完了
- 114勝・23敗、fault0、600秒計算上限への打切り0
- 旧137件と、新137件の入力hash・tick・得点・勝敗・損害・残機・発射/命中等の共通フィールドはすべて一致。実行時間計測だけを比較対象外とした
- `npm run test:evidence` pass。literal得点式137件不一致0
- 新physics source digest: `19860bef4f7278b7b077fd5d4e38cfdf935e1ec6f7c319db3aae06c58a40829b`
- 本driverはlegacy FlightInputによるsimulation回帰。レバーUIの実ブラウザー検査や、人の初見試遊の代用ではない

最終タッチ追補の独立再reviewは関連32 unitとrequired型検査がpass、未解決code指摘なし。`evidence:source` scriptは今回のread-only connector復元copyにGit履歴がないため`git rev-parse HEAD`で停止した。Git clone/履歴/commitを偽造せず、固定remote main SHAと取得102 blobのGit SHA、全候補ファイルのSHA-256、再適用照合済patchを別manifestで記録する。

## M-04：日本語の描画失敗案内の境界（2026-10-07、v2）

v1候補・manifest・patch・ZIPは変更せず、別copyのcandidate-v2にM-04だけを追補した。mainの`prepareGraphics`失敗時、画面の日本語案内へ例外の`message`を連結する処理を外し、元例外オブジェクトはdiagnostic consoleへそのまま保持する。日本語案内の意味、Start無効、失敗表示、入力解除、playing時の停止、描画準備再試行の既存導線を維持する。自動retryや、新しい成功扱いは追加していない。

既存`tests/throttle-runtime.test.ts`へ6件を追加。実mainの`prepareGraphics`・`graphicsFailure`・`clearInput`を抽出実行し、技術Error/空Error/技術文字列/未知object（message getterを読まない）/nullの5種をHome・Playingで確認する。画面は日本語案内だけ、診断は元例外の同一identity、入力保留解除、タイマー後始末、失敗後に無断で再試行しないこと、既存の明示再試行後だけ成功可能なことを検査した。

- v2全unit：148/148 pass、fail/skip0
- 関連main runtime：11/11 pass、追加strict pass
- required build（製品・browser/scripts strict）、check:dist、test:review、test:evidence：pass
- browser collection：40件/7file。既知EPERMのため実行はしていない
- v1の137作戦raw3報告はSHA一致のまま保持。physics sourceと依存digestも不変で、137件の独立検算をv2から再実行してpass。137作戦をv2で新たに走らせたという意味ではない
- M-04前後で変えるのはmain、既存runtime検査、この文書だけ。ベースmainに対する32変更pathは増えない

M-04はエラー表示の限定修正であり、ブラウザー画面・実機・他票・公開の完了には広げない。全unit補足strictの既存5型エラー、履歴のないcopyでの既存evidence:source停止、全ブラウザー未実行という既知の制限も変わらない。

M-04の独立read-onlyレビューは、製品差分が診断consoleと固定日本語案内だけであること、取消・再試行・失敗処理の保持を確認し、関連11/11・required型・runtime test単独strictを再実行してpassとした。旧候補/sourceと既存成果物119hashも不変を確認した。ブラウザーは起動していない。
