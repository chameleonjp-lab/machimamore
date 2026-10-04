# マチマモレ 移行調査

調査日: 2026年10月4日 UTC  
状態: GitHubコネクタによる読取調査。[要件仕様書](REQUIREMENTS.md)とともに文書として提出する。ゲームの移植・実行は行っていない。

マチマモレはREADMEだけの初期リポジトリである。操縦と設定はKaisenの固定コミットを基準に移植し、FightFlightは画面体系と共通部分の差分を確認する参照先とする。元作の勝敗・残機・得点・ランキングをそのままコピーして新作と呼ぶことはできない。

## 1 調査時点の対象

| 対象 | 固定コミット | 確認内容 |
| --- | --- | --- |
| machimamore | `b1014c56c821b2c1ca5df9e94506218e9500727b` | 公開。mainのファイルはREADME.mdのみ。main以外のbranchなし。開いているPRは0件 |
| kaisen | `5f4565ee550ce9a1351516aa31ba9b5232c36e05` | 公開。Three.jsゲームと単体・ブラウザ検査・Pages関連ファイル。調査時に開いているPRは0件 |
| faitofuraito | `c2b313d37875b93458032d98636fcf5b5d30a138` | 公開。共通操作同期後のmain。調査時に開いているPRは0件 |

枝・PRの状態は2026年10月4日21:38 UTC頃のスナップショットである。文書提出・移植開始直前には再取得する。別担当がKaisenの得点を変更していても、本作へ追従する根拠にはしない。

## 2 Kaisenから維持する契約

### 2.1 操縦とカメラ

- 相対ドラッグ、矢印操縦、L宙返り、Space射撃、W/S加減速、Esc停止
- 速度に応じた旋回、失速下限、宙返り中の姿勢と復帰
- Easyの巡航・操縦／カメラ補助、自動射撃。Normalは自動で射線を補正しない
- 航空機モデルの形状・材質・風防・舵・プロペラ。新しい簡略機体で置き換える必要はない
- カメラと照準の投影、機体前方向、論理姿勢と表示姿勢の対応

固定版の数値は巡航110m/s、最高141m/s、失速65m/s、宙返り5秒、クールダウン2秒、加減速18m/s²。数値の変更は操作をそのまま引き継ぐ契約へ影響する。マチマモレのUFOへ航空機の固定前進を強制しない。

Easyの固定版は自動射撃射程1,200m、射撃補正35%、最大0.028rad、予測gate0.16rad。航空機向け補助とKaisenの艦追尾補助を区別し、UFO向けの標的位置・速度・遮蔽だけをアダプタとして接続する。自動射撃を100%必中へ変えない。

### 2.2 入力の所有と設定

Kaisenの既定11操作は方向4、射撃、宙返り、加速、減速、爆弾、魚雷、停止。タッチはNormal6ボタン、Easy3ボタン。利用者の後続指示「爆弾と魚雷は不要」に従い、本作は9操作・Normal4／Easy1ボタンとする。爆弾・魚雷の機能、ボタン、キー割当、設定項目、説明を移植しない。元のKaisenは変更しない。

| 設定項目 | 固定版で確認した契約 | 新作の扱い |
| --- | --- | --- |
| ボタン位置 | x/yを相対座標で保存。safe-areaとボタン径で制限 | 維持 |
| 大きさ | 44〜140px、横画面は高さに応じて実表示縮尺を制限 | 維持。プレビューとの一致を検査 |
| 不透明度 | 0.2〜1.0 | 維持 |
| 操作モード | Easy/Normal別の配置 | 維持 |
| PCキー | KeyboardEvent.code、重複禁止、予約キーとEscの特例 | 維持 |
| 入力方式 | touch/keyboard両編集へ到達可能。押下中に配置を変えない | 維持 |
| 保存 | 複数項目を保存、途中失敗の復元、未来形式保護、今回だけ適用 | 維持 |
| 保存キー | kaisen-keyboard-v1、kaisen-controls-v1、kaisen-controls-easy-v1 | 構造を参考に本作専用キーへ変更 |
| 説明画面 | native dialog、Tab境界、Esc、元フォーカスへ復帰 | 内容だけ本作へ変更 |

同じGitHub Pages originでもlocalStorageはpathごとに隔離されない。新作から元作キーを書き換えない。既存プレイヤー設定の自動インポートや全localStorage初期化は追加しない。

取得したソースには、IME・Ctrl/Alt/Meta・編集要素の抑止、pointer ownership、互換click優先、停止から復帰後の入力解放がある。設定画面だけ移して入力イベント側を取り落とさない。

### 2.3 弾薬と損傷

- 航空機HP80、MG288発・機関砲96発、両方を使い切って共通6秒装填
- 自機はMG5tickごと2発、機関砲15tickごと2発
- 航空弾の実飛翔距離200/500/800mによる4段階減衰と、1.5秒寿命
- 自機基礎威力MG4／機関砲20。僚機MG2.4／機関砲9.6
- KaisenのAIはMG17tick／機関砲57tickごとに2発、弾倉制限・装填はない

