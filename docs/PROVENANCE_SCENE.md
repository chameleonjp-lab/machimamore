# 画面・描画・音の来歴

対象工程: P12–P15、P17。移行元は Kaisen `5f4565ee550ce9a1351516aa31ba9b5232c36e05` に固定し、移行元リポジトリを変更していない。依頼された同一所有者の移植であり、リポジトリ全体をMIT素材とは扱わない。Three.jsの許諾表示は `public/third-party-notices.txt` に保持する。

| 本作ファイル | 固定移行元の参照 | 元Git blob | 移行と適応 |
| --- | --- | --- | --- |
| `src/aircraft.ts` | `src/aircraft.ts` | `e4e3009464bb8c4ae473b7cfc46d010198c27149` | バイト単位でコピー。翼型、カウル、風防、尾翼、塗装、舵、プロペラを保持。1機のheroと7機の低詳細モデルを固定プールで使い、操縦引き継ぎ時もheroの描画を操縦機へ割り当てる。共有geometry/material/textureの所有はAircraftFactory。 |
| `src/flight-view.ts` | `src/flight-view.ts` | `87f83928a00092338391442ec2d7e87e3b4e33da` | 固定FOV64、後方29m/上方11m、バンク伝達45%、Easy/Normalの視線姿勢、投影を保持。型のimportだけを `flight-types.ts` へ変更。 |
| `src/aircraft-batch.ts` | `src/aircraft-batch.ts` | `6aed47adeb8d22f976b99f0630bb2e841bb054b9` | バイト単位でコピー。可動舵・プロペラ・透明風防を保持し、同じ親・材質の静的opaque meshだけをまとめる。頂点・三角形・形状を簡略化しない。 |
| `src/main.ts` | `src/main.ts` | `d465d6cd75963122245430ba4961e0dd9d972d98` | 画面遷移と開始準備・明示停止の構造を参照し新規実装。有限50機作戦のsimulation APIへ接続。旧作の艦・投下兵装・40秒補充・得点・終了条件を流用しない。 |
| `src/rules-guide.ts` | `src/rules-guide.ts` | `e420ed346b6d8c5797805b51e31a7f1b43a0ed6b` | native dialog、Tab境界、Esc、元フォーカス復帰のパターンを適応。説明本文は本作のルールと定数から作成。 |
| `src/audio.ts` | `src/audio.ts` | `efb077f729aa3c95c3e2e8db518a47095e45fa0c` | 初期OFF、明示ON、1つの共有AudioContext、停止時解放を参照し、本作専用の有界合成音を新規実装。プロペラの控えめなgain `.0475` を出典値として使用。録音音源のコピーはない。 |
| `index.html`、`src/style.css`、`src/hud.ts` | 固定版のホーム・HUD・停止・結果・説明の配置関係 | style: `426c91997d93dc263f855406518e6b958193647d` | 新規作成。ブランド、目的、残機/出撃/予備、街、結果内訳、9操作に合わせる。既存設定ダイアログのCSSはcontrols担当が独立に移行。 |
| `src/scene.ts` | 本作要件R01/R04/R35–R43/R74/R92 | 新規 | 港・海・山・20街区画・円盤UFO・母艦・警告線・ビーム・マーカーは手続き生成。外部の地図、歴史建造物、画像、音源、フォントを取得しない。 |

## 状態と資源の境界

