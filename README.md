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

## 速度調整レバー（統合待ち）

Normalの加速/減速タッチ2ボタンを上下1本の速度レバーへ統一する[共通契約](docs/THROTTLE_LEVER_CONTRACT.md)と[本作への適用・未実装項目](docs/THROTTLE_LEVER_ADAPTER.md)を追加しています。Easyの自動巡航とPCの加速/減速キーは維持します。現mainには対応する飛行入力/操作設定がないため、UI・保存移行の統合と受入検査は未完了です。
