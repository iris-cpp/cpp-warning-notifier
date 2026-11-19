import { statuses } from "./comment.ts";

const marker = "CPPWARNINGNOTIFIER_LOG_MARKER";
// The marker printed by the step, as opposed to the runner's echo of the step's script that contains it.
const markerOutputRegex = new RegExp(`^(\\S+ )?${marker}\\r?$`);

const warningRegex = /warning( .\d+)?:/;
const errorRegex = /error( .\d+)?:/;

export interface LogScan {
  readonly hasMarker: boolean;
  readonly status: string;
  // 1-based, counted from the first line that mentions the marker, which starts the step that prints it.
  readonly firstIssueLine: number;
  readonly issue: string | undefined;
}

// Looks for compiler warnings and errors after the marker's output, so that earlier steps, including the runner's
// echo of their scripts, are not taken for compiler output.
export function scanJobLog(jobLog: string): LogScan {
  const lines = jobLog.split("\n");

  const stepStart = lines.findIndex((line) => line.includes(marker));
  const hasMarker = stepStart !== -1;
  const offset = hasMarker ? stepStart : 0;
  const markerOutput = hasMarker ? lines.findIndex((line, i) => i > stepStart && markerOutputRegex.test(line)) : -1;
  const searchStart = markerOutput !== -1 ? markerOutput + 1 : offset;

  const find = (regex: RegExp) => {
    const i = lines.slice(searchStart).findIndex((line) => regex.test(line));
    return i === -1 ? -1 : searchStart + i;
  };

  const warningIdx = find(warningRegex);
  if (warningIdx !== -1) {
    return { hasMarker, status: statuses.warning, firstIssueLine: warningIdx - offset + 1, issue: lines[warningIdx] };
  }
  const errorIdx = find(errorRegex);
  if (errorIdx !== -1) {
    return { hasMarker, status: statuses.error, firstIssueLine: errorIdx - offset + 1, issue: lines[errorIdx] };
  }
  return { hasMarker, status: statuses.success, firstIssueLine: 1, issue: undefined };
}