- mainだけがrAF間隔から固定60Hzのtickを受理する。長いframe gap（250ms超）や過負荷は明示停止し、隠れたtick捨て・敵の減速を行わない。blur、非表示、WebGL喪失、描画失敗は入力を解放し、戻っただけで再開しない。
- 描画準備は、ホームと飛行画面に加え、まだ不可視の警告・ビーム・弾・煙・瓦礫を含む固定プール全部のshader compileとGPU転送を完了してから開始可能にする。Threeが通常のRenderTargetでは出力色空間とtone mappingのshaderを変えるため、実際のcanvas上の小さいviewport/scissorで準備描画し、WebGL2のfenceを短い非同期ポーリングで待つ。可視性・culling・弾drawRange・カメラ・描画先・viewport/scissorはfinallyで復元し、全画面の飛行とホームも描画してGPU完了を確認する。論理状態・tick・AIは変更しない。ホーム・停止・結果は通常入力で操作し、設定と説明を閉じても停止を解除しない。
- 初期描画品質はMSAAをOFFとした。1366×768/DPR1のSwiftShader診断で、OFFだけが5秒区間を停止せず終了したためのR91の描画品質調整で、constructorの属性だけを変更した。機体の形状・材質・カメラ・ゲーム時間・同時出撃数は保持する。保存PNGでは輪郭の段差が見える。短い診断を実機性能目標や15分検査のpassとせず、異なる終端tickから正確な速度改善率も算出しない。[診断記録](evidence/renderer-diagnostics.json)に準備失敗例も残す。
- 準備に10秒の上限を設け、完了しなければ開始不可と再試行を表示する。準備中のWebGL喪失はgenerationを更新して待機を取り消す。古い準備のcatch/finallyが新しい準備のUIや所有を変更しない。復旧前には明示的なページ再読込にも到達できる。
- ビーム終点は論理側の `beam.end` をそのまま使う。警告線は固定S/Pの破線、発射後は連続実線。表示側に別の命中判定を設けない。警告のposition/lineDistance BufferAttributeは固定配列を更新し、毎フレーム置換しない。
- 味方8・UFO8、ビーム40、航空弾2,048の描画枠を固定する。UFOはprototypeを複製しgeometry/materialを共有する。再出撃は同じ場景資源を再利用する。
- 街の6棟と屋根6枚は、区画ごとに2つのInstancedMeshで表現する。屋根を含めて論理AABB内へ収める。UFOの発光銃口は固定照準Sと同じentity原点へ置く。
- 破壊街区画は1区画1meshの固定瓦礫表示で最大20。煙は別の固定装飾で1区画3mesh、最大60。`metrics().debrisMeshes` と `smokeMeshes` は実際に可視のmesh数を分けて返す。`decorations` は瓦礫数と同じ。瓦礫や煙を論理損傷の対象へ増殖させない。
- 母艦は飛行域の外に置く。勝利後の撤退に渡す3秒の表示用時間は、確定したsimulation.tick/elapsed/resultを変更しない。OSの動作軽減では海の装飾変化を止め、母艦は直ちに撤退位置へ移す。警告情報、移動、当たり判定、作戦速度は変えない。
- 音はlazyな共有context1個。プロペラ1sourceと効果音最大9sourceで合計10を上限にする。停止・消音・非表示でsourceを停止、contextを休止する。イベントIDと作戦IDで再生重複を防ぐ。新しい作戦でcontextを作り直さない。
- 開発時の `window.__machimamoreRead()` はJSONへ複製した読取観察のみ。入力所有、状態、描画・音資源を取得できるがゲーム状態を変更するAPIは設けない。Viteの `import.meta.env.DEV` 分岐内に置き、公開ビルドへ同梱しない。

## 検査の範囲

HUDの自機HP/弾数、注意表示、残機カードを別領域へ分け、320×568と568×320では照準と初期姿勢の自機投影域を避ける配置にした。Normalの5寸法とEasyの小さい縦・横画面の保存PNGを担当者が実際に開き、自機・照準・ボタンが隠れないことを確認した。街と敵のworld labelは密集する場面があり、読みやすさの限界として残す。デスクトップの開始メッセージと操作ヒントの重なりは、メッセージ表示中だけヒントを隠すCSSで修正した。この最終CSSを含む画像は最終ブラウザ記録で確認する。機体geometry/material、固定カメラ、飛行論理を変えて配置を合わせていない。

型/buildを実行し、初稿のES2022配列APIとTypeScriptのphase narrowingの故障を修正後に通過した。通常画面・指定寸法・結果・最大描画・音の検査は本作の検査記録へ結び付ける。Kaisenの過去passは本作のpassへ移さない。音の合成と有限sourceの機械検査は、実聴感・端末スピーカー出力とは別に記録する。実機GPU性能、iPhone Safariの操作感、VoiceOverの実機評価を模擬ブラウザで合格扱いにしない。

小さい縦画面のNormalで再装填と低高度注意が同時に出る時だけ、注意を2列にして街警告を右列へ置き、開始captionをPlaying中に抑制する。保存したDOM組合せfixtureの修正前後PNGを実際に開き、修正後は機体投影域と15.95px離れることを確認した。fixtureは論理Pausedのままであり、自然な戦闘結果や性能測定の代用ではない。
