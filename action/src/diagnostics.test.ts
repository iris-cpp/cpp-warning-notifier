import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDiagnostics } from "./diagnostics.ts";

const ws = "/home/runner/work/cpp-warning-notifier/cpp-warning-notifier";

// Lines captured from a real job log of this repository's TEST workflow.
const log = [
  "2026-10-15T02:35:17.1156336Z hint: to use in all of your new repositories, which will suppress this warning,",
  `2026-10-15T02:35:23.0242206Z ${ws}/test/source.cpp:3:2: warning: #warning before C++23 is a GCC extension`,
  '2026-10-15T02:35:23.0285225Z     3 | #warning "WARNING!!!!"',
  "2026-10-15T02:35:23.0285477Z       |  ^~~~~~~",
  `2026-10-15T02:35:23.0286584Z ${ws}/test/source.cpp:3:2: warning: #warning "WARNING!!!!" [-Wcpp]`,
  `2026-10-15T02:35:23.2641841Z ${ws}/test/source.cpp: In function ‘int main()’:`,
  `2026-10-15T02:35:23.2648116Z ${ws}/test/source.cpp:8:7: warning: unused variable ‘unused_variable’ [-Wunused-variable]`,
  "2026-10-15T02:35:24.0000000Z CMake Warning (dev) at CMakeLists.txt:1 (project):",
].join("\n");

describe("parseDiagnostics", () => {
  it("parses GCC/Clang diagnostics with repository-relative paths and log positions", () => {
    const found = parseDiagnostics(log, "cpp-warning-notifier");
    assert.deepEqual(found, [
      {
        severity: "warning",
        file: "test/source.cpp",
        line: 3,
        column: 2,
        message: "#warning before C++23 is a GCC extension",
        flag: undefined,
        logLine: 1,
      },
      {
        severity: "warning",
        file: "test/source.cpp",
        line: 3,
        column: 2,
        message: '#warning "WARNING!!!!"',
        flag: "-Wcpp",
        logLine: 4,
      },
      {
        severity: "warning",
        file: "test/source.cpp",
        line: 8,
        column: 7,
        message: "unused variable ‘unused_variable’",
        flag: "-Wunused-variable",
        logLine: 6,
      },
    ]);
  });

  it("parses MSVC diagnostics and normalises path separators", () => {
    const line =
      "2026-10-15T02:35:23.0000000Z D:\\a\\cpp-warning-notifier\\cpp-warning-notifier\\test\\source.cpp(8): warning C4189: 'unused_variable': local variable is initialized but not referenced";
    assert.deepEqual(parseDiagnostics(line, "cpp-warning-notifier"), [
      {
        severity: "warning",
        file: "test/source.cpp",
        line: 8,
        column: undefined,
        message: "'unused_variable': local variable is initialized but not referenced",
        flag: "C4189",
        logLine: 0,
      },
    ]);
  });

  it("parses errors and keeps paths outside the workspace as they are", () => {
    const line = "/usr/include/c++/13/bits/foo.h:10:5: error: ‘x’ was not declared in this scope";
    assert.deepEqual(parseDiagnostics(line, "cpp-warning-notifier"), [
      {
        severity: "error",
        file: "/usr/include/c++/13/bits/foo.h",
        line: 10,
        column: 5,
        message: "‘x’ was not declared in this scope",
        flag: undefined,
        logLine: 0,
      },
    ]);
  });

  it("falls back to a file-less diagnostic for warning lines without a location", () => {
    const line = "2026-10-15T02:35:25.0000000Z ld: warning: libfoo.so, needed by bar, not found";
    assert.deepEqual(parseDiagnostics(line, "cpp-warning-notifier"), [
      {
        severity: "warning",
        file: undefined,
        line: undefined,
        column: undefined,
        message: "libfoo.so, needed by bar, not found",
        flag: undefined,
        logLine: 0,
      },
    ]);
  });

  it("ignores lines that are not diagnostics", () => {
    assert.deepEqual(parseDiagnostics("echo CPPWARNINGNOTIFIER_LOG_MARKER\nall good", "r"), []);
  });
});
