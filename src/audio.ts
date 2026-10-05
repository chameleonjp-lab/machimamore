import type { Aircraft, GameEvent } from './types';

/** One lazily created context. Engine + effects are capped at ten live sources. */
export class FlightAudio {
  enabled = false;
  active = false;
  failed = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private effects = new Map<OscillatorNode, AudioNode[]>();
  private lastMission = -1;
  private lastEvent = -1;
  private lastSoundTick = new Map<string, number>();
  private player: Aircraft | null = null;
  private unlocking: Promise<void> | null = null;
  private disposed = false;
  get activeEffectSourceCount() { return this.effects.size; }
  get activeSources() { return this.effects.size + Number(this.engine !== null); }
  get contextCount() { return Number(this.ctx !== null); }
  get contextState() { return this.ctx?.state ?? 'uncreated'; }

  async unlock(): Promise<void> {
    if (!this.enabled || this.disposed) return;
    if (this.unlocking) return this.unlocking;
    const request = (async () => {
      try {
        if (!this.ctx) {
          const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (!AudioCtor) throw new Error('Web Audio is unavailable');
          this.ctx = new AudioCtor(); this.master = this.ctx.createGain(); this.master.gain.value=0; this.master.connect(this.ctx.destination);
        }
        await this.ctx.resume(); this.failed = this.ctx.state !== 'running'; this.sync();
      } catch { this.failed=true; }
    })();
    this.unlocking=request; try { await request; } finally { if(this.unlocking===request)this.unlocking=null; }
  }
  sync(): void {
    if (!this.ctx || !this.master) return;
    const running = this.enabled && this.active && !this.disposed;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(running ? 0.23 : 0, this.ctx.currentTime, 0.012);
    if (!running) {
      this.stopEffects(); this.stopEngine();
      if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => { this.failed=true; });
      return;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => { this.failed=true; });
    this.startEngine();
  }
  updatePlayer(player: Aircraft | null): void {
    this.player=player;
    if (this.engine && this.ctx) this.engine.frequency.setTargetAtTime(player ? 48 + player.speed * .34 : 35, this.ctx.currentTime, .12);
    if (this.engineGain && this.ctx) this.engineGain.gain.setTargetAtTime(player ? .0475 : .012, this.ctx.currentTime, .1);
  }
  private startEngine(): void {
    if(this.engine || !this.ctx || !this.master)return;
    const engine=this.ctx.createOscillator(), gain=this.ctx.createGain(); engine.type='sawtooth'; engine.frequency.value=85; gain.gain.value=.0475;
    engine.connect(gain); gain.connect(this.master); engine.start(); this.engine=engine; this.engineGain=gain;
  }
  private stopEngine(): void {
    if(this.engine){try{this.engine.stop();}catch{}this.engine.disconnect();this.engine=null;}
    this.engineGain?.disconnect(); this.engineGain=null;
  }
  consume(events: readonly GameEvent[]): void {
    for(const event of events) {
      if(event.missionId!==this.lastMission){this.lastMission=event.missionId;this.lastEvent=-1;this.lastSoundTick.clear();}
      if(event.id<=this.lastEvent)continue; this.lastEvent=event.id;
      if(!this.enabled || !this.active || !this.ctx || this.ctx.state!=='running')continue;
      const category=event.type==='damage' && event.targetKind==='city' ? 'city-hit' : event.type==='hit' && event.targetKind==='aircraft' && event.target===this.player?.id ? 'damage' : event.type==='shot' ? event.weapon==='cannon'?'cannon':'mg' : event.type;
      const interval=category==='mg'?3:category==='cannon'?8:category==='laser'?10:category==='warning'?24:category==='city-hit'?16:8;
      if(event.tick-(this.lastSoundTick.get(category)??-999)<interval)continue;
      let preset: [number,number,number,OscillatorType,number] | null=null;
      switch(category){
        case 'mg': preset=[155,58,.065,'square',.12];break;
        case 'cannon': preset=[95,30,.14,'sawtooth',.23];break;
        case 'warning': preset=[610,740,.18,'sine',.19];break;
        case 'laser': preset=[1550,360,.22,'sawtooth',.11];break;
        case 'damage': preset=[160,38,.25,'triangle',.30];break;
        case 'city-hit': preset=[70,28,.22,'triangle',.24];break;
        case 'hit': preset=[310,85,.10,'triangle',.12];break;
        case 'kill': case 'city-destroyed': preset=[95,18,.45,'sawtooth',.27];break;
        case 'respawn': case 'takeover': preset=[280,560,.25,'sine',.15];break;
      }
      if(!preset || this.effects.size>=9)continue;
      this.lastSoundTick.set(category,event.tick);this.tone(event,...preset);
    }
  }
  private tone(event: GameEvent, from: number, to: number, seconds: number, shape: OscillatorType, volume: number): void {
    if(!this.ctx||!this.master)return;
    const ctx=this.ctx, source=ctx.createOscillator(), gain=ctx.createGain(), pan=ctx.createStereoPanner(), now=ctx.currentTime;
    const distance=this.player?.position.distanceTo(event.position)??150;
    const local=this.player ? event.position.clone().sub(this.player.position).applyQuaternion(this.player.quaternion.clone().invert()) : null;
    pan.pan.value=local ? Math.max(-1,Math.min(1,local.x/Math.max(80,Math.hypot(local.x,local.z)))) : 0;
    source.type=shape; source.frequency.setValueAtTime(from,now);source.frequency.exponentialRampToValueAtTime(Math.max(1,to),now+seconds);
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(volume/(1+distance/450),now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+seconds);
    source.connect(gain);gain.connect(pan);pan.connect(this.master);this.effects.set(source,[gain,pan]);
    source.onended=()=>{source.disconnect();for(const node of this.effects.get(source)??[])node.disconnect();this.effects.delete(source);};
    source.start(now);source.stop(now+seconds+.02);
  }
  private stopEffects(): void { for(const [source,nodes] of this.effects){source.onended=null;try{source.stop();}catch{}source.disconnect();for(const node of nodes)node.disconnect();}this.effects.clear(); }
  resetFlight(): void { this.stopEffects();this.lastMission=-1;this.lastEvent=-1;this.lastSoundTick.clear();this.player=null; }
  dispose(): void { this.disposed=true;this.active=false;this.sync();const ctx=this.ctx;this.ctx=null;this.master?.disconnect();this.master=null;if(ctx)void ctx.close().catch(()=>{}); }
}
