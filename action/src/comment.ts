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
  | { kind: "update"; previous: T; unminimize: boolean };

// The bot keeps a single comment and overwrites it on every run, so its links
// always point at the latest run and nobody is notified. A comment someone
// minimized is brought back only when there is a warning to look at.
export function decideCommentAction<T extends CommentLike>(
  cellStatuses: readonly string[],
  previous: T | undefined,
): CommentAction<T> {
  if (previous === undefined) return { kind: "create" };
  const unminimize = cellStatuses.includes(statuses.warning);
  return { kind: "update", previous, unminimize };
}
