import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createGame, startGame, stepGame, getPlayer } from '../src/simulation';
import { desiredFlightInput } from '../src/flight';
import { pilotInput } from '../scripts/legal-pilot';

// Reproduce the audit's legal-input flights, never editing simulation state.
// Reintroducing the boss's horizontal-radius sphere must fail all three seeds.
for (const seed of [11, 29, 211]) test(`boss has no invisible upper collision during legal flight, seed ${seed}`, () => {
  const state = createGame({ mode: 'normal', seed }); startGame(state);
  let bossTicks = 0;
  for (let tick = 0; tick < 12000 && state.phase === 'playing'; tick++) {
    const player = getPlayer(state), boss = state.ufos.find(u => u.variant === 'boss');
    let input = pilotInput(state, 'active');
    if (player && boss) {
      bossTicks++;
      const objective = boss.position.clone().add(new Vector3(0, 130, 0));
      if (player.position.y < 810) objective.copy(player.position).add(new Vector3(0, 300, -300));
      const delta = objective.clone().sub(player.position), pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      input = { ...desiredFlightInput(player, objective), climb: Math.max(-1, Math.min(1, (pitch + .75 * (pitch - player.pitch)) / .95)), fire: false, loop: false, steeringActive: true };
      const magnitude = Math.hypot(input.turn, input.climb);
      if (magnitude > 1) { input.turn /= magnitude; input.climb /= magnitude; }
    }
    const before = player?.health;
    stepGame(state, input);
    assert.equal(state.fault, null);
    if (player && boss && before && player.health === 0 && state.events.some(e => e.type === 'hit' && e.owner === boss.id && e.target === player.id)) {
      assert.ok(player.position.y - player.radius <= boss.position.y + 50.8 + 1e-6,
        `invisible boss hit at tick ${state.tick}: player y=${player.position.y}, boss top=${boss.position.y + 50.8}`);
    }
  }
  assert.ok(bossTicks > 100, 'legal flight must reach and exercise boss phase');
});

test('new mission legally clears initial wave, warning, entry, boss and victory without state injection', () => {
  const state = createGame({ mode: 'easy', seed: 11 }); startGame(state);
  let warnings=0,starts=0,bossTicks=0;
  for (let tick=0;tick<36000&&state.phase==='playing';tick++) {
    stepGame(state,pilotInput(state,'active'));
    assert.equal(state.fault,null);
    warnings+=state.events.filter(e=>e.type==='boss-warning').length;
    starts+=state.events.filter(e=>e.type==='boss-start').length;
    if(state.bossBattle.phase==='entering'||state.bossBattle.phase==='active') {
      bossTicks++; const count=state.ufos.filter(u=>u.variant==='escort'&&u.health>0).length;
      assert.ok(count>=3&&count<=6);
    }
    assert.ok(state.stats.bossDamage<=640+1e-6&&state.stats.escortScoredDamage<=480+1e-6&&state.stats.escortScoredKills<=6);
  }
  assert.equal(warnings,1); assert.equal(starts,1); assert.ok(bossTicks>0);
  assert.equal(state.result?.outcome,'victory'); assert.equal(state.stats.bossKills,1);
  assert.equal(state.result?.enemyDestroyed,50);
});
