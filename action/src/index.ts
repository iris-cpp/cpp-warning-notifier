import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";

import { decideCommentAction, statuses } from "./comment.ts";
import { parseDiagnostics } from "./diagnostics.ts";
import { renderBody } from "./render.ts";
import type { Cell } from "./report.ts";

if (!process.env.GITHUB_REF?.startsWith("refs/pull/")) {
  console.log("not a pull request, exiting.");
  process.exit(0);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const githubRepository = requireEnv("GITHUB_REPOSITORY");
const githubRef = requireEnv("GITHUB_REF");

const runId = parseInt(requireEnv("INPUT_RUN_ID"));
const jobId = parseInt(requireEnv("INPUT_JOB_ID"));

const [owner, repo] = githubRepository.split("/");
const pullRequestNumber = parseInt(githubRef.split("/")[2]);

const ignoreNoMarker = requireEnv("INPUT_IGNORE_NO_MARKER") === "true";

const jobRegex = requireEnv("INPUT_JOB_REGEX");
const stepRegex = requireEnv("INPUT_STEP_REGEX");

const workerUrl = requireEnv("INPUT_WORKER_URL");

// ── Authentication ──────────────────────────────────────────────────────────
// Exchange a GitHub OIDC token for an installation access token via the
// Cloudflare Worker. Requires id-token: write on the job.

const installationToken = await getInstallationTokenFromWorker(workerUrl);
const octokit = new Octokit({ auth: installationToken });
const gql = graphql.defaults({ headers: { authorization: `token ${installationToken}` } });

// ── Job log processing ──────────────────────────────────────────────────────

const cells: Cell[] = [];

const { data: jobList } = await octokit.actions.listJobsForWorkflowRun({
  owner,
  repo,
  run_id: runId,
  per_page: 100,
});

for (const job of jobList.jobs) {
  if (job.id === jobId) continue;

  const { url: redirectUrl } = await octokit.actions.downloadJobLogsForWorkflowRun({
    owner,
    repo,
    job_id: job.id,
  });

  const response = await fetch(redirectUrl);
  if (!response.ok) {
    console.log(`failed to retrieve job log for ${job.id}`);
    continue;
  }
  const jobLog = await response.text();

  const lines = jobLog.split("\n");
  console.log(`total lines: ${lines.length}`);

  let offset = 0;
  const offsetIdx = lines.findIndex((line) => line.match("CPPWARNINGNOTIFIER_LOG_MARKER"));
  if (offsetIdx !== -1) {
    offset = offsetIdx;
  } else {
    if (ignoreNoMarker) {
      continue;
    }
  }

  const diagnostics = parseDiagnostics(jobLog, repo);
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const firstIssue = warnings[0] ?? diagnostics.find((d) => d.severity === "error");
  console.log(`warnings: ${warnings.length}`);

  let compileResult: string = statuses.success;
  let firstIssueLine = 1;
  if (firstIssue !== undefined) {
    compileResult = firstIssue.severity === "warning" ? statuses.warning : statuses.error;
    firstIssueLine = firstIssue.logLine - offset + 1;
    console.log(`first ${firstIssue.severity}: ${lines[firstIssue.logLine]}`);
  }

  const steps = job.steps ?? [];
  const stepIndex = steps.findIndex(
    (step) =>
      step.name.match(stepRegex) &&
      step.status === "completed" &&
      step.conclusion === "success",
  );
  const stepId = (stepIndex === -1 ? steps.length : stepIndex) + 1;

  console.log(`stepId is ${stepId}`);
  console.log(`job name is "${job.name}"`);

  const jobMatch = job.name.match(jobRegex);

  if (!jobMatch) {
    console.log("job match fail");
    continue;
  }

  cells.push({
    env: jobMatch.groups ?? {},
    status: compileResult,
    url: `https://github.com/${owner}/${repo}/actions/runs/${runId}/job/${job.id}#step:${stepId}:${firstIssueLine}`,
    warnings,
  });
}

console.log("cells", cells);

const rowHeaderFields: string[] = JSON.parse(requireEnv("INPUT_ROW_HEADERS"));
const columnField = requireEnv("INPUT_COLUMN_HEADER");

const body = renderBody({ cells }, { rowHeaderFields, columnField });

console.log("body is", body);

if (body) {
  console.log("checking previous comments");
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: pullRequestNumber,
  });

  const postComment = async () => {
    console.log("leaving comment");
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullRequestNumber,
      body,
    });
  };

  const sortedComments = comments
    .filter((comment) => comment.user?.login === "cppwarningnotifier[bot]")
    .toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const action = decideCommentAction({ cells }, sortedComments.at(-1));

  switch (action.kind) {
    case "create":
      await postComment();
      break;
    case "replace":
      await gql(
        `mutation MinimizeComment($id: ID!) {
          minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
            clientMutationId
          }
        }`,
        { id: action.previous.node_id },
      );
      await postComment();
      break;
    case "update":
      console.log("updating links in the previous comment");
      await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: action.previous.id,
        body,
      });
      break;
  }
}

// ── Worker authentication helper ────────────────────────────────────────────

async function getInstallationTokenFromWorker(workerUrl: string): Promise<string> {
  const tokenRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const tokenRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

  if (!tokenRequestUrl || !tokenRequestToken) {
    throw new Error(
      "ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set. " +
        "Ensure the job has 'permissions: id-token: write'.",
    );
  }

  // Request the OIDC token with the worker URL as the audience so the worker
  // can verify the token was intended for it.
  const oidcRequestUrl = `${tokenRequestUrl}&audience=${encodeURIComponent(workerUrl)}`;
  const oidcResponse = await fetch(oidcRequestUrl, {
    headers: { Authorization: `bearer ${tokenRequestToken}` },
  });

  if (!oidcResponse.ok) {
    const text = await oidcResponse.text();
    throw new Error(`Failed to obtain GitHub OIDC token (${oidcResponse.status}): ${text}`);
  }

  const { value: oidcToken } = (await oidcResponse.json()) as { value: string };

  // Exchange the OIDC token for a GitHub App installation access token.
  const tokenResponse = await fetch(`${workerUrl}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${oidcToken}` },
  });

  if (!tokenResponse.ok) {
    const err = (await tokenResponse.json()) as { error?: string };
    throw new Error(
      `Worker token exchange failed (${tokenResponse.status}): ${err.error ?? "unknown error"}`,
    );
  }

  const { token } = (await tokenResponse.json()) as { token: string };
  return token;
}
