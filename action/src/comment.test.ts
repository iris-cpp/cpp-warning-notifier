import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideCommentAction } from "./comment.ts";

const successTable =
  '<table><tbody><tr><td><a href="https://example.test/runs/1">✅success</a></td></tr></tbody></table>';
const warningTable =
  '<table><tbody><tr><td><a href="https://example.test/runs/1">⚠️warning</a></td></tr></tbody></table>';

describe("decideCommentAction", () => {
  it("creates a comment when the bot has not commented yet", () => {
    assert.deepEqual(decideCommentAction(successTable, undefined), { kind: "create" });
  });

  it("replaces the previous comment when the new table has a warning", () => {
    const previous = { id: 7, body: successTable };
    assert.deepEqual(decideCommentAction(warningTable, previous), { kind: "replace", previous });
  });

  it("replaces the previous comment when the previous table had a warning", () => {
    const previous = { id: 7, body: warningTable };
    assert.deepEqual(decideCommentAction(successTable, previous), { kind: "replace", previous });
  });

  it("updates the previous comment in place when neither table has a warning", () => {
    const previous = { id: 7, body: successTable };
    assert.deepEqual(decideCommentAction(successTable, previous), { kind: "update", previous });
  });

  it("treats a previous comment without a body as having no warning", () => {
    const previous = { id: 7 };
    assert.deepEqual(decideCommentAction(successTable, previous), { kind: "update", previous });
  });
});
