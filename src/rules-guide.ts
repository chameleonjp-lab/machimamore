import type { GameMode } from './types';
import { containDialogTabFocus } from './dialog-focus';
import { ACTIVE_LIMIT, TOTAL_AIRCRAFT, RESPAWN_TICKS, TICK_RATE, RELOAD_TICKS, MG_CAPACITY, CANNON_CAPACITY, CITY_DISTRICTS, CITY_TOTAL_HEALTH, LASER_WARNING_TICKS, LASER_LIFETIME_TICKS, LASER_MAX_BURST, LASER_COOLDOWN_TICKS, LASER_INTERVAL_TICKS, RULES_VERSION, SCORE_RULES } from './rules';

export type GuideInput = 'touch' | 'keyboard';
export interface RulesContext { mode: GameMode; input: GuideInput; keyboardDescription: string; }
export interface RuleSection { heading: string; paragraphs: string[]; }
export function ruleSections({ mode, input, keyboardDescription }: RulesContext): RuleSection[] {
  return [
    { heading: '街を守る作戦', paragraphs: [
      `街を守り、敵UFO全${TOTAL_AIRCRAFT}機を撃破すれば勝利です。味方も自機を含めて総数${TOTAL_AIRCRAFT}機。同時出撃は両陣営${ACTIVE_LIMIT}機ずつで、初めの出撃機も総数に含みます。`,
      `街は${CITY_DISTRICTS}区画、総耐久${CITY_TOTAL_HEALTH.toLocaleString()}HPです。街の耐久が0、または味方残機が0になると敗北。最後の敵と街・味方の全滅が同時なら敗北です。時間制限はありません。`,
      '敵が画面からいなくなっても、予備や復帰待ちが残っていれば作戦は続きます。残機は「出撃中＋復帰待ち＋予備」。HUDは累計撃破と現在の出撃数を分けて示します。',
      '巨大宇宙船はUFOの母艦です。今回の撃破対象ではなく、撃っても損傷や得点はありません。舞台は架空の港湾都市で、歴史事件や実在の被害を再現する作品ではありません。',
    ] },
    { heading: '被撃墜と復帰', paragraphs: [
      `自機も僚機も、予備があれば破壊から${RESPAWN_TICKS / TICK_RATE}秒後に別の残機で復帰します。自機の復帰待ち中も街と編隊の戦闘は続きます。復帰待ちの入力は次の機体へ持ち越しません。`,
      '予備が尽きても味方が残っていれば、待機後に僚機の操縦を引き継ぎます。引き継いだ機体のHPや残弾はそのままです。自機を失っただけでは作戦終了になりません。',
      '海・地形・機体への衝突は機体を失う原因になります。街区画との衝突は街にも損傷を与えます。復帰するたびに損失点が計上されます。',
    ] },
    { heading: input === 'touch' ? 'スマートフォンの操作' : 'PCの操作', paragraphs: input === 'touch' ? [
      'ボタンのない場所に触れ、その位置から相対ドラッグで操縦します。離すと入力が戻ります。別の指で操作ボタンを同時に押せます。',
      mode === 'easy' ? 'イージーは巡航速度で飛び、照準円内・1.2km以内の敵へ自動射撃します。敵の少し先を狙ってください。「宙返り」は1回押すと実行します。' : 'ノーマルは照準補助なし。「射撃」は長押し、「宙返り」は1回押します。速度レバーは上で加速・下で減速。離すと中央へ戻り、調整した速度を保ちます。',
      '操作設定でボタンと速度レバーの位置・大きさ・不透明度を、操作モードごとに調整できます。PCキーの設定にも切り替えられます。',
    ] : [
      keyboardDescription,
      'マウスの相対ドラッグでも操縦できます。宙返りは押し直すと次の操作になり、射撃と加減速は保持入力です。操作設定のキー割当は説明にも反映されます。',
      mode === 'easy' ? 'イージーは巡航速度と自動射撃。照準円内でも必ず命中するわけではありません。相手の少し先を狙ってください。' : 'ノーマルは手動射撃と加減速。自機弾が味方や街に当たると損傷を与えます。街損傷と失った味方は結果に反映されます。',
    ] },
    { heading: '射撃と装填', paragraphs: [
      `機銃${MG_CAPACITY}発・機関砲${CANNON_CAPACITY}発は別々に消費し、両方が空になると${RELOAD_TICKS / TICK_RATE}秒の共通再装填に入ります。補給は無限ですが、装填中は撃てません。射撃の長押しは装填完了後に再開します。僚機にも同じ装填があります。`,
      '遠い標的ほど弾の威力が下がります。航空弾はUFO・街・地形で止まります。ノーマルの自機弾は味方機にも当たります。イージーの自機弾と僚機弾は、味方機を保護して通過します。イージーでも街では弾が止まりますが、街に損傷は与えません。レーザーは最も近い機体・街・地形で止まります。',
    ] },
    { heading: 'レーザーを避ける', paragraphs: [
      `UFOは${LASER_WARNING_TICKS / TICK_RATE}秒の破線予告後、同じ固定照準へ${LASER_INTERVAL_TICKS / TICK_RATE}秒間隔で最大${LASER_MAX_BURST}本を発射します。実線のビームは1本${LASER_LIFETIME_TICKS / TICK_RATE}秒持続し、最後のビームが消えてから${LASER_COOLDOWN_TICKS / TICK_RATE}秒休止します。`,
      '予告が始まると発射地点と狙う地点は固定されます。射撃中のUFOは静止します。破線の射線から動いて離れ、実線に触れ続けないようにしてください。発射済みのビームは射手を倒しても寿命まで残ります。',
      'ビームは最も近い機体・街・地形で止まり、奥へ貫通しません。敵は菱形、味方は四角のマーカーで識別できます。街への攻撃は区画と方向の通知でも知らせます。音をオフにしても予告は見えます。',
    ] },
    { heading: '得点と命中率', paragraphs: [
      `編隊全体のUFO撃破1機につき${SCORE_RULES.ufoKill.toLocaleString()}点、実際に与えたUFO損傷1HPにつき${SCORE_RULES.ufoDamage}点。勝利時だけ、${SCORE_RULES.timeBonus.toLocaleString()} ÷（1＋作戦秒数÷${SCORE_RULES.timeScale}）の時間ボーナスを加えます。`,
      `自機損失1機につき${SCORE_RULES.playerLoss.toLocaleString()}点、僚機損失1機につき${SCORE_RULES.allyLoss.toLocaleString()}点を引きます。街損傷1HPにつき${SCORE_RULES.cityDamage}点、破壊区画1つにつき${SCORE_RULES.cityDestroyed.toLocaleString()}点を引きます。`,
      `自機の実発射弾を分母、UFOのHPを減らした弾を分子とする命中率で、${SCORE_RULES.accuracyPenalty.toLocaleString()}×（1−命中率）点を引きます。未射撃は「—（未射撃）」で減点0です。作戦中は暫定、終端tickで確定します。過剰損傷や同じ撃破は加点しません。`,
    ] },
    { heading: '停止・設定・音', paragraphs: [
      '停止中は作戦時計、移動、装填、復帰、レーザー、危険予告、得点も止まります。画面の非表示・フォーカス喪失・描画エラー・長いフレーム欠落でも停止します。戻っただけでは再開せず、「飛行を再開」を押してください。説明や設定を閉じても再開しません。',
      'ホームへ戻ると作戦は中断です。再出撃は新しい作戦として始まります。操作設定は明示的に保存するか「今回だけ使う」を選び、取消しは現在の設定を変えません。',
      '音は初期オフで、音ボタンからオンにできます。OSの「動きを減らす」に合わせて装飾の動きを抑えます。必要な警告とゲームの進行速度は変わりません。',
      `ルール版: ${RULES_VERSION}`,
    ] },
  ];
}

