import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideCommentAction, statuses } from "./comment.ts";

// A repository name containing "warning", as iris-cpp/cpp-warning-notifier does.
const url = "https://github.com/example/cpp-warning-notifier/actions/runs/1/job/2#step:3:4";

function table(...cellStatuses: string[]): string {
  const cells = cellStatuses.map((s) => `<td><a href="${url}">${s}</a></td>`).join("");
  return `<table><tbody><tr><th>ubuntu</th>${cells}</tr></tbody></table>`;
}

const successTable = table(statuses.success, statuses.success);
const warningTable = table(statuses.success, statuses.warning);

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
    const previous: { id: number; body?: string } = { id: 7 };
    assert.deepEqual(decideCommentAction(successTable, previous), { kind: "update", previous });
  });

  it('ignores "warning" outside status cells, such as in link URLs', () => {
    const previous = { id: 7, body: table(statuses.error) };
    assert.deepEqual(decideCommentAction(table(statuses.error), previous), { kind: "update", previous });
  });
});
