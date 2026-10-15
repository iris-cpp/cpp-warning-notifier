// On pull_request events GITHUB_SHA is the temporary merge commit, so the
// commit that was pushed has to come from the event payload.
export function headSha(event: unknown, fallback: string): string {
  const sha = (event as { pull_request?: { head?: { sha?: unknown } } } | undefined)?.pull_request
    ?.head?.sha;
  return typeof sha === "string" ? sha : fallback;
}

export interface TrailerInfo {
  readonly owner: string;
  readonly repo: string;
  readonly sha: string;
  readonly updatedAt: Date;
}

export function renderTrailer({ owner, repo, sha, updatedAt }: TrailerInfo): string {
  const time = `${updatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`;
  const url = `https://github.com/${owner}/${repo}/commit/${sha}`;
  return `<sub>Updated at ${time} for commit <a href="${url}"><code>${sha.slice(0, 7)}</code></a></sub>`;
}
