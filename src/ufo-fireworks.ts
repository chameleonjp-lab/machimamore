import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, Group, LineBasicMaterial, LineSegments, LinearFilter, Mesh, MeshBasicMaterial, NormalBlending, Points, RGBAFormat, ShaderMaterial, SphereGeometry, UnsignedByteType, Vector3 } from 'three';
import type { GameEvent, GameState } from './types';

export const UFO_FIREWORK_CAPACITY = 8;
export const UFO_FIREWORK_SPARKS = 56;
export const UFO_FIREWORK_LIFETIME = 1.8;

const TAIL_SECONDS = .11;
const FLASH_SECONDS = .14;
const GRAVITY = 52;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PALETTE = [0xffc928, 0x35bff5, 0xff4f9b, 0x9b70ff, 0x49e4bd].map(value => new Color(value));
const GLINT = new Color(0xfff4d3);

function createSparkTexture(): DataTexture {
  const size = 16, pixels = new Uint8Array(size * size * 4), center = (size - 1) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x - center, y - center) / (size * .49);
    const softEdge = Math.max(0, Math.min(1, (1 - radius) * 4));
    const alpha = Math.round(softEdge * softEdge * (3 - 2 * softEdge) * 255);
    const offset = (y * size + x) * 4;
    pixels[offset] = 255; pixels[offset + 1] = 255; pixels[offset + 2] = 255; pixels[offset + 3] = alpha;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter; texture.minFilter = LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

type Firework = {
  eventId: number;
  position: Vector3;
  bornAt: number;
  color: Color;
  terminalAge: number | null;
};

