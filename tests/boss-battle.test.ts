import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createGame, startGame, stepGame, pauseGame, resumeGame } from '../src/simulation';
import { fixture, bullet } from './simulation-fixtures';
import { calculateScore, createStats } from '../src/score';
function cleared() { const s=fixture(1,0,false); startGame(s); return s; }
function enter() {const s=cleared();stepGame(s);for(let i=0;i<180;i++)stepGame(s);return s;}
test('50 cleared enters one warning, then a 640HP boss and three live escorts',()=>{const s=cleared();stepGame(s);assert.equal(s.result,null);assert.equal((s as any).bossBattle.phase,'alert');assert.equal(s.events.filter(e=>e.type as string==='boss-warning').length,1);for(let i=0;i<180;i++)stepGame(s);assert.equal(s.fault,null);assert.equal(s.ufos.find(u=>(u as any).variant==='boss')?.maxHealth,640);assert.equal(s.ufos.filter(u=>(u as any).variant==='escort').length,3);});
test('boss moves over city; escorts remain 3–6 at every tick including simultaneous removal',()=>{const s=enter();const boss=s.ufos.find(u=>(u as any).variant==='boss')!;assert.ok(boss);const z=boss.position.z;for(let i=0;i<600;i++){if(i%30===0)s.ufos=s.ufos.filter(u=>(u as any).variant==='boss');stepGame(s);assert.equal(s.fault,null);assert.equal(s.result,null);const escorts=s.ufos.filter(u=>(u as any).variant==='escort');assert.ok(escorts.length>=3&&escorts.length<=6);for(const u of escorts)assert.ok(u.position.z>=-1970&&u.position.z<=1970&&u.position.y>=80&&u.position.y<=1070);}assert.ok(boss.position.z>z);assert.equal((s as any).bossBattle.phase,'active');});
test('pause freezes boss and population; fresh mission resets them',()=>{const s=enter();pauseGame(s);const before=JSON.stringify(s);for(let i=0;i<60;i++)stepGame(s);assert.equal(JSON.stringify(s),before);resumeGame(s);stepGame(s);assert.equal(s.fault,null);assert.equal((createGame() as any).bossBattle.phase,'wave');});
test('boss survives one collision with 560HP and the player dies once',()=>{const s=enter(),boss=s.ufos.find(u=>(u as any).variant==='boss')!;assert.ok(boss);const p=s.fighters[0];p.position.copy(boss.position);p.previous.copy(p.position);stepGame(s);assert.equal(boss.health,560);assert.equal(s.stats.playerLosses,1);});
test('boss actual overkill is capped and victory freezes without escort requirement',()=>{const s=enter(),boss=s.ufos.find(u=>(u as any).variant==='boss')!;assert.ok(boss);s.bullets=[{...bullet(s,boss.position.clone(),new Vector3(0,0,-100),10000),birthTick:s.tick,expiresTick:s.tick+90}];s.stats.shots=1;stepGame(s);assert.equal(s.fault,null);assert.equal(s.result?.outcome,'victory');assert.equal((s.stats as any).bossDamage,640);assert.equal((s.result?.breakdown as any).bossDestruction,8000);assert.equal((s.result?.breakdown as any).bossDamage,3200);const frozen=JSON.stringify(s);stepGame(s);assert.equal(JSON.stringify(s),frozen);});
test('finite boss and first-six escort ledger has a 119600 mathematical ceiling',()=>{const stats={...createStats(),ufoDamage:4000,bossDamage:640,bossKills:1,escortScoredDamage:480,escortScoredKills:6};assert.equal(calculateScore(stats,50,0,true).total,119600);assert.ok(calculateScore(stats,50,1,true).total<119600);});

test('same-tick escort kills refill immediately; only initial six are scored',()=>{
 const s=enter();
 for(let wave=0;wave<4;wave++){
  const escorts=s.ufos.filter(u=>u.variant==='escort');assert.equal(escorts.length,3);
  s.bullets=escorts.map((u,i)=>({...bullet(s,u.position.clone(),new Vector3(0,0,-100),1000),id:50000+wave*10+i,birthTick:s.tick,expiresTick:s.tick+90}));s.stats.shots+=escorts.length;
  stepGame(s);assert.equal(s.fault,null);assert.equal(s.ufos.filter(u=>u.variant==='escort').length,3);
  assert.equal(s.stats.escortKills,(wave+1)*3);assert.equal(s.stats.escortScoredKills,Math.min(6,(wave+1)*3));assert.equal(s.stats.escortScoredDamage,Math.min(480,(wave+1)*240));
 }
 assert.equal(s.stats.hits,12);assert.equal(s.stats.bossDamage,0);assert.equal(s.stats.ufoDamage,0);
});
test('undisturbed launch cadence reaches six and never seven',()=>{const s=enter();for(let i=0;i<550;i++){stepGame(s);assert.equal(s.fault,null);assert.ok(s.ufos.filter(u=>u.variant==='escort').length<=6);}assert.equal(s.ufos.filter(u=>u.variant==='escort').length,6);});
test('boss and final friendly death in same tick is defeat with zero time bonus',()=>{const s=enter(),boss=s.ufos.find(u=>u.variant==='boss')!;s.fighters[0].position.y=1;s.bullets=[{...bullet(s,boss.position.clone(),new Vector3(0,0,-100),10000),birthTick:s.tick,expiresTick:s.tick+90}];s.stats.shots=1;stepGame(s);assert.equal(s.result?.outcome,'defeat');assert.equal(s.result?.reason,'friendly-exhausted');assert.equal(s.result?.breakdown.time,0);assert.equal(s.stats.bossKills,1);});

test('boss-stage defeat preserves boss HP and escort survivors in the frozen result',()=>{const s=enter();s.fighters[0].position.y=1;stepGame(s);assert.equal(s.result?.outcome,'defeat');assert.equal((s.result as any).bossHealth,640);assert.equal((s.result as any).escortsRemaining,3);});

test('a dead fighter cannot keep damaging the boss during its respawn wait',()=>{const s=enter(),boss=s.ufos.find(u=>u.variant==='boss')!;const reserve=s.rosters.friendly.tokens[49];reserve.status='reserve';s.stats.allyLosses--;s.fighters[0].position.copy(boss.position);s.fighters[0].previous.copy(boss.position);stepGame(s);assert.equal(s.result,null);assert.equal(boss.health,560);for(let i=0;i<60;i++)stepGame(s);assert.equal(boss.health,560);assert.equal(s.stats.playerLosses,1);assert.equal(s.fault,null);});
