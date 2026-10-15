import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { headSha, renderTrailer } from "./trailer.ts";

describe("headSha", () => {
  it("prefers the pull request head over the merge commit", () => {
    const event = { pull_request: { head: { sha: "abc123" } } };
    assert.equal(headSha(event, "merge456"), "abc123");
  });

  it("falls back when the payload has no pull request head", () => {
    assert.equal(headSha({}, "merge456"), "merge456");
    assert.equal(headSha(undefined, "merge456"), "merge456");
    assert.equal(headSha({ pull_request: { head: { sha: 42 } } }, "merge456"), "merge456");
  });
});

describe("renderTrailer", () => {
  it("states the update time in UTC and links the commit by its short SHA", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    assert.equal(
      renderTrailer({
        owner: "iris-cpp",
        repo: "cpp-warning-notifier",
        sha,
        updatedAt: new Date("2026-10-15T06:19:11.123Z"),
      }),
      `<sub>Updated at 2026-10-15 06:19:11 UTC for commit <a href="https://github.com/iris-cpp/cpp-warning-notifier/commit/${sha}"><code>0123456</code></a></sub>`,
    );
  });
});
