import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { KEY_ACTIONS, DEFAULT_KEY_BINDINGS, KeyboardSettings, KEYBOARD_STORAGE_KEY, validKeyBindings } from '../src/keyboard-settings';
import { CONTROL_NAMES, MODE_CONTROLS, CONTROL_STORAGE_KEYS, DEFAULT_LAYOUT, parseControlLayout, persistControlSettings } from '../src/control-settings';

test('the accepted control contract is exactly nine keys and three/one touch controls', () => {
  assert.deepEqual(KEY_ACTIONS, ['left', 'right', 'up', 'down', 'fire', 'loop', 'accelerate', 'brake', 'pause']);
  assert.deepEqual(Object.values(DEFAULT_KEY_BINDINGS), ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyL', 'KeyW', 'KeyS', 'Escape']);
  assert.deepEqual(CONTROL_NAMES, ['fire', 'loop', 'throttle']);
  assert.deepEqual(MODE_CONTROLS.normal, ['fire', 'loop', 'throttle']);
  assert.deepEqual(MODE_CONTROLS.easy, ['loop']);
  assert.equal(validKeyBindings({ ...DEFAULT_KEY_BINDINGS, unknownAction: 'KeyZ' }), false);
});

test('layout parsing restores only finite supported values and produces isolated drafts', () => {
  const parsed = parseControlLayout(JSON.stringify({ version: 2, controls: {
    fire: { x: -2, y: 2, size: 1000, opacity: 0 },
    loop: { x: '0.5', y: null, size: '72', opacity: null },
    unknownAction: { x: 0.1, y: 0.1, size: 50, opacity: 1 },
  } }));
  assert.deepEqual(parsed.fire, { x: 0, y: 1, size: 140, opacity: 0.2 });
  assert.deepEqual(parsed.loop, DEFAULT_LAYOUT.loop);
  assert.deepEqual(Object.keys(parsed), ['fire', 'loop', 'throttle']);
  for (const raw of [null, '{', '[]', JSON.stringify({ version: 3, controls: parsed }), 'x'.repeat(8193)]) {
    assert.deepEqual(parseControlLayout(raw), DEFAULT_LAYOUT);
  }
  parsed.loop.x = 0.25;
  assert.equal(DEFAULT_LAYOUT.loop.x, 0.83);
  const next = parseControlLayout(null); next.loop.x = 0.4;
  assert.equal(parseControlLayout(null).loop.x, 0.83);
});

test('settings persistence cannot write another work or duplicate a commit key', () => {
  const values = new Map([
    ['kaisen-keyboard-v1', 'original keyboard'], ['kaisen-controls-v1', 'original layout'],
    ['faitofuraito-keyboard-v1', 'other keyboard'], ['unrelated', 'keep'],
  ]);
  const before = new Map(values);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  assert.equal(persistControlSettings([{ key: 'kaisen-controls-v1', value: 'overwrite' }], storage), false);
  assert.deepEqual(values, before);
  assert.equal(persistControlSettings([
    { key: CONTROL_STORAGE_KEYS.normal, value: 'first' }, { key: CONTROL_STORAGE_KEYS.normal, value: 'second' },
  ], storage), false);
  assert.equal(persistControlSettings([
    { key: CONTROL_STORAGE_KEYS.normal, value: JSON.stringify({ version: 2, controls: DEFAULT_LAYOUT }) },
    { key: CONTROL_STORAGE_KEYS.easy, value: JSON.stringify({ version: 2, controls: DEFAULT_LAYOUT }) },
    { key: KEYBOARD_STORAGE_KEY, value: JSON.stringify({ version: 1, bindings: DEFAULT_KEY_BINDINGS }) },
  ], storage), true);
  for (const [key, value] of before) assert.equal(values.get(key), value);
  for (const key of [CONTROL_STORAGE_KEYS.normal, CONTROL_STORAGE_KEYS.easy]) {
    assert.deepEqual(parseControlLayout(values.get(key)!), DEFAULT_LAYOUT);
  }
});

test('keyboard load reads the MachiMamore key only and ignores other work settings', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const reads: string[] = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) {
      reads.push(key);
      return key.startsWith('kaisen-') ? JSON.stringify({ version: 1, bindings: { ...DEFAULT_KEY_BINDINGS, fire: 'KeyF' } }) : null;
    },
  } });
  try {
    assert.deepEqual(new KeyboardSettings().bindings, DEFAULT_KEY_BINDINGS);
    assert.deepEqual(reads, ['machimamore-controls-recovery-v1', 'machimamore-keyboard-v1']);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('the TypeScript contract rejects removed actions and accepts UFO velocity targets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'machimamore-control-types-'));
  const fixture = join(directory, 'contracts.ts');
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  writeFileSync(fixture, `
    import type { FlightInput, Aircraft, CombatTarget } from ${JSON.stringify(join(src, 'flight-types'))};
    import type { FlightControlButtons } from ${JSON.stringify(join(src, 'input'))};
    import type { KeyAction } from ${JSON.stringify(join(src, 'keyboard-settings'))};
    import { getFlightAssist, predictedShotDirection } from ${JSON.stringify(join(src, 'flight-assist'))};
    declare const plane: Aircraft;
    declare const target: CombatTarget;
    const input: FlightInput = {turn:0,climb:0,fire:false,loop:false};
    getFlightAssist(plane, [target], input, 'easy', value => value.health > 0);
    predictedShotDirection(plane.position, plane.position, target, 720, 1.5);
    // @ts-expect-error The removed action is absent from the flight tick contract.
    input.bomb = true;
    // @ts-expect-error The removed action is absent from the flight tick contract.
    input.torpedo = true;
    // @ts-expect-error Key bindings enumerate only supported actions.
    const unsupported: KeyAction = 'bomb';
    declare const buttons: FlightControlButtons;
    // @ts-expect-error Removed controls cannot be wired from main.
    buttons.torpedo;
  `);
  try {
    const program = ts.createProgram([fixture], {
      noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [],
    });
    const errors = ts.getPreEmitDiagnostics(program);
    assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
  } finally { unlinkSync(fixture); rmdirSync(directory); }
});
