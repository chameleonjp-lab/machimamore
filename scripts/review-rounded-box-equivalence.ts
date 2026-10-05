/**
 * Saved after the independent stdin comparison. The fixed reference import replaces
 * the original transpile/data-URL import; seed, cases, generation order and strict
 * comparisons are unchanged. Output is JSON on stdout; it does not edit game state.
 */
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { segmentRoundedBoxFraction as after } from '../src/collision';
import { segmentRoundedBoxFraction as before } from './review-rounded-box-reference';

let seed = 937852, trials = 0;
const mismatches: unknown[] = [];
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function compare(start: Vector3, end: Vector3, min: Vector3, max: Vector3, radius: number, label: string) {
  trials++;
  const a = before(start, end, min, max, radius), b = after(start, end, min, max, radius);
  if (a !== b) mismatches.push({ label, start: start.toArray(), end: end.toArray(), min: min.toArray(), max: max.toArray(), radius, before: a, after: b });
}
for (let i = 0; i < 30000; i++) {
  const min = new Vector3((random() - .5) * 4000, (random() - .5) * 1000, (random() - .5) * 4000);
  const max = min.clone().add(new Vector3(random() * 150 + 1, random() * 100 + 1, random() * 150 + 1));
  const start = new Vector3((random() - .5) * 4000, (random() - .5) * 1000, (random() - .5) * 4000);
  const end = start.clone().add(new Vector3((random() - .5) * 2400, (random() - .5) * 2400, (random() - .5) * 2400));
  compare(start, end, min, max, random() * 15, 'random');
}
for (const radius of [1e-7, .001, 1, 2, 14])
  for (const gap of [-1e-5, -1e-10, 0, 1e-12, 1e-10, 1e-8, 1e-6, 1e-5, 2e-5, 3e-5, 1e-4])
    for (const length of [0, 1e-11, 1e-9, 1, 1200]) {
      const min = new Vector3(-72, 6, -724), max = new Vector3(72, 82, -596);
      const start = new Vector3(72 + radius + gap, 34, -660 - length / 2);
      const end = new Vector3(72 + radius + gap, 34, -660 + length / 2);
      compare(start, end, min, max, radius, 'face-parallel');
    }
console.log(JSON.stringify({ trials, mismatchCount: mismatches.length, first: mismatches.slice(0, 12) }));
assert.equal(trials, 30275); assert.equal(mismatches.length, 0);