/** Fixed-capacity presentation only; it never reads or changes combat state. */
export class UfoFireworks {
  readonly root = new Group();
  private readonly effects: Array<Firework | null> = Array(UFO_FIREWORK_CAPACITY).fill(null);
  private readonly flashes: Mesh[] = [];
  private readonly sparkTexture = createSparkTexture();
  private readonly flashGeometry = new SphereGeometry(1, 10, 8);
  private readonly flashMaterial = new MeshBasicMaterial({ color: 0xfff3d8, transparent: true, opacity: .58, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  private readonly pointPositions = new Float32Array(UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS * 3);
  private readonly pointColors = new Float32Array(this.pointPositions.length);
  private readonly pointAlphas = new Float32Array(UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS);
  private readonly linePositions = new Float32Array(UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS * 6);
  private readonly lineColors = new Float32Array(this.linePositions.length);
  private readonly pointsGeometry = new BufferGeometry();
  private readonly linesGeometry = new BufferGeometry();
  private readonly pointsMaterial = new ShaderMaterial({
    uniforms: { uSprite: { value: this.sparkTexture }, uSize: { value: 7 } },
    vertexShader: `attribute vec3 aColor; attribute float aAlpha; uniform float uSize; varying vec3 vColor; varying float vAlpha;
      void main(){vColor=aColor;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=uSize;}`,
    fragmentShader: `uniform sampler2D uSprite; varying vec3 vColor; varying float vAlpha;
      void main(){vec4 sprite=texture2D(uSprite,gl_PointCoord);float alpha=sprite.a*vAlpha;if(alpha<0.004)discard;gl_FragColor=vec4(vColor*sprite.rgb,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: NormalBlending, toneMapped: false,
  });
  private readonly linesMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .56, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  private readonly points: Points;
  private readonly lines: LineSegments;
  private missionId = -1;
  private lastEventId = -1;
  private terminal = false;
  private terminalAt = 0;
  private active = 0;

  constructor() {
    this.pointsGeometry.setAttribute('position', new BufferAttribute(this.pointPositions, 3).setUsage(DynamicDrawUsage));
    this.pointsGeometry.setAttribute('aColor', new BufferAttribute(this.pointColors, 3).setUsage(DynamicDrawUsage));
    this.pointsGeometry.setAttribute('aAlpha', new BufferAttribute(this.pointAlphas, 1).setUsage(DynamicDrawUsage));
    this.linesGeometry.setAttribute('position', new BufferAttribute(this.linePositions, 3).setUsage(DynamicDrawUsage));
    this.linesGeometry.setAttribute('color', new BufferAttribute(this.lineColors, 3).setUsage(DynamicDrawUsage));
    this.pointsGeometry.setDrawRange(0, 0);
    this.linesGeometry.setDrawRange(0, 0);
    this.points = new Points(this.pointsGeometry, this.pointsMaterial);
    this.lines = new LineSegments(this.linesGeometry, this.linesMaterial);
    this.points.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.points.renderOrder = 3;
    this.lines.renderOrder = 2;
    this.root.add(this.lines, this.points);
    this.root.visible = false;
    for (let slot = 0; slot < UFO_FIREWORK_CAPACITY; slot++) {
      const flash = new Mesh(this.flashGeometry, this.flashMaterial);
      flash.visible = false;
      flash.frustumCulled = false;
      flash.renderOrder = 4;
      this.flashes.push(flash);
      this.root.add(flash);
    }
  }

  get activeCount(): number { return this.active; }

  /** Use before the initial renderer compile so both fixed pools get uploaded. */
  prepareForUpload(): () => void {
    const pointRange = { ...this.pointsGeometry.drawRange };
    const lineRange = { ...this.linesGeometry.drawRange };
    const rootVisible = this.root.visible, pointsVisible = this.points.visible, linesVisible = this.lines.visible;
    const flashStates = this.flashes.map(flash => ({ visible: flash.visible, scale: flash.scale.x }));
    this.root.visible = true;
    this.points.visible = true;
    this.lines.visible = true;
    this.pointsGeometry.setDrawRange(0, UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS);
    this.linesGeometry.setDrawRange(0, UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS * 2);
    for (const flash of this.flashes) { flash.visible = true; flash.scale.setScalar(1); }
    return () => {
      this.pointsGeometry.setDrawRange(pointRange.start, pointRange.count);
      this.linesGeometry.setDrawRange(lineRange.start, lineRange.count);
      this.root.visible = rootVisible;
      this.points.visible = pointsVisible;
      this.lines.visible = linesVisible;
      for (let i = 0; i < this.flashes.length; i++) {
        this.flashes[i]!.visible = flashStates[i]!.visible;
        this.flashes[i]!.scale.setScalar(flashStates[i]!.scale);
      }
    };
  }

  update(state: GameState, alpha: number, resultPresentationTime: number, reducedMotion: boolean, events: readonly GameEvent[]): void {
    if (state.missionId !== this.missionId) {
      this.clear();
      this.missionId = state.missionId;
    }
    const gameTime = Math.max(0, state.elapsed - 1 / 60 + Math.max(0, Math.min(1, alpha)) / 60);
    const ending = state.phase === 'ended';
    if (ending && !this.terminal) {
      this.terminal = true;
      this.terminalAt = Math.max(0, resultPresentationTime);
      for (const effect of this.effects) if (effect) effect.terminalAge = Math.max(0, gameTime - effect.bornAt);
    }

    for (let i = 0; i < this.effects.length; i++) {
      const effect = this.effects[i];
      if (effect && this.age(effect, ending, gameTime, resultPresentationTime) >= UFO_FIREWORK_LIFETIME) this.effects[i] = null;
    }

    for (const event of events) {
      if (event.missionId !== state.missionId || event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      if (event.type !== 'kill' || event.targetKind !== 'ufo') continue;
      const slot = this.effects.findIndex(effect => effect === null);
      if (slot < 0 || !Number.isFinite(event.position.x + event.position.y + event.position.z)) continue;
      const bornAt = event.tick / 60;
      this.effects[slot] = {
        eventId: event.id,
        position: event.position.clone(),
        bornAt,
        color: PALETTE[event.id % PALETTE.length]!,
        terminalAge: this.terminal ? Math.max(0, gameTime - bornAt) : null,
      };
    }

    this.writeFrame(ending, gameTime, resultPresentationTime, reducedMotion);
  }

  private age(effect: Firework, ending: boolean, gameTime: number, resultTime: number): number {
    if (ending || effect.terminalAge !== null) {
      if (effect.terminalAge === null) effect.terminalAge = Math.max(0, gameTime - effect.bornAt);
      return effect.terminalAge + Math.max(0, resultTime - this.terminalAt);
    }
    return Math.max(0, gameTime - effect.bornAt);
  }

  private writeFrame(ending: boolean, gameTime: number, resultTime: number, reducedMotion: boolean): void {
    const spread = reducedMotion ? .52 : 1;
    const tail = reducedMotion ? .075 : TAIL_SECONDS;
    const light = reducedMotion ? .72 : 1;
    this.flashMaterial.opacity = reducedMotion ? .34 : .58;
    this.linesMaterial.opacity = reducedMotion ? .4 : .56;
    const position = this.pointsGeometry.attributes.position as BufferAttribute;
    const color = this.pointsGeometry.attributes.aColor as BufferAttribute;
    const alpha = this.pointsGeometry.attributes.aAlpha as BufferAttribute;
    const linePosition = this.linesGeometry.attributes.position as BufferAttribute;
    const lineColor = this.linesGeometry.attributes.color as BufferAttribute;
    let visibleEffects = 0;
    for (let slot = 0; slot < this.effects.length; slot++) {
      const effect = this.effects[slot];
      if (!effect) { this.flashes[slot]!.visible = false; continue; }
      const age = this.age(effect, ending, gameTime, resultTime);
      if (age >= UFO_FIREWORK_LIFETIME) { this.effects[slot] = null; this.flashes[slot]!.visible = false; continue; }
      const flash = this.flashes[slot]!;
      flash.position.copy(effect.position);
      flash.visible = age < FLASH_SECONDS;
      if (flash.visible) {
        const phase = Math.max(0, Math.min(1, age / FLASH_SECONDS));
        flash.scale.setScalar((6 + 22 * Math.sin(phase * Math.PI)) * (reducedMotion ? .62 : 1));
      }

      const colorIndex = visibleEffects * UFO_FIREWORK_SPARKS;
      const fade = Math.pow(Math.max(0, 1 - age / UFO_FIREWORK_LIFETIME), 1.4);
      for (let i = 0; i < UFO_FIREWORK_SPARKS; i++) {
        const y = 1 - 2 * (i + .5) / UFO_FIREWORK_SPARKS;
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const angle = i * GOLDEN_ANGLE + (effect.eventId % 31) * .19;
        const dx = Math.cos(angle) * radial, dy = y, dz = Math.sin(angle) * radial;
        const speed = (116 + (i * 37 + effect.eventId * 13) % 67) * spread;
        const pointAge = Math.max(0, age);
        const tailAge = Math.max(0, pointAge - tail);
        const px = effect.position.x + dx * speed * pointAge;
        const py = effect.position.y + dy * speed * pointAge - .5 * GRAVITY * pointAge * pointAge;
        const pz = effect.position.z + dz * speed * pointAge;
        const tx = effect.position.x + dx * speed * tailAge;
        const ty = effect.position.y + dy * speed * tailAge - .5 * GRAVITY * tailAge * tailAge;
        const tz = effect.position.z + dz * speed * tailAge;
        const particle = colorIndex + i;
        position.setXYZ(particle, px, py, pz);
        const tint = i % 13 === 0 ? GLINT : effect.color;
        const brightness = i % 13 === 0 ? 1 : .94;
        color.setXYZ(particle, tint.r * brightness, tint.g * brightness, tint.b * brightness);
        alpha.setX(particle, fade * light * brightness);
        const lineVertex = particle * 2;
        linePosition.setXYZ(lineVertex, tx, ty, tz);
        linePosition.setXYZ(lineVertex + 1, px, py, pz);
        lineColor.setXYZ(lineVertex, tint.r * fade * brightness * .12, tint.g * fade * brightness * .12, tint.b * fade * brightness * .12);
        lineColor.setXYZ(lineVertex + 1, tint.r * fade * brightness * .68, tint.g * fade * brightness * .68, tint.b * fade * brightness * .68);
      }
      visibleEffects++;
    }
    this.active = visibleEffects;
    this.root.visible = visibleEffects > 0;
    this.pointsGeometry.setDrawRange(0, visibleEffects * UFO_FIREWORK_SPARKS);
    this.linesGeometry.setDrawRange(0, visibleEffects * UFO_FIREWORK_SPARKS * 2);
    if (visibleEffects > 0) {
      position.needsUpdate = true; color.needsUpdate = true; alpha.needsUpdate = true;
      linePosition.needsUpdate = true; lineColor.needsUpdate = true;
    }
  }

  private clear(): void {
    this.effects.fill(null);
    this.lastEventId = -1;
    this.terminal = false;
    this.terminalAt = 0;
    this.active = 0;
    this.root.visible = false;
    this.pointsGeometry.setDrawRange(0, 0);
    this.linesGeometry.setDrawRange(0, 0);
    for (const flash of this.flashes) flash.visible = false;
  }

  dispose(): void {
    this.root.clear();
    this.sparkTexture.dispose(); this.flashGeometry.dispose(); this.flashMaterial.dispose();
    this.pointsGeometry.dispose(); this.linesGeometry.dispose();
    this.pointsMaterial.dispose(); this.linesMaterial.dispose();
  }
}
