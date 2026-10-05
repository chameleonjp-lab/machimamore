# 本人採用後の公開

本作は静的なViteビルドを配布する。PRのpush・作成では公開しない。2026-10-05T04:42:29Zに実装PR [#4](https://github.com/chameleonjp-lab/machimamore/pull/4) が本人側で採用され、mainは `7d65c325f522af5adaffa22cb39ef1b45c4b8ba4` になった。担当agentはmainのmerge・配備を実行していない。公開先設定・本番配備・配信版照合は未実施であり、後続Draft PR [#5](https://github.com/chameleonjp-lab/machimamore/pull/5) の修正候補をmain採用済みの版と混同しない。ランキング、分析、外部フォント、スコア送信は導入しない。

1. 採用された対象mainの完全SHAと検証済み候補treeを比較する。後続候補のworkflow・測定driverの変更と配布するゲームのbytesを分け、差分があれば関連検査をやり直す。
2. Node 24で `npm ci --ignore-scripts`、`npm test`、`npm run test:review`、`npm run test:evidence`、`npm run build`、`npm run check:dist`、`npm run test:browser` を実行する。
3. `dist/artifact-manifest.json` とCI artifactを保存する。JS/CSS/HTML/NOTICEのSHA-256を配信物と照合する。
4. 本作のGitHub Pagesプロジェクトを公開先候補とする。必要な設定・権限の変更は許可を得てから行う。Viteの相対baseにより `/machimamore/` に対応する。
5. 実URLで初回読込、ホーム、出撃、停止、設定、再出撃、NOTICE取得、許可外通信0を確認する。配備応答だけで実機飛行の成功としない。

未マージの作業ブランチを本番へ配備しない。代理マージ、main直接push、自動マージ、他作品の公開設定変更は行わない。問題発生時は本作の既知正常artifactを用い、保存形式との互換性を確認する。モバイル実機の操作感・音・GPU性能はクラウドの模擬検査とは別の確認項目である。

後続の修正PR [#5](https://github.com/chameleonjp-lab/machimamore/pull/5) は2026-10-05T04:55:59Zに本人側で採用され、mainは `fa323bef322eb62f350011f3bd5f8af3935e17d9` になった。上記のDraft候補という記述はその提出時点の記録である。最終検証資料は別のDraft PR #6へ提出し、担当agentはマージ・公開を行わない。新しい検査PNGと長時間・作戦の大きなraw記録はローカル保持とし、公開資料には全入力行・全177観測のJSON投影と元記録のhashを保存する。
