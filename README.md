# machimamore
マチマモレ

架空の港湾都市を守る3Dブラウザ航空ゲーム。味方は自機込み50機、敵UFOも50機。同時出撃8対8で、予備がある機体は撃墜から3秒後に復帰します。街20区画を守り、敵の全残機を撃破すると勝利です。

Node.js 24で起動します。

```sh
npm ci --ignore-scripts
npm run dev
```

表示されたローカルURLを開き、画面準備が完了したら「街を守りに出撃」を押します。イージーは巡航・自動射撃、ノーマルは手動射撃・加減速です。矢印または相対ドラッグで操縦、Spaceで射撃、Lで宙返り、W/Sで加減速、Escで停止。キー割当とタッチ配置は操作設定で変更できます。音は初期オフです。

```sh
npm test
npm run test:review
npm run test:evidence
npm run build
npm run check:dist
npx playwright install --with-deps chromium webkit
npm run test:browser
```

操作・ゲームルールは画面内の「ルールと操作方法」、仕様は [要件書](docs/REQUIREMENTS.md)、進捗は [実装状況](docs/IMPLEMENTATION_STATUS.md)、検査結果は [検証記録](docs/VERIFICATION.md)、来歴は [PROVENANCE](docs/PROVENANCE.md) を参照してください。

ランキング・名前入力・外部スコア送信はありません。設定は本作専用のlocalStorageにのみ保存します。コード移植の来歴とThree.jsの許諾表記を保持し、リポジトリ全体のライセンスをMITと断定しません。

PR提出と公開は別工程です。本人による採用後の公開手順は [DEPLOYMENT](docs/DEPLOYMENT.md) に記載しています。クラウドの模擬検査はiPhone等の実機での操作感・音・GPU性能を保証しません。

## 速度調整レバー（初期追補の履歴）

Normalの加速/減速タッチ2ボタンを上下1本の速度レバーへ統一する[共通契約](docs/THROTTLE_LEVER_CONTRACT.md)と[本作への適用・未実装項目](docs/THROTTLE_LEVER_ADAPTER.md)を追加しています。Easyの自動巡航とPCの加速/減速キーは維持します。追補作成時のmainには飛行runtimeがなく、2026-10-05のPR #4採用でruntimeがmainへ届きました。速度レバーのUI・v2保存移行・受入検査は別作業として統合待ちです。

後続の修正PR [#5](https://github.com/chameleonjp-lab/machimamore/pull/5) は2026-10-05T04:55:59Zに本人側で採用され、mainは `fa323bef322eb62f350011f3bd5f8af3935e17d9` になった。上記のDraft候補という記述はその提出時点の記録である。最終検証資料は別のDraft PR #6へ提出し、担当agentはマージ・公開を行わない。新しい検査PNGと長時間・作戦の大きなraw記録はローカル保持とし、公開資料には全入力行・全177観測のJSON投影と元記録のhashを保存する。

## 2026-10-07 共通UI・速度レバー候補

ローカル候補でNormalを射撃・宙返り・速度レバーの3操作、Easyを宙返り1操作へ統合しています。PC9キーは維持し、上で加速・下で減速、離すと調整済み速度を保持します。旧touch v1は保持し、明示保存は本作専用v2へ行います。Home/共通panelはカイセン基準へ揃え、都市の説明・HUD・勝敗は保持しています。実装範囲、独立review、検査結果、ブラウザー未確認と復元手順は[今回の記録](docs/COMMON_UI_THROTTLE_VERIFICATION.md)を参照してください。
