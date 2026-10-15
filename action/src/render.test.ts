import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Cell, decodeBlock } from "./report.ts";
import { renderBody, renderTable, renderWarnings } from "./render.ts";

const layout = { rowHeaderFields: ["os", "vendor"], columnField: "cpp" };

function cell(
  env: Record<string, string>,
  status: string,
  url: string,
  warnings: Cell["warnings"] = [],
): Cell {
  return { env, status, url, warnings };
}

const unused = { file: "src/a.cpp", line: 8, column: 7, message: "unused variable ‘x’", flag: "-Wunused-variable" };
const shift = { file: "src/b.cpp", line: 2, column: 1, message: "comparison of <int> & \"y\"", flag: undefined };
const linker = { file: undefined, line: undefined, column: undefined, message: "libfoo not found", flag: undefined };

const cells = [
  cell({ os: "ubuntu", vendor: "LLVM", cpp: "20" }, "✅success", "u3"),
  cell({ os: "ubuntu", vendor: "GNU", cpp: "23" }, "⚠️warning", "u2", [unused, shift, linker]),
  cell({ os: "ubuntu", vendor: "GNU", cpp: "20" }, "✅success", "u1"),
];

describe("renderTable", () => {
  it("groups row headers with rowspan and sorts columns numerically", () => {
    assert.equal(
      renderTable({ cells }, layout),
      '<table><thead><tr><th colspan="2">Environment</th><th>C++20</th><th>C++23</th></tr></thead>' +
        '<tbody><tr><th rowspan="2">ubuntu</th><th>GNU</th><td><a href="u1">✅success</a></td><td><a href="u2">⚠️warning</a></td></tr>' +
        '<tr><th>LLVM</th><td><a href="u3">✅success</a></td><td></td></tr></tbody></table>',
    );
  });
});

describe("renderWarnings", () => {
  it("lists each cell's warnings under a collapsed summary, escaped, skipping clean cells", () => {
    assert.equal(
      renderWarnings({ cells }, layout),
      "<details><summary>ubuntu GNU C++23: 3 warnings</summary><ul>" +
        "<li><code>src/a.cpp:8</code> unused variable ‘x’ <code>[-Wunused-variable]</code></li>" +
        "<li><code>src/b.cpp:2</code> comparison of &lt;int&gt; &amp; &quot;y&quot;</li>" +
        "<li>libfoo not found</li>" +
        "</ul></details>",
    );
  });

  it("uses the singular for one warning", () => {
    const one = [cell({ os: "u", vendor: "g", cpp: "20" }, "⚠️warning", "u", [unused])];
    assert.match(renderWarnings({ cells: one }, layout), /: 1 warning<\/summary>/);
  });
});

describe("renderBody", () => {
  it("contains the table, the warning lists and a decodable block", () => {
    const body = renderBody({ cells }, layout);
    assert.ok(body.startsWith("<table>"));
    assert.ok(body.includes("<details>"));
    assert.deepEqual(
      decodeBlock(body)?.cells.map((c) => c.status),
      ["✅success", "⚠️warning", "✅success"],
    );
  });

  it("stays within the comment size limit by truncating the visible lists", () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ ...unused, line: i, message: `warning number ${i}` }));
    const big = [cell({ os: "u", vendor: "g", cpp: "20" }, "⚠️warning", "u", many)];
    const body = renderBody({ cells: big }, layout);
    assert.ok(body.length <= 65536, `body is ${body.length} chars`);
    assert.match(body, /<li>… and \d+ more<\/li>/);
    assert.ok(decodeBlock(body));
  });
});
