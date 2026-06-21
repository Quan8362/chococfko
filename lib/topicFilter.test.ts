// Pure tests for the compact topic-filter row-packing + priority helpers.
// Run with:  node --test lib/topicFilter.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTopicOrder, planVisibleTopics } from "./topicFilter.ts";

// Uniform 100px chips with a 10px gap make row math easy to reason about.
const W = 100;
const GAP = 10;
const codes = ["a", "b", "c", "d", "e", "f"];
const widthOf = () => W;
// One chip is 100, then +110 per extra chip (gap+width). So in a 320px row:
//   1 chip = 100, 2 = 210, 3 = 320 (fits), 4 = 430 (overflow).

test("buildTopicOrder hoists the selected topic to the front, no dup", () => {
  assert.deepEqual(buildTopicOrder(codes, "c"), ["c", "a", "b", "d", "e", "f"]);
  assert.deepEqual(buildTopicOrder(codes, null), codes);
  // selected not in the list → untouched order
  assert.deepEqual(buildTopicOrder(codes, "zzz"), codes);
});

test("inline mode when everything fits within maxRows", () => {
  // 6 chips across 2 rows of 320px = 3 per row → fits exactly, no trigger.
  const plan = planVisibleTopics({
    order: codes,
    width: widthOf,
    containerWidth: 320,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 2,
  });
  assert.equal(plan.mode, "inline");
  assert.deepEqual(plan.visible, codes);
  assert.equal(plan.hiddenCount, 0);
});

test("compact mode collapses overflow and always reserves the trigger", () => {
  // Narrow 230px row, 1 row only: 2 chips = 210 fits, but trigger(90) must fit too.
  // 1 chip(100)+gap+trigger(90)=200 <=230 → 1 chip + trigger.
  const plan = planVisibleTopics({
    order: codes,
    width: widthOf,
    containerWidth: 230,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 1,
  });
  assert.equal(plan.mode, "compact");
  assert.deepEqual(plan.visible, ["a"]);
  assert.equal(plan.hiddenCount, 5);
});

test("compact mode uses both rows before collapsing", () => {
  // 7 chips, 320px, 2 rows → 3+3+1 needs 3 rows, so collapse.
  // Reserve trigger(90): row1 = 3 chips(320); row2 = 2 chips(210)+gap+trigger=310
  // <= 320 → 3+2 = 5 chips visible, 2 hidden.
  const seven = ["a", "b", "c", "d", "e", "f", "g"];
  const plan = planVisibleTopics({
    order: seven,
    width: widthOf,
    containerWidth: 320,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 2,
  });
  assert.equal(plan.mode, "compact");
  assert.deepEqual(plan.visible, ["a", "b", "c", "d", "e"]);
  assert.equal(plan.hiddenCount, 2);
});

test("selected priority topic stays visible in compact mode", () => {
  const order = buildTopicOrder(codes, "f"); // ["f","a","b","c","d","e"]
  const plan = planVisibleTopics({
    order,
    width: widthOf,
    containerWidth: 230,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 1,
  });
  assert.equal(plan.mode, "compact");
  assert.ok(plan.visible.includes("f"), "selected topic must remain visible");
  assert.equal(plan.visible[0], "f");
});

test("unmeasured container (width 0) falls back to inline full set", () => {
  const plan = planVisibleTopics({
    order: codes,
    width: widthOf,
    containerWidth: 0,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 2,
  });
  assert.equal(plan.mode, "inline");
  assert.deepEqual(plan.visible, codes);
});

test("empty topic list is inline with nothing", () => {
  const plan = planVisibleTopics({
    order: [],
    width: widthOf,
    containerWidth: 320,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 2,
  });
  assert.equal(plan.mode, "inline");
  assert.deepEqual(plan.visible, []);
  assert.equal(plan.hiddenCount, 0);
});

test("very wide chips each occupy their own row (no infinite loop)", () => {
  const plan = planVisibleTopics({
    order: ["x", "y", "z"], // 3 chips, each wider than the container
    width: () => 500,
    containerWidth: 300,
    triggerWidth: 90,
    gap: GAP,
    maxRows: 2,
  });
  // x on row1, y on row2 → 3 chips need 3 rows > maxRows, so collapse.
  // With trigger reserved: x(row1) + trigger(row2) fits → 1 visible, 2 hidden.
  assert.equal(plan.mode, "compact");
  assert.deepEqual(plan.visible, ["x"]);
  assert.equal(plan.hiddenCount, 2);
});
