import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { FlightAudio } from '../src/audio';
import { createGame, getPlayer, startGame } from '../src/simulation';
import type { GameEvent } from '../src/types';

class Param {
  value = 0;
  cancelScheduledValues() {}
  setTargetAtTime() {}
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
}
class Node {
  frequency = new Param(); gain = new Param(); pan = new Param();
  onended: (() => void) | null = null;
  type = 'sine'; stopped = false; disconnected = false; started = false;
  connect() {} start() { this.started = true; } stop() { this.stopped = true; } disconnect() { this.disconnected = true; }
}
class Context {
  static created = 0; static latest: Context | null = null;
  state = 'suspended'; currentTime = 0; destination = new Node(); nodes: Node[] = [];
  constructor() { Context.created++; Context.latest=this; }
  createGain() { const n = new Node(); this.nodes.push(n); return n; }
  createOscillator() { const n = new Node(); this.nodes.push(n); return n; }
  createStereoPanner() { const n = new Node(); this.nodes.push(n); return n; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
function events(missionId: number): GameEvent[] {
  return Array.from({ length: 80 }, (_, id) => ({ id, missionId, tick: id * 12, type: 'laser', position: new Vector3(), owner: 100 }));
}

test('audio stays off by default, owns one context, caps sources, and releases them on stop/restart', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } });
  try {
    Context.created = 0;
    const audio = new FlightAudio();
    const state=createGame({mode:'easy'});startGame(state);const player=getPlayer(state)!;audio.updatePlayer(player);
    await audio.unlock();
    assert.equal(Context.created, 0);
    audio.enabled = true; audio.active = true;
    await Promise.all([audio.unlock(), audio.unlock()]);
    assert.equal(Context.created, 1);
    const nodes=Context.latest!.nodes,engines=nodes.filter(node=>node.started),partials=nodes.filter(node=>[.45,.2,.12].includes(node.gain.value));
    assert.equal(engines.length,3,'the propeller engine uses three partials');
    assert.deepEqual(engines.map(node=>node.type),['sawtooth','sine','sine']);
    const base=40+player.speed*.13;assert.deepEqual(engines.map(node=>node.frequency.value),[base,base*2,base*3]);
    assert.deepEqual(partials.map(node=>node.gain.value),[.45,.2,.12]);
    assert.equal(audio.activeSources,3,'three live engine voices are included in source accounting');
    audio.consume(events(1));
    assert.equal(audio.activeSources, 10);
    assert.equal(audio.activeEffectSourceCount,7,'the three-part engine leaves seven slots for effects');
    audio.consume(events(1));
    assert.equal(audio.activeSources, 10, 'replaying a rendered event list cannot replay sounds');
    audio.active = false; audio.sync();
    assert.equal(audio.activeSources, 0);
    assert.ok(engines.every(node=>node.stopped&&node.disconnected),'all engine oscillators are stopped and disconnected');
    assert.ok(partials.every(node=>node.disconnected),'all engine partial gains are disconnected');
    assert.equal(audio.contextState, 'suspended');
    for (let mission = 2; mission <= 12; mission++) {
      audio.resetFlight(); audio.active = true; await audio.unlock(); audio.sync();
      assert.equal(audio.activeSources,3,'restart restores the three engine voices without stale sources');
      audio.consume(events(mission)); assert.ok(audio.activeSources <= 10);
      audio.active = false; audio.sync(); assert.equal(audio.activeSources, 0);
    }
    assert.equal(Context.created, 1);
    audio.dispose();
    assert.equal(audio.contextCount, 0); assert.equal(audio.activeSources, 0);
    await audio.unlock(); assert.equal(Context.created, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('boss warning and start use bounded effects, honor mute and never replay events', async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:Context}});
 try{const audio=new FlightAudio();audio.enabled=true;audio.active=true;await audio.unlock();const event:GameEvent={id:1,missionId:999,tick:0,type:'boss-warning',position:new Vector3(),owner:-1};audio.consume([event]);assert.equal(audio.activeEffectSourceCount,1);audio.consume([event]);assert.equal(audio.activeEffectSourceCount,1);audio.enabled=false;audio.sync();audio.consume([{...event,id:2,tick:180,type:'boss-start'}]);assert.equal(audio.activeEffectSourceCount,0);audio.dispose();}finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});
