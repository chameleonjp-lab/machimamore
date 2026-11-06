import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { FlightControls } from '../src/input';
import { createGame, startGame } from '../src/simulation';

class ElementStub extends EventTarget {
  style = { left: '', top: '', setProperty() {}, removeProperty() {} };
  classList = { add() {}, remove() {} };
  getAttribute() { return null; }
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  closest() { return this; }
  querySelector() { return this; }
  setPointerCapture() {}
  hasPointerCapture() { return false; }
}

function pointer(type: string, id: number, x = 100, y = 200) {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, buttons: 1, isPrimary: id === 1,
  });
}

// Use the production resize and pending-input handlers, with only the DOM/renderer replaced.
const main = ts.createSourceFile('main.ts', readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const mainResize = main.statements.filter(node =>
  ts.isFunctionDeclaration(node) && (node.name?.text === 'clearInput' || node.name?.text === 'resizeScene')
).map(node => ts.transpileModule(node.getText(main), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).join('\n');

for (const mode of ['normal', 'easy'] as const) {
  for (const [from, to] of [[430, 390], [390, 430]]) {
    for (const withMain of [false, true]) {
      test(`${mode} ${withMain ? 'main and controls' : 'controls'} retain a held command at 402x${from} to 402x${to}`, () => {
        const originals = ['window', 'document', 'HTMLElement'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
        const win = Object.assign(new EventTarget(), { innerWidth: 402, innerHeight: from, visualViewport: new EventTarget() });
        const doc = Object.assign(new EventTarget(), { hidden: false, getElementById: () => new ElementStub() });
        Object.defineProperties(globalThis, {
          window: { configurable: true, value: win }, document: { configurable: true, value: doc }, HTMLElement: { configurable: true, value: ElementStub },
        });
        const state = createGame({ mode }); startGame(state);
        const surface = new ElementStub(), buttons = { fire: new ElementStub(), loop: new ElementStub() };
        const controls = new FlightControls(surface as unknown as HTMLElement, buttons as any, () => state.phase === 'playing');
        controls.setMode(mode);
        const ctx = createContext({ controls, window: win, viewportWidth: 402, viewportHeight: from,
          pendingLoop: true, pendingFire: true, pendingAccelerate: true, pendingBrake: true,
          scene: { resize() {} }, graphicsFailure() { assert.fail('resize must not cause a graphics failure'); },
        });
        if (withMain) {
          runInContext(mainResize, ctx);
          win.addEventListener('resize', () => runInContext('resizeScene()', ctx));
          win.visualViewport.addEventListener('resize', () => runInContext('resizeScene()', ctx));
          win.addEventListener('orientationchange', () => runInContext('clearInput()', ctx));
        }
        try {
          surface.dispatchEvent(pointer('pointerdown', 1));
          win.dispatchEvent(pointer('pointermove', 1, 115, 200));
          buttons.fire.dispatchEvent(pointer('pointerdown', 2));
          buttons.loop.dispatchEvent(pointer('pointerdown', 3));
          const before = controls.sample(), held = controls.peek().heldPointers;
          assert.ok(before.turn > .3); assert.equal(before.steeringActive, true);
          win.innerHeight = to;
          win.dispatchEvent(new Event('resize')); win.visualViewport.dispatchEvent(new Event('resize'));
          assert.equal(controls.peek().steerPointer, 1, 'height-only resize must retain the same finger');
          assert.deepEqual(controls.peek().heldPointers, held);
          assert.deepEqual(controls.sample(), before, 'command and steering revision must survive the resize');
          assert.equal(state.phase, 'playing');
          if (withMain) for (const name of ['pendingLoop', 'pendingFire', 'pendingAccelerate', 'pendingBrake']) assert.equal(ctx[name], true, name);
          win.dispatchEvent(pointer('pointermove', 1, 115, 200 + to - from));
          assert.deepEqual(controls.sample(), before, 'first resized client coordinate must rebase without changing the command');
          win.dispatchEvent(pointer('pointermove', 1, 120, 200 + to - from));
          assert.ok(controls.sample().turn > before.turn, 'the same finger must continue steering');

          win.innerWidth = 430; win.dispatchEvent(new Event('resize'));
          assert.equal(controls.peek().steerPointer, null, 'a real width change must still clear input');
          assert.equal(controls.sample().turn, 0); assert.equal(controls.sample().fire, false);
          if (withMain) for (const name of ['pendingLoop', 'pendingFire', 'pendingAccelerate', 'pendingBrake']) assert.equal(ctx[name], false, name);
          surface.dispatchEvent(pointer('pointerdown', 1)); win.dispatchEvent(pointer('pointermove', 1, 115, 200));
          assert.equal(controls.peek().steerPointer, 1);
          win.dispatchEvent(new Event('orientationchange'));
          assert.equal(controls.peek().steerPointer, null, 'an explicit orientation event must still clear input');
          assert.equal(controls.sample().turn, 0);
        } finally {
          controls.dispose();
          for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
        }
      });
    }
  }
}
