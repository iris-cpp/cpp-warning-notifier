// The fields of a job's step, as the GitHub REST API returns them, that locateStep reads.
export interface Step {
  readonly number: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
}

// Returns the number of the step to link to: the one the marker carries, or else the first successful step
// matching stepRegex.
export function locateStep(
  steps: readonly Step[],
  markerStep: number | undefined,
  stepRegex: string | undefined,
): number | undefined {
  if (markerStep !== undefined && steps.some((step) => step.number === markerStep)) return markerStep;
  if (stepRegex === undefined) return undefined;
  return steps.find(
    (step) => step.name.match(stepRegex) !== null && step.status === "completed" && step.conclusion === "success",
  )?.number;
}
