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

// Only a warning justifies notifying reviewers with a fresh comment (and
// marking the old one outdated). Otherwise the previous comment is edited in
// place so its links point at the latest run without a new notification.
export function decideCommentAction<T extends CommentLike>(
  newBody: string,
  previous: T | undefined,
): CommentAction<T> {
  if (previous === undefined) return { kind: "create" };
  if (hasWarning(newBody) || hasWarning(previous.body ?? "")) return { kind: "replace", previous };
  return { kind: "update", previous };
}

// Matches the status cells rendered by generateTable; link URLs may contain
// "warning" (e.g. a repository name), so only the link text is inspected.
const statusCell = /<td><a href="[^"]*">([^<]*)<\/a><\/td>/g;

function hasWarning(table: string): boolean {
  return [...table.matchAll(statusCell)].some((m) => m[1] === statuses.warning);
}
