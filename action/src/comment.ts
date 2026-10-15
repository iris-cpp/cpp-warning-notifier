import { type Report, decodeBlock, reportMatchesBlock } from "./report.ts";

export const statuses = {
  success: "✅success",
  warning: "⚠️warning",
  error: "❌error",
} as const;

export interface CommentLike {
  readonly body?: string | undefined;
}

export type CommentAction<T extends CommentLike> =
  | { kind: "create" }
  | { kind: "replace"; previous: T }
  | { kind: "update"; previous: T };

// A fresh comment (with the old one marked outdated) notifies reviewers, so it
// is posted only when the warnings changed and a warning is involved on either
// side. Otherwise the previous comment is edited in place, which refreshes its
// links to the latest run without a notification.
export function decideCommentAction<T extends CommentLike>(
  report: Report,
  previous: T | undefined,
): CommentAction<T> {
  if (previous === undefined) return { kind: "create" };

  const body = previous.body ?? "";
  const block = decodeBlock(body);
  if (block !== undefined && reportMatchesBlock(report, block)) return { kind: "update", previous };

  const previousWarned =
    block === undefined
      ? hasWarningCell(body)
      : block.cells.some((c) => c.status === statuses.warning);
  const currentWarns = report.cells.some((c) => c.status === statuses.warning);
  if (currentWarns || previousWarned) return { kind: "replace", previous };
  return { kind: "update", previous };
}

// Comments posted before the block existed only carry status cells. Link URLs
// may contain "warning" (e.g. a repository name), so only the link text counts.
const statusCell = /<td><a href="[^"]*">([^<]*)<\/a><\/td>/g;

function hasWarningCell(table: string): boolean {
  return [...table.matchAll(statusCell)].some((m) => m[1] === statuses.warning);
}
