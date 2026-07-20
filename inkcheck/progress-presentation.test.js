const test = require("node:test");
const assert = require("node:assert/strict");
const { createProgressPresentation } = require("./progress-presentation.js");

test("retains the latest measured work across phase boundaries and updates in place", () => {
  const presentation = createProgressPresentation();
  const first = { type: "progress", phase: "explore", statesExplored: 500000, stateBudget: 1000000 };
  const boundary = { type: "phase_end", phase: "explore" };
  const next = { type: "progress", phase: "explore", statesExplored: 600000, stateBudget: 1000000 };

  assert.equal(presentation.observe(first), first);
  assert.equal(presentation.observe(boundary), first);
  assert.equal(presentation.observe({ type: "phase_start", phase: "report" }), first);
  assert.equal(presentation.observe(next), next);
});

test("does not replace a measured window with a phase-only poll snapshot", () => {
  const presentation = createProgressPresentation();
  const measured = { type: "progress", statesExplored: 750000, stateBudget: 1000000 };

  presentation.observe(measured);
  assert.equal(presentation.observe({ type: "phase_start", phase: "min_repro" }), measured);
  presentation.reset();
  assert.equal(presentation.observe({ type: "phase_start", phase: "report" }), null);
});
