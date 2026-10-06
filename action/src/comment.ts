export interface CommentLike {
  readonly body?: string | undefined;
}

export type CommentAction<T extends CommentLike> =
  | { kind: "create" }
  | { kind: "replace"; previous: T }
  | { kind: "skip" };

// Only a warning justifies notifying reviewers with a fresh comment (and
// marking the old one outdated); otherwise the bot stays quiet.
export function decideCommentAction<T extends CommentLike>(
  newBody: string,
  previous: T | undefined,
): CommentAction<T> {
  if (previous === undefined) return { kind: "create" };
  if (hasWarning(newBody) || hasWarning(previous.body ?? "")) return { kind: "replace", previous };
  return { kind: "skip" };
}

function hasWarning(body: string): boolean {
  return body.includes("warning");
}
