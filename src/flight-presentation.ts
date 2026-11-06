import { Quaternion, Vector3 } from 'three';
import { normalizeAngle } from './flight';
import { FIXED_DT } from './rules';
import type { Aircraft, GameState, Ufo } from './types';

interface Pose { position: Vector3; quaternion: Quaternion; bank: number; pitch: number; yaw: number; health: number; generation: number; }

/** Display snapshots only. Simulation, firing and scoring always read the live state. */
export class FlightPresentation {
  private state: GameState | null = null;
  private tick = -1;
  private poses = new Map<number, Pose>();

  reset(): void { this.state = null; this.tick = -1; this.poses.clear(); }

  capture(state: GameState): void {
    if (this.state !== state) this.poses.clear();
    this.state = state; this.tick = state.tick;
    const live = new Set<number>();
    for (const entity of [...state.fighters, ...state.ufos]) {
      live.add(entity.id);
      this.poses.set(entity.id, { position: entity.position.clone(), quaternion: entity.quaternion.clone(),
        bank: entity.kind === 'aircraft' ? entity.bank : 0, pitch: entity.kind === 'aircraft' ? entity.pitch : 0,
        yaw: entity.kind === 'aircraft' ? entity.yaw : 0, health: entity.health, generation: entity.generation });
    }
    for (const id of this.poses.keys()) if (!live.has(id)) this.poses.delete(id);
  }

  sample(state: GameState, alpha: number): GameState {
    if (state.phase !== 'playing') { this.state = null; return state; }
    if (this.state !== state || this.tick !== state.tick - 1) return state;
    const fraction = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const pose = <T extends Aircraft | Ufo>(entity: T): T => {
      const previous = this.poses.get(entity.id);
      if (!previous || previous.generation !== entity.generation || entity.health <= 0 || previous.health <= 0) return entity;
      const sampled = { ...entity, position: previous.position.clone().lerp(entity.position, fraction),
        quaternion: previous.quaternion.clone().slerp(entity.quaternion, fraction) };
      if (sampled.kind === 'aircraft') {
        sampled.bank = previous.bank + normalizeAngle(sampled.bank - previous.bank) * fraction;
        sampled.pitch = previous.pitch + normalizeAngle(sampled.pitch - previous.pitch) * fraction;
        sampled.yaw = previous.yaw + normalizeAngle(sampled.yaw - previous.yaw) * fraction;
      }
      return sampled;
    };
    return { ...state, fighters: state.fighters.map(pose), ufos: state.ufos.map(pose),
      bullets: state.bullets.map(bullet => ({ ...bullet, position: bullet.previous.clone().lerp(bullet.position, fraction) })),
      elapsed: state.elapsed - FIXED_DT * (1 - fraction) };
  }
}
