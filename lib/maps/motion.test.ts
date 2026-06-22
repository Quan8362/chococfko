import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefersReducedMotion, motionOptions, scrollBehavior } from './motion.ts';

test('prefersReducedMotion reads matchMedia', () => {
  const on = { matchMedia: (q: string) => ({ matches: q.includes('reduce') }) };
  const off = { matchMedia: () => ({ matches: false }) };
  assert.equal(prefersReducedMotion(on), true);
  assert.equal(prefersReducedMotion(off), false);
});

test('prefersReducedMotion is SSR/legacy safe (no window / no matchMedia)', () => {
  assert.equal(prefersReducedMotion(undefined), false);
  assert.equal(prefersReducedMotion({}), false);
  // throwing matchMedia → false, never throws
  assert.equal(prefersReducedMotion({ matchMedia: () => { throw new Error('x') } }), false);
});

test('motionOptions disables animation when reduced', () => {
  assert.deepEqual(motionOptions(true), { animate: false });
  assert.deepEqual(motionOptions(false), { animate: true });
});

test('scrollBehavior honors reduced motion', () => {
  assert.equal(scrollBehavior(true), 'auto');
  assert.equal(scrollBehavior(false), 'smooth');
});
