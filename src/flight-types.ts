import type { Quaternion, Vector3 } from 'three';

/** The flight layer needs only a pose; mission IDs and pilot ownership belong to simulation. */
export interface Aircraft {
  position: Vector3;
  quaternion: Quaternion;
  yaw: number;
  pitch: number;
  bank: number;
  speed: number;
  loopProgress: number;
  loopCooldown: number;
}

export type GameMode = 'normal' | 'easy';

/** Accepted inputs for one fixed tick. Loop is an edge; fire and throttle are holds. */
export interface FlightInput {
  /** Explicit rate axis (including zero) overrides legacy accelerate/brake. */
  throttle?: number;
  turn: number;
  climb: number;
  fire: boolean;
  loop: boolean;
  accelerate?: boolean;
  brake?: boolean;
  viewAspect?: number;
  steeringRevision?: number;
}

/** UFO movement is independent of the aircraft's forward flight constraint. */
export interface CombatTarget {
  position: Vector3;
  health: number;
  velocity: Vector3;
}

/** The same finite magazines and reload are used by the player and wingmen. */
export interface MagazineState {
  health: number;
  mg: number;
  cannon: number;
  reloadTicksRemaining: number;
}
