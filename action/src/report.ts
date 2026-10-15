import { createHash } from "node:crypto";

export interface ReportedWarning {
  readonly file: string | undefined;
  readonly line: number | undefined;
  readonly column: number | undefined;
  readonly message: string;
  readonly flag: string | undefined;
}

export interface Cell {
  readonly env: Readonly<Record<string, string>>;
  readonly status: string;
  readonly url: string;
  readonly warnings: readonly ReportedWarning[];
}

export interface Report {
  readonly cells: readonly Cell[];
}

export interface BlockCell {
  readonly env: Readonly<Record<string, string>>;
  readonly status: string;
  readonly digest: string;
}

export interface Block {
  readonly v: 1;
  readonly cells: readonly BlockCell[];
}

// Two builds have "the same" warnings in a cell when the multiset of
// (file, flag, message) is equal; lines and columns move with unrelated edits.
export function warningDigest(warnings: readonly ReportedWarning[]): string {
  const identities = warnings
    .map((w) => JSON.stringify([w.file ?? "", w.flag ?? "", w.message]))
    .sort();
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex");
}

export function cellKey(env: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(env).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const blockPrefix = "<!-- cpp-warning-notifier:v1 ";
const blockSuffix = " -->";
const blockPattern = /<!-- cpp-warning-notifier:v1 (.*?) -->/s;

export function encodeBlock(report: Report): string {
  const block: Block = {
    v: 1,
    cells: report.cells.map((c) => ({ env: c.env, status: c.status, digest: warningDigest(c.warnings) })),
  };
  // "-->" may only occur inside JSON strings here, where > is equivalent.
  const json = JSON.stringify(block).replaceAll("-->", "--\\u003e");
  return `${blockPrefix}${json}${blockSuffix}`;
}

export function decodeBlock(body: string): Block | undefined {
  const match = body.match(blockPattern);
  if (!match) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return undefined;
  }
  return isBlock(parsed) ? parsed : undefined;
}

function isBlock(value: unknown): value is Block {
  if (typeof value !== "object" || value === null) return false;
  const { v, cells } = value as { v?: unknown; cells?: unknown };
  return (
    v === 1 &&
    Array.isArray(cells) &&
    cells.every(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        typeof c.env === "object" &&
        c.env !== null &&
        typeof c.status === "string" &&
        typeof c.digest === "string",
    )
  );
}

export function reportMatchesBlock(report: Report, block: Block): boolean {
  if (report.cells.length !== block.cells.length) return false;
  const previous = new Map(block.cells.map((c) => [cellKey(c.env), c]));
  return report.cells.every((c) => {
    const p = previous.get(cellKey(c.env));
    return p !== undefined && p.status === c.status && p.digest === warningDigest(c.warnings);
  });
}
