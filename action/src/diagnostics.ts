export type Severity = "warning" | "error";

export interface Diagnostic {
  readonly severity: Severity;
  // Repository-relative when the path is under the runner workspace.
  readonly file: string | undefined;
  readonly line: number | undefined;
  readonly column: number | undefined;
  readonly message: string;
  // "-Wunused-variable" for GCC/Clang, "C4189" for MSVC.
  readonly flag: string | undefined;
  // 0-based index of the line in the job log.
  readonly logLine: number;
}

const timestamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z /;
// GCC and Clang: file:line[:column]: severity: message [flag]
const gccLike = /^(.+?):(\d+)(?::(\d+))?: (warning|error): (.*?)(?: \[([^\]]+)\])?$/;
// MSVC: file(line[,column]): severity CODE: message
const msvc = /^(.+?)\((\d+)(?:,(\d+))?\): (warning|error) ([A-Z]+\d+): (.*)$/;
// Anything else the former line-based detection counted, e.g. linker output.
const bare = /(warning|error)(?: .\d+)?: (.*)$/;

export function parseDiagnostics(log: string, repository: string): Diagnostic[] {
  const workspace = new RegExp(
    `^.*?[\\\\/]${escapeRegExp(repository)}[\\\\/]${escapeRegExp(repository)}[\\\\/]`,
  );
  const relative = (file: string) => file.replace(workspace, "").replaceAll("\\", "/");
  const number = (s: string | undefined) => (s === undefined ? undefined : Number(s));

  const found: Diagnostic[] = [];
  log.split("\n").forEach((raw, logLine) => {
    const line = raw.replace(timestamp, "");
    const g = line.match(gccLike);
    if (g) {
      found.push({
        severity: g[4] as Severity,
        file: relative(g[1]),
        line: Number(g[2]),
        column: number(g[3]),
        message: g[5],
        flag: g[6],
        logLine,
      });
      return;
    }
    const m = line.match(msvc);
    if (m) {
      found.push({
        severity: m[4] as Severity,
        file: relative(m[1]),
        line: Number(m[2]),
        column: number(m[3]),
        message: m[6],
        flag: m[5],
        logLine,
      });
      return;
    }
    const b = line.match(bare);
    if (b) {
      found.push({
        severity: b[1] as Severity,
        file: undefined,
        line: undefined,
        column: undefined,
        message: b[2],
        flag: undefined,
        logLine,
      });
    }
  });
  return found;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
