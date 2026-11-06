import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './simulation-fixtures';
import { getPlayer, startGame } from '../src/simulation';
import { forwardOf, updateQuaternion } from '../src/flight';
import { pilotInput } from '../scripts/legal-pilot';

test('legal pilot uses a pitch-rate command for an already aligned elevated target',()=>{
  const state=fixture(1,1,false);state.mode='easy';const player=getPlayer(state)!,target=state.ufos[0];
  player.position.set(0,800,0);player.previous.copy(player.position);player.pitch=.4;updateQuaternion(player);
  target.position.copy(player.position).addScaledVector(forwardOf(player),500);target.previous.copy(target.position);
  target.velocity.set(0,0,0);target.waypoint.copy(target.position);startGame(state);
  const before=JSON.stringify(state),input=pilotInput(state,'active');
  assert.ok(Math.abs(input.climb)<.02,`already aligned: climb=${input.climb}`);
  assert.equal(input.steeringActive,true);assert.equal(JSON.stringify(state),before);
});
