# 来歴と権利表記

Kaisen固定版 `5f4565ee550ce9a1351516aa31ba9b5232c36e05` を操縦・カメラ・機体・入力・設定の正本とした。同一所有者から依頼された本作への移植であり、元リポジトリ全体のライセンスをMITと断定しない。移行元checkoutを変更せず、本作の勝敗・有限残機・都市・UFO・レーザー・独立スコアは新規実装する。

- 操縦・入力・設定のファイル別元blobと適応理由: [PROVENANCE_CONTROLS.md](PROVENANCE_CONTROLS.md)
- 機体描画・新規場景・音・画面の来歴: [PROVENANCE_SCENE.md](PROVENANCE_SCENE.md)
- 固定版調査と原作差分: [MIGRATION.md](MIGRATION.md)

純粋論理の `roster.ts`、`collision.ts`、`laser.ts`、`ufo-ai.ts`、`city.ts`、`score.ts` は本作向けの新規実装。`simulation.ts` の弾初速820/700、僚機spread .012は固定Kaisenの `src/simulation.ts`（blob `adbfb7e6a0ae1bacf75ee4caca664cff34d3deb0`）、弾寿命1.5秒は `src/mission.ts`（blob `02a34856587ed8b237cdca930fa7feae66c063ec`）、機体耐久・兵装損傷基準は `src/aircraft-damage.ts`（blob `fe0c48ff296a31db70c7f93a0cdab64244ba939b`）を参照した。有限残機、レーザー線量、街HP、配点は本作要件を正本とする。

`machimamore-2` は僚機MG／機関砲の周期を初期移植値17／57tickから34／114tickへ変更する。隔離候補の合法入力比較で、Easyの連続墜落による敗北がseed1・11・29・47で成立し、予測操縦によるNormal防衛は3seedすべて自機損失0、2seedで無操作を上回った。seed29の不利な結果、元周期のseed47で全弾外れた結果、入力driver初稿の例外も保存する。固定配点を維持した本作の初期値調整であり、元作は変更しない。範囲と未確認条件は [候補比較](evidence/cadence-comparison.md) に記録し、最終採用値の12seed比較は [全120作戦](evidence/balance-final.json) の別の検査証拠として扱う。

`tests/aircraft-batch.test.ts` は同じ固定Kaisenから移植し、本作のbatchに対して頂点・法線・UV・材質・可動部分・キャッシュ解放を再検査する。移行元の過去の検査結果を本作の結果として流用しない。

FightFlight固定版 `c2b313d37875b93458032d98636fcf5b5d30a138` は共通操作と設定プレビューの差分確認用。ランキング、共有、DB、元作の勝敗・スコアを移植しない。爆弾・魚雷は本作のコード、設定、型、画面から除外する。

## 配布依存

| 対象 | 版 | 配布と条件 |
| --- | --- | --- |
| Three.js | 0.186.1 | 本番JSへbundle。MIT。`public/third-party-notices.txt` の著作権・許諾・免責原文をdistへ保持 |
| @types/node | 24.19.1 | 検査スクリプトとブラウザ検査の型検査のみ |
| @types/three | 0.183.1 | 型検査のみ、配布JSへ含まない |
| TypeScript / tsx | 5.9.3 / 4.21.0 | 型検査・テストのみ |
| Vite | 8.3.1 | ビルド・開発サーバーのみ |
| Playwright | 1.61.1 | ブラウザ検査のみ。OSライブラリとブラウザバイナリはゲームへ同梱しない |

新しい外部画像、地図、フォント、音源、有料素材・サービスは導入しない。母艦・円盤・港・都市・背景はコードで生成し、音はWeb Audioによる合成。ソースの地理形状は架空で、史実の建物配置ではない。原作Aircraft内のCanvasTextureも手続き生成である。

lockfileで依存を固定し、`npm run check:dist` が配布の許可一覧、NOTICE、開発用観察hookの不在、JS/CSS/HTMLのハッシュmanifestを検査する。本番スコアや外部設定のための資格情報を必要としない。
