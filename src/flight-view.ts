import { Quaternion, Vector3 } from 'three';
import type { Aircraft, GameMode } from './flight-types';

export const FLIGHT_FOV = 64;
export const FLIGHT_FAR = 6500;
/** Enemy visibility, fog and the radar share the same world-distance limit. */
export const FLIGHT_VISIBILITY_RANGE = 1500;
export const FLIGHT_CAMERA_BANK_FACTOR = 0.45;
/** Radius as a fraction of the shorter CSS viewport edge. */
export const EASY_AIM_RADIUS = 0.135;
export const NORMAL_CAMERA_LOOK_ANGLE = -0.19;
export const EASY_CAMERA_LOOK_ANGLE = -Math.atan2(11, 479);
const CAMERA_OFFSET = new Vector3(0, 11, 29);
const CAMERA_BANK_AXIS = new Vector3(0, 0, 1);
const CAMERA_LOOK_AXIS = new Vector3(1, 0, 0);
const NORMAL_LOOK = new Quaternion().setFromAxisAngle(CAMERA_LOOK_AXIS, NORMAL_CAMERA_LOOK_ANGLE);
const EASY_LOOK = new Quaternion().setFromAxisAngle(CAMERA_LOOK_AXIS, EASY_CAMERA_LOOK_ANGLE);
const offsetRotation = new Quaternion();
const bankAdjustment = new Quaternion();
const opticalRoll = new Quaternion();
const TAN_HALF_FOV = Math.tan(FLIGHT_FOV * Math.PI / 360);

/** Shared by rendering and targeting so the displayed circle is the actual firing gate. */
export function getFlightCameraPose(player: Aircraft, mode: GameMode, position: Vector3, rotation: Quaternion): void {
  // The position retains the existing 45% bank-following offset.
  offsetRotation.copy(player.quaternion)
    .multiply(bankAdjustment.setFromAxisAngle(CAMERA_BANK_AXIS, player.bank * (1 - FLIGHT_CAMERA_BANK_FACTOR)));
  position.copy(CAMERA_OFFSET).applyQuaternion(offsetRotation).add(player.position);

  // View forward follows the actual aircraft quaternion with its bank removed.
  // Mode look is then applied, and 45% bank returns only as screen roll about
  // the optical axis. The bank therefore cannot pull a target across the view.
  rotation.copy(player.quaternion)
    .multiply(bankAdjustment.setFromAxisAngle(CAMERA_BANK_AXIS, player.bank))
    .multiply(mode === 'easy' ? EASY_LOOK : NORMAL_LOOK)
    .multiply(opticalRoll.setFromAxisAngle(CAMERA_BANK_AXIS, -player.bank * FLIGHT_CAMERA_BANK_FACTOR));
}

export function projectFlightTarget(player: Aircraft, target: Vector3, aspect: number, mode: GameMode) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 393 / 852;
  const position = new Vector3(), rotation = new Quaternion();
  getFlightCameraPose(player, mode, position, rotation);
  const local = target.clone().sub(position).applyQuaternion(rotation.invert());
  const depth = -local.z, divisor = Math.max(0.0001, Math.abs(depth));
  const x = local.x / (divisor * TAN_HALF_FOV * safeAspect);
  const y = local.y / (divisor * TAN_HALF_FOV);
  const distance = player.position.distanceTo(target);
  const visible = distance <= FLIGHT_VISIBILITY_RANGE && depth > 0.1 && depth < FLIGHT_FAR && Math.abs(x) <= 1 && Math.abs(y) <= 1;
  const radial = Math.hypot(x * Math.max(1, safeAspect), y * Math.max(1, 1 / safeAspect)) / 2;
  return { x, y, depth, distance, visible, inCircle: visible && radial <= EASY_AIM_RADIUS };
}

