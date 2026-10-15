import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideCommentAction, statuses } from "./comment.ts";

const clean = [statuses.success, statuses.success];
const warned = [statuses.warning, statuses.success];
const failed = [statuses.error, statuses.success];

describe("decideCommentAction", () => {
  it("creates a comment when the bot has not commented yet", () => {
    assert.deepEqual(decideCommentAction(clean, undefined), { kind: "create" });
    assert.deepEqual(decideCommentAction(warned, undefined), { kind: "create" });
  });

  it("always updates the existing comment, whatever it said before", () => {
    for (const body of ["<table>✅success</table>", "<table>⚠️warning</table>", undefined]) {
      const previous: { id: number; body?: string } = body === undefined ? { id: 7 } : { id: 7, body };
      assert.deepEqual(decideCommentAction(clean, previous), { kind: "update", previous, unminimize: false });
    }
  });

  it("asks for the comment to be resurfaced only when the new result has warnings", () => {
    const previous = { id: 7, body: "<table></table>" };
    assert.deepEqual(decideCommentAction(warned, previous), { kind: "update", previous, unminimize: true });
    assert.deepEqual(decideCommentAction(failed, previous), { kind: "update", previous, unminimize: false });
  });
});
