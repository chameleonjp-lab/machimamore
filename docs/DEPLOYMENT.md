# 本人採用後の公開

本作は静的なViteビルドを配布する。PRのpush・作成では公開しない。mainへのマージと公開先設定は本人の判断を待つ。ランキング、分析、外部フォント、スコア送信は導入しない。

1. 本人が実装PRを採用した後、対象mainの完全SHAと検証済み候補treeを比較する。差分があれば関連検査をやり直す。
2. Node 24で `npm ci --ignore-scripts`、`npm test`、`npm run test:review`、`npm run test:evidence`、`npm run build`、`npm run check:dist`、`npm run test:browser` を実行する。
3. `dist/artifact-manifest.json` とCI artifactを保存する。JS/CSS/HTML/NOTICEのSHA-256を配信物と照合する。
4. 本作のGitHub Pagesプロジェクトを公開先候補とする。必要な設定・権限の変更は許可を得てから行う。Viteの相対baseにより `/machimamore/` に対応する。
5. 実URLで初回読込、ホーム、出撃、停止、設定、再出撃、NOTICE取得、許可外通信0を確認する。配備応答だけで実機飛行の成功としない。

未マージの作業ブランチを本番へ配備しない。代理マージ、main直接push、自動マージ、他作品の公開設定変更は行わない。問題発生時は本作の既知正常artifactを用い、保存形式との互換性を確認する。モバイル実機の操作感・音・GPU性能はクラウドの模擬検査とは別の確認項目である。
