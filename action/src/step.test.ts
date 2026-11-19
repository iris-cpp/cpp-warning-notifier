import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { locateStep, type Step } from "./step.ts";

const step = (number: number, name: string, conclusion = "success"): Step => ({
  number,
  name,
  status: "completed",
  conclusion,
});

const steps = [
  step(1, "Set up job"),
  step(2, "Run actions/checkout@v7"),
  step(3, "Build Deps"),
  step(4, "Build Tests"),
  step(8, "Post Run actions/checkout@v7"),
  step(9, "Complete job"),
];

describe("locateStep", () => {
  it("takes the step number the marker carries over STEP_REGEX", () => {
    assert.equal(locateStep(steps, 4, "Build .+"), 4);
    assert.equal(locateStep(steps, 4, undefined), 4);
  });

  it("falls back to STEP_REGEX for a number that is not a step of the job", () => {
    assert.equal(locateStep(steps, 5, "Build Tests"), 4);
  });

  it("falls back to the first successful step matching STEP_REGEX, by its number", () => {
    assert.equal(locateStep(steps, undefined, "Build .+"), 3);
    assert.equal(locateStep(steps, undefined, "Post .+"), 8);
    const failed = [step(3, "Build Deps", "failure"), step(4, "Build Tests")];
    assert.equal(locateStep(failed, undefined, "Build .+"), 4);
  });

  it("returns undefined when neither the marker nor STEP_REGEX decides", () => {
    assert.equal(locateStep(steps, undefined, undefined), undefined);
    assert.equal(locateStep(steps, undefined, "no-such-step"), undefined);
  });
});
