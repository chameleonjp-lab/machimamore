# マチマモレ 作業入口

対象は `chameleonjp-lab/machimamore`。要件は `docs/REQUIREMENTS.md`、工程は `docs/IMPLEMENTATION_PLAN.md`、実施状況は `docs/IMPLEMENTATION_STATUS.md` と `docs/VERIFICATION.md` を読む。

ユーザー指定の標準担当を維持する。最終責任と採用判断はユーザー本人。企画・設計・最終判断支援、原因不明・安全性・重大判断は6.1Sol Max。日常実装・進行はLuna Maxまたは6.1Sol Max。複雑な検査・不具合調査、反復確認・記録はLuna Max。公開前の独立レビューは6.1Sol Extra High。実際に依頼していないレビューを独立レビュー済みと呼ばない。

ゲーム論理の時計と乱数はsimulationが所有する。描画・音・DOMから損傷やスコアを更新しない。Kaisen移行元は固定SHAを使用し、別作品を変更しない。爆弾・魚雷、ランキング・DB・外部送信は初版に含めない。

`npm ci --ignore-scripts`、`npm test`、`npm run build`、`npm run check:dist`、`npm run test:browser` で対象版を確認する。模擬画面・SwiftShader・WebKitをモバイル実機の代用としない。画像は保存後に実際に見る。

作業ブランチで実装・検査し、最終候補のDraft PRを作成する。最新headのCIを確認し、失敗したら原因修正と再検査を成功まで続ける。main直接push、代理マージ、自動マージは行わない。本人採用前の本番公開を行わない。