export class RulesGuide {
  private readonly dialog: HTMLDialogElement;
  private readonly content: HTMLElement;
  private returnFocus: HTMLElement | null = null;
  private readonly abort = new AbortController();
  get isOpen() { return this.dialog.open; }
  constructor(private readonly context: () => RulesContext, private readonly clearInput: () => void) {
    this.dialog = document.createElement('dialog'); this.dialog.id = 'rules-guide'; this.dialog.className = 'rules-dialog';
    this.dialog.setAttribute('aria-labelledby', 'rules-title');
    this.dialog.innerHTML = '<header class="rules-header"><div><p class="eyebrow">HOW TO PLAY</p><h2 id="rules-title">ルールと操作方法</h2></div><button type="button" id="rules-close" aria-label="説明を閉じる">×</button></header><div id="rules-content" class="rules-content" tabindex="0" role="region" aria-label="ルール説明の内容"></div><footer><button type="button" id="rules-back" class="primary">元の画面へ戻る</button></footer>';
    document.getElementById('app')!.append(this.dialog); this.content = this.dialog.querySelector('#rules-content')!;
    for (const id of ['rules-close', 'rules-back']) this.dialog.querySelector('#'+id)!.addEventListener('click', () => this.close(), { signal:this.abort.signal });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); }, { signal:this.abort.signal });
    this.dialog.addEventListener('keydown', event => containDialogTabFocus(this.dialog, event), { signal:this.abort.signal });
    this.dialog.addEventListener('close', () => { this.clearInput(); this.returnFocus?.focus({ preventScroll:true }); }, { signal:this.abort.signal });
  }
  open(button: HTMLElement) {
    if (this.isOpen) return; this.returnFocus=button; this.clearInput(); this.content.replaceChildren();
    for (const section of ruleSections(this.context())) { const element=document.createElement('section'), heading=document.createElement('h3'); heading.textContent=section.heading; element.append(heading); for (const text of section.paragraphs) { const p=document.createElement('p'); p.textContent=text; element.append(p); } this.content.append(element); }
    this.dialog.showModal(); this.content.scrollTop=0; this.dialog.querySelector<HTMLButtonElement>('#rules-close')!.focus({preventScroll:true});
  }
  close() { if (this.isOpen) this.dialog.close(); }
  dispose() { this.close(); this.abort.abort(); this.dialog.remove(); }
}