本作案は僚機にも弾倉と6秒装填を持たせる。これは「双方の弾薬無限補給だがリロードあり」の具体化で、元作と完全一致している項目ではない。

## 3 ゲーム間のコード同一性

下表はGit blob SHAの比較であり、単体試験や見た目の一致を意味しない。異なるSHAは内容が違うことだけを示し、違いが不具合であることを意味しない。

| path | Kaisen blob | FightFlight blob | 判断 |
| --- | --- | --- | --- |
| src/flight.ts | `3019be9650863c11cc1c57f7bb7e09ab815c9c07` | 同左 | バイト単位で同一 |
| src/aircraft-damage.ts | `fe0c48ff296a31db70c7f93a0cdab64244ba939b` | 同左 | バイト単位で同一 |
| src/dialog-focus.ts | `5d10d15cb0b9d3de31871af98a7801d638a5055b` | 同左 | バイト単位で同一 |
| src/flight-view.ts | `87f83928a00092338391442ec2d7e87e3b4e33da` | `c221e1035f83bcef29435df7c8d0042e59013174` | 同一と扱わない |
| src/aircraft.ts | `e4e3009464bb8c4ae473b7cfc46d010198c27149` | `7ea053b94f6af23eb3b46296d740dccd39209d5b` | 同一と扱わない |
| src/flight-assist.ts | `799efdfb97c3b9ba435e8eaf4080f65b74326773` | `c2d0fdede8342c937c660d4fbd4668baae8094e5` | 艦向け補助等の作品差を適応 |
| src/gun-sight.ts | `1cdbd4bb3cf49d963c78f87a1cb00a42fb3b222b` | `b8bbae3b570802689ff9410a1bab2b00ea945cb7` | 照準差分を混合しない |
| src/keyboard-settings.ts | `eb143ac27b3f65b66912d10b89ec17d0efc581b2` | `8a117a562c53be20ab2b239f7b5bafdb929ef575` | 11操作対9操作・保存名の作品差 |
| src/input.ts | `0edbd1c5f9f07a2d1088539e188bab0329ab53f0` | `88eb4ba80da3c5e4cfc7ffc9b7b5d461c460e9a3` | 兵装・操作数の適応を要する |
| src/control-settings.ts | `5208c4da8ebe014552cae855d84c2574ab152292` | `b95d7743cc81c08c3ecea613b75c707469652210` | 保存キー・配置・文言の作品差 |
| src/control-settings.css | `1235392f369ac27ef3056852512319fe6994300b` | `7f48e5e53de976713ae6a20dcebe1b73a0f4ca80` | セレクタと実ボタン表示径を確認 |

Kaisenを操作の正本にする指定があるため、各作品の新しいファイルを任意に混ぜるのではなく、まずKaisen固定版の一式を基準とする。FF側には独立プレビューボタンのCSS不足を修正した記録があるので、CSSだけの移植でもプレビュー外観と実径を必ず検査する。

## 4 移行対象と新作専用境界

| 機能 | 移行候補 | 本作で必要な対応 |
| --- | --- | --- |
| 飛行・姿勢 | flight.ts、flight-view.ts | 自機再出撃／僚機引継ぎ時の再初期化、世代保護 |
| 機体と被弾表現 | aircraft.ts、aircraft-damage.ts、aircraft-tracers.ts | 新生トークンと残骸の分離 |
| 入力 | input.ts、keyboard-settings.ts | 爆弾・魚雷除外、停止・復帰待ち・操縦引継ぎの所有 |
| 設定・説明 | control-settings.ts/css、dialog-focus.ts、rules-guide.ts | 本作名・キー・操作数・本作ルールへ適応 |
| 射撃・装填 | ammunition.ts、既存射撃処理 | UFO collider、僚機装填、実弾単位命中率 |
| カメラ・補助 | flight-assist.ts、gun-sight.ts、aim-indicator.ts | UFO用の標的位置・速度と遮蔽 |
| 音・海・空 | audio.ts、ocean.ts、atmosphere.ts | レーザー／街損傷音、上限と資源所有 |
| 味方通知 | ally-announcements.ts | 7僚機枠、50残機、世代、同時通知のまとめ |
| HTML/CSS・画面切替 | index.html、style.css、main.ts | 母艦/UFO/街、残機HUD、結果内訳、入力説明 |
| 勝敗・残機・スコア | mission.ts／simulation.tsは境界を参考 | 新作契約に置き換える。旧作の式をコピーしない |
| UFOと都市 | 元作に存在しない | 新規状態、描画、衝突、保存則、レーザー、区画耐久 |
| 元作ランキング | FightFlightのranking関連 | 移行しない |
| 元作対艦戦 | ships/naval/ordnance関連 | 爆弾・魚雷を含め移行しない |

この表は実装タスクの完了記録ではない。具体的なファイル設計と工程は要件PRの後に作る実装計画で確定する。

## 5 UI／UXの基準

Kaisenのindex.htmlとmain.tsは、ホームのブリーフィング、Easy/Normal、画面準備中のStart無効、飛行HUD、停止、ルール、操作設定、結果、再出撃の構造を持つ。音は初期OFF。設定はHome/Pause/Resultから開く。ルールはHome/Pauseから開く。

