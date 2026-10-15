import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Cell,
  type Report,
  decodeBlock,
  encodeBlock,
  reportMatchesBlock,
  warningDigest,
} from "./report.ts";

const unused = { file: "src/a.cpp", line: 8, column: 7, message: "unused variable ‘x’", flag: "-Wunused-variable" };
const cpp = { file: "src/a.cpp", line: 3, column: 2, message: '#warning "W"', flag: "-Wcpp" };

function cell(env: Record<string, string>, status: string, warnings: Cell["warnings"] = []): Cell {
  return { env, status, url: "https://example.test/runs/1", warnings };
}

const report: Report = {
  cells: [
    cell({ os: "ubuntu", cpp: "20" }, "⚠️warning", [cpp, unused]),
    cell({ os: "ubuntu", cpp: "23" }, "✅success"),
  ],
};

describe("warningDigest", () => {
  it("ignores order, line and column", () => {
    const moved = { ...unused, line: 20, column: 1 };
    assert.equal(warningDigest([unused, cpp]), warningDigest([cpp, moved]));
  });

  it("counts duplicates and distinguishes file, flag and message", () => {
    const base = warningDigest([unused]);
    assert.notEqual(warningDigest([unused, unused]), base);
    assert.notEqual(warningDigest([{ ...unused, file: "src/b.cpp" }]), base);
    assert.notEqual(warningDigest([{ ...unused, flag: "-Wother" }]), base);
    assert.notEqual(warningDigest([{ ...unused, message: "other" }]), base);
  });

  it("treats a missing file or flag as empty", () => {
    const fileless = { file: undefined, line: undefined, column: undefined, message: "m", flag: undefined };
    assert.equal(warningDigest([fileless]), warningDigest([{ ...fileless, file: undefined }]));
    assert.notEqual(warningDigest([fileless]), warningDigest([{ ...fileless, file: "x" }]));
  });
});

describe("encodeBlock / decodeBlock", () => {
  it("round-trips the per-cell status and digest through a comment body", () => {
    const body = `<table></table>\n${encodeBlock(report)}`;
    const block = decodeBlock(body);
    assert.ok(block);
    assert.deepEqual(block.cells, [
      { env: { os: "ubuntu", cpp: "20" }, status: "⚠️warning", digest: warningDigest([cpp, unused]) },
      { env: { os: "ubuntu", cpp: "23" }, status: "✅success", digest: warningDigest([]) },
    ]);
  });

  it("survives an environment value that would close the HTML comment", () => {
    const tricky: Report = { cells: [cell({ name: "a-->b" }, "✅success")] };
    const encoded = encodeBlock(tricky);
    assert.equal(encoded.indexOf("-->"), encoded.length - 3);
    assert.deepEqual(decodeBlock(encoded)?.cells[0].env, { name: "a-->b" });
  });

  it("returns undefined when there is no block or the version is unknown", () => {
    assert.equal(decodeBlock("<table></table>"), undefined);
    assert.equal(decodeBlock('<!-- cpp-warning-notifier:v1 {"v":2,"cells":[]} -->'), undefined);
    assert.equal(decodeBlock("<!-- cpp-warning-notifier:v1 not json -->"), undefined);
  });
});

describe("reportMatchesBlock", () => {
  const block = decodeBlock(encodeBlock(report))!;

  it("matches the report it was made from, regardless of cell order", () => {
    assert.equal(reportMatchesBlock(report, block), true);
    assert.equal(reportMatchesBlock({ cells: [...report.cells].reverse() }, block), true);
  });

  it("does not match when a status, a warning set, or the set of cells changes", () => {
    const [a, b] = report.cells;
    assert.equal(reportMatchesBlock({ cells: [a, { ...b, status: "⚠️warning" }] }, block), false);
    assert.equal(reportMatchesBlock({ cells: [{ ...a, warnings: [cpp] }, b] }, block), false);
    assert.equal(reportMatchesBlock({ cells: [a] }, block), false);
    assert.equal(reportMatchesBlock({ cells: [a, b, cell({ os: "mac", cpp: "20" }, "✅success")] }, block), false);
  });

  it("matches when only lines and links moved", () => {
    const [a, b] = report.cells;
    const moved = { ...a, url: "https://example.test/runs/2", warnings: [{ ...unused, line: 9 }, { ...cpp, line: 4 }] };
    assert.equal(reportMatchesBlock({ cells: [moved, b] }, block), true);
  });
});
