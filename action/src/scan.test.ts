import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { statuses } from "./comment.ts";
import { scanJobLog } from "./scan.ts";

// Shaped like a GitHub Actions job log: the runner echoes each run step's
// script before its output, and prefixes every line with a timestamp.
const log = (...lines: string[]) =>
  lines.map((line) => `2026-11-19T01:00:00.0000000Z ${line}`).join("\n");

const buildStep = [
  '##[group]Run echo "CPPWARNINGNOTIFIER_LOG_MARKER"',
  'echo "CPPWARNINGNOTIFIER_LOG_MARKER"',
  "cmake --build build",
  "##[endgroup]",
  "CPPWARNINGNOTIFIER_LOG_MARKER",
];

describe("scanJobLog", () => {
  it("ignores matches before the marker's output", () => {
    const result = scanJobLog(
      log(
        "##[group]Run if (-not $match) {",
        'Write-Output "::error::No installed MSVC toolset"',
        "foo.cpp(1): warning C4100: unreferenced parameter",
        "##[endgroup]",
        ...buildStep,
        "[100%] Built target test",
      ),
    );
    assert.deepEqual(result, {
      hasMarker: true,
      status: statuses.success,
      firstIssueLine: 1,
      issue: undefined,
      markerStep: undefined,
    });
  });

  it("reports an error after the marker by its line in the step", () => {
    const result = scanJobLog(
      log("setup", ...buildStep, "compiling", "foo.cpp(2,3): error C2131: expression did not evaluate to a constant"),
    );
    assert.deepEqual(result, {
      hasMarker: true,
      status: statuses.error,
      firstIssueLine: 7,
      issue: "2026-11-19T01:00:00.0000000Z foo.cpp(2,3): error C2131: expression did not evaluate to a constant",
      markerStep: undefined,
    });
  });

  it("prefers a warning over an error", () => {
    const result = scanJobLog(log(...buildStep, "a.cpp:1:1: error: x", "b.cpp:2:2: warning: y"));
    assert.deepEqual(result, {
      hasMarker: true,
      status: statuses.warning,
      firstIssueLine: 7,
      issue: "2026-11-19T01:00:00.0000000Z b.cpp:2:2: warning: y",
      markerStep: undefined,
    });
  });

  it("scans the whole log when there is no marker", () => {
    const result = scanJobLog(log("compiling", "a.cpp:1:1: warning: y"));
    assert.deepEqual(result, {
      hasMarker: false,
      status: statuses.warning,
      firstIssueLine: 2,
      issue: "2026-11-19T01:00:00.0000000Z a.cpp:1:1: warning: y",
      markerStep: undefined,
    });
  });

  it("scans from the step when the marker's output is missing", () => {
    const result = scanJobLog(log("setup", ...buildStep.slice(0, 4), "a.cpp:1:1: error: x"));
    assert.deepEqual(result, {
      hasMarker: true,
      status: statuses.error,
      firstIssueLine: 5,
      issue: "2026-11-19T01:00:00.0000000Z a.cpp:1:1: error: x",
      markerStep: undefined,
    });
  });

  it("reads the step number the marker's output carries", () => {
    const result = scanJobLog(
      log(
        '##[group]Run echo "CPPWARNINGNOTIFIER_LOG_MARKER $(gh api ...)"',
        'echo "CPPWARNINGNOTIFIER_LOG_MARKER $(gh api ...)"',
        "##[endgroup]",
        "CPPWARNINGNOTIFIER_LOG_MARKER 4",
        "a.cpp:1:1: warning: y",
      ),
    );
    assert.deepEqual(result, {
      hasMarker: true,
      status: statuses.warning,
      firstIssueLine: 5,
      issue: "2026-11-19T01:00:00.0000000Z a.cpp:1:1: warning: y",
      markerStep: 4,
    });
  });

  it("has no step number when the marker's output carries none", () => {
    // What the marker line prints when the command that looks up the step number fails.
    const result = scanJobLog(
      log(
        '##[group]Run echo "CPPWARNINGNOTIFIER_LOG_MARKER $(gh api ...)"',
        'echo "CPPWARNINGNOTIFIER_LOG_MARKER $(gh api ...)"',
        'echo "warning: in the script"',
        "##[endgroup]",
        "CPPWARNINGNOTIFIER_LOG_MARKER ",
        "a.cpp:1:1: error: x",
      ),
    );
    assert.deepEqual(result, {
      hasMarker: true,
      status: statuses.error,
      firstIssueLine: 6,
      issue: "2026-11-19T01:00:00.0000000Z a.cpp:1:1: error: x",
      markerStep: undefined,
    });
  });
});