共通性は作品名を残すことではなく、移動経路・操作の意味・階層・ボタンの役割・設定の振る舞いで維持する。以下は本作へ持ち込まない。

- Kaisenの初期5機・艦隊4隻・40秒増援・自機復活なし・復活敵で15HP回復
- FightFlightの300秒／時間無制限という独自モード、名前入力、上位30位、ランキング・共有接続
- 本作にない船体・砲座・爆撃目安を意味するテキストや成功色
- 別作品のルール版、保存キー、ページURL、ブランド文字、READMEの過去公開状態

KaisenのREADMEとDEPLOYMENT文書には過去の公開版・当時の未公開記述が複数残る。現在のmainソースの調査結果と、公開URLが現在どのartifactを配信しているかは分ける。本調査では公開ページの実配信・WebGL・実機飛行を確認していない。

## 6 依存と権利

Kaisen固定版のpackage.jsonは次を指定している。

| 区分 | 依存と版 |
| --- | --- |
| 実行時 | three 0.186.1 |
| 開発 | @playwright/test 1.61.1、@types/three 0.183.1、tsx 4.21.0、typescript 5.9.3、vite 8.3.1 |
| 実行環境 | READMEではNode.js 24 |
| 検査 | npm test、npm run build、npm run test:browser |

新作は必要な依存だけをlockfile付きで固定する案とする。package.jsonとlockfileの一致や実際の依存取得はこれからであり、依存の利用可能性・互換性を実行確認済みとしない。

3ゲームの取得treeにLICENSEファイルはない。Kaisen／FightFlightの第三者表記にはThree.js authors 2010–2026のMIT原文がある。MITであると確認した対象はこの第三者依存であって、リポジトリ全体や全素材へ広げない。本作への依頼されたコード移植には出典と固定SHAを残し、該当する第三者表記を保持する。

手続き生成コード・合成音にも出典を残す。新しく画像・地図・音源・フォント等を取得する場合は別に利用条件を確認する。参考画像の閲覧と、ゲームへの同梱許諾を同じにしない。

## 7 維持すべき検査の種類

移植元のテスト名をそのまま増やすのではなく、次の契約と本作受入IDに対応づける。

- flight、control-settings、keyboard-settings、dialog-focus
- input-ownership、input-recovery、review-input-ownership、touch-reload
- browserのinput-method、mobile-settings、review-accessibility、reload
- mode、Easy shot correction、aim indicator、render queue、scene lifecycle
- 生の画面入力から受理入力・固定tickまでのcadence、停止・復帰、単発の二重処理

Kaisenのunit／browserの過去passは本作のpassにしない。コピー後の本作完全SHAで型・build・該当回帰・新規状態の検査を実行する。Playwright WebKitはiPhone Safari実機ではなく、SwiftShaderはモバイルGPU測定ではない。

## 8 決定と引継ぎ

1. 爆弾・魚雷は不要という後続指示を反映済み。旧O01は解決し、D01として除外対象を記録した
2. 同時8対8、3秒復帰、UFO/街HP、得点係数、レーザー連射間隔・線量などは委任された設計判断による初期設計値。利用者指定値と区別し、検証結果に応じて調整する
3. 要件PRはレビュー中。次の実装計画PRは要件PRの実在番号・headを参照する
4. 公開先の設定状態は未調査。本人による採用・main反映と、対象公開の許可範囲確認を公開実行の前提とする。ランキングは含めない

## 9 固定出典

- [MachiMamore基点](https://github.com/chameleonjp-lab/machimamore/tree/b1014c56c821b2c1ca5df9e94506218e9500727b)
- [Kaisen基点](https://github.com/chameleonjp-lab/kaisen/tree/5f4565ee550ce9a1351516aa31ba9b5232c36e05)
- [Kaisen README](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/README.md)
- [Kaisen package.json](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/package.json)
- [Kaisen keyboard-settings.ts](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/src/keyboard-settings.ts)
- [Kaisen control-settings.ts](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/src/control-settings.ts)
- [Kaisen flight.ts](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/src/flight.ts)
- [Kaisen flight-assist.ts](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/src/flight-assist.ts)
- [Kaisen ammunition.ts](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/src/ammunition.ts)
- [Kaisen mission.ts](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/src/mission.ts)
- [Kaisen index.html](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/index.html)
- [Kaisen third-party-notices.txt](https://github.com/chameleonjp-lab/kaisen/blob/5f4565ee550ce9a1351516aa31ba9b5232c36e05/public/third-party-notices.txt)
- [FightFlight基点](https://github.com/chameleonjp-lab/faitofuraito/tree/c2b313d37875b93458032d98636fcf5b5d30a138)
- [FightFlight共通操作同期](https://github.com/chameleonjp-lab/faitofuraito/blob/c2b313d37875b93458032d98636fcf5b5d30a138/docs/SHARED_CONTROLS_SYNC.md)

公開仕様へ別管理資料の本文や内部運用記録を複製しない。必要な出典と本作自身の判断だけを残す。
