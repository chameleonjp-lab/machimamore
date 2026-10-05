import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { FlightAudio } from '../src/audio';
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
  type = 'sine'; stopped = false; disconnected = false;
  connect() {} start() {} stop() { this.stopped = true; } disconnect() { this.disconnected = true; }
}
class Context {
  static created = 0;
  state = 'suspended'; currentTime = 0; destination = new Node(); nodes: Node[] = [];
  constructor() { Context.created++; }
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
    await audio.unlock();
    assert.equal(Context.created, 0);
    audio.enabled = true; audio.active = true;
    await Promise.all([audio.unlock(), audio.unlock()]);
    assert.equal(Context.created, 1);
    audio.consume(events(1));
    assert.equal(audio.activeSources, 10);
    audio.consume(events(1));
    assert.equal(audio.activeSources, 10, 'replaying a rendered event list cannot replay sounds');
    audio.active = false; audio.sync();
    assert.equal(audio.activeSources, 0);
    assert.equal(audio.contextState, 'suspended');
    for (let mission = 2; mission <= 12; mission++) {
      audio.resetFlight(); audio.active = true; await audio.unlock(); audio.sync();
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
