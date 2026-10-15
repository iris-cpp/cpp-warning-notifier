import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideCommentAction, statuses } from "./comment.ts";
import { renderBody } from "./render.ts";
import type { Cell, Report } from "./report.ts";

const layout = { rowHeaderFields: ["os"], columnField: "cpp" };

// A repository name containing "warning", as iris-cpp/cpp-warning-notifier does.
const url = (run: number) => `https://github.com/example/cpp-warning-notifier/actions/runs/${run}/job/2#step:3:4`;

const unused = { file: "src/a.cpp", line: 8, column: 7, message: "unused variable ‘x’", flag: "-Wunused-variable" };
const cpp = { file: "src/a.cpp", line: 3, column: 2, message: '#warning "W"', flag: "-Wcpp" };

function cell(cppVersion: string, status: string, run: number, warnings: Cell["warnings"] = []): Cell {
  return { env: { os: "ubuntu", cpp: cppVersion }, status, url: url(run), warnings };
}

const clean = (run: number): Report => ({
  cells: [cell("20", statuses.success, run), cell("23", statuses.success, run)],
});
const warned = (run: number, warnings = [cpp, unused]): Report => ({
  cells: [cell("20", statuses.warning, run, warnings), cell("23", statuses.success, run)],
});

// A previous bot comment as this version of the bot posts it.
const posted = (report: Report) => ({ id: 7, body: renderBody(report, layout) });

describe("decideCommentAction", () => {
  it("creates a comment when the bot has not commented yet", () => {
    assert.deepEqual(decideCommentAction(clean(1), undefined), { kind: "create" });
  });

  it("updates in place when the warnings are exactly the same, even if there are some", () => {
    const previous = posted(warned(1));
    const moved = warned(2, [{ ...unused, line: 20 }, cpp]);
    assert.deepEqual(decideCommentAction(moved, previous), { kind: "update", previous });
  });

  it("updates in place when both builds are clean", () => {
    const previous = posted(clean(1));
    assert.deepEqual(decideCommentAction(clean(2), previous), { kind: "update", previous });
  });

  it("replaces when a warning appears", () => {
    const previous = posted(clean(1));
    assert.deepEqual(decideCommentAction(warned(2), previous), { kind: "replace", previous });
  });

  it("replaces when a warning disappears", () => {
    const previous = posted(warned(1));
    assert.deepEqual(decideCommentAction(clean(2), previous), { kind: "replace", previous });
  });

  it("replaces when the set of warnings changes while the status stays", () => {
    const previous = posted(warned(1));
    assert.deepEqual(decideCommentAction(warned(2, [cpp]), previous), { kind: "replace", previous });
    assert.deepEqual(
      decideCommentAction(warned(2, [cpp, unused, unused]), previous),
      { kind: "replace", previous },
    );
  });

  it("replaces when the set of environments changes and a warning is involved", () => {
    const previous = posted(warned(1));
    const extra: Report = { cells: [...warned(2).cells, cell("26", statuses.success, 2)] };
    assert.deepEqual(decideCommentAction(extra, previous), { kind: "replace", previous });
  });

  it("updates when the set of environments changes but nothing warns", () => {
    const previous = posted(clean(1));
    const extra: Report = { cells: [...clean(2).cells, cell("26", statuses.success, 2)] };
    assert.deepEqual(decideCommentAction(extra, previous), { kind: "update", previous });
  });

  describe("previous comment without a block (older bot versions)", () => {
    const table = (status: string) =>
      `<table><tbody><tr><th>ubuntu</th><td><a href="${url(1)}">${status}</a></td></tr></tbody></table>`;

    it("replaces when its status cells show a warning", () => {
      const previous = { id: 7, body: table(statuses.warning) };
      assert.deepEqual(decideCommentAction(clean(2), previous), { kind: "replace", previous });
    });

    it("replaces when the new build warns", () => {
      const previous = { id: 7, body: table(statuses.success) };
      assert.deepEqual(decideCommentAction(warned(2), previous), { kind: "replace", previous });
    });

    it("updates when neither side warns, ignoring \"warning\" inside link URLs", () => {
      const previous = { id: 7, body: table(statuses.success) };
      assert.deepEqual(decideCommentAction(clean(2), previous), { kind: "update", previous });
    });

    it("treats a previous comment without a body as warning-free", () => {
      const previous: { id: number; body?: string } = { id: 7 };
      assert.deepEqual(decideCommentAction(clean(2), previous), { kind: "update", previous });
    });
  });
});
