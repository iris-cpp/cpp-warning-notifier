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

function hasWarning(body: string): boolean {
  return body.includes("warning");
}
