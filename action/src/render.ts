import { type Cell, type Report, encodeBlock } from "./report.ts";

export interface Layout {
  readonly rowHeaderFields: readonly string[];
  readonly columnField: string;
}

// GitHub rejects issue comment bodies longer than this.
const maxBodyLength = 65536;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortCells(cells: readonly Cell[], layout: Layout): Cell[] {
  return [...cells].sort((a, b) => {
    for (const field of layout.rowHeaderFields) {
      const order = compareStrings(a.env[field] ?? "", b.env[field] ?? "");
      if (order !== 0) return order;
    }
    return compareStrings(a.env[layout.columnField] ?? "", b.env[layout.columnField] ?? "");
  });
}

function renderRows(
  cells: readonly Cell[],
  depth: number,
  columns: readonly string[],
  cellMap: ReadonlyMap<string, Cell>,
  layout: Layout,
): string[] {
  if (depth === layout.rowHeaderFields.length) {
    const representative = cells[0];
    const rowFields = layout.rowHeaderFields.map((f) => representative.env[f]);
    const tds = columns.map((col) => {
      const cell = cellMap.get(JSON.stringify([...rowFields, col]));
      if (!cell) return "<td></td>";
      return `<td><a href="${escapeHtml(cell.url)}">${escapeHtml(cell.status)}</a></td>`;
    });
    return [`${tds.join("")}</tr>`];
  }

  const field = layout.rowHeaderFields[depth];
  const groups = Map.groupBy(cells, (c) => c.env[field] ?? "");
  const result: string[] = [];

  for (const [value, group] of groups) {
    const childRows = renderRows(group, depth + 1, columns, cellMap, layout);
    const rowspan = childRows.length;
    const th =
      rowspan > 1
        ? `<th rowspan="${rowspan}">${escapeHtml(value)}</th>`
        : `<th>${escapeHtml(value)}</th>`;
    childRows[0] = `${th}${childRows[0]}`;
    result.push(...childRows);
  }

  return result;
}

export function renderTable(report: Report, layout: Layout): string {
  const columns = [...new Set(report.cells.map((c) => c.env[layout.columnField] ?? ""))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const sorted = sortCells(report.cells, layout);

  const cellMap = new Map<string, Cell>();
  for (const cell of sorted) {
    const key = JSON.stringify([
      ...layout.rowHeaderFields.map((f) => cell.env[f]),
      cell.env[layout.columnField],
    ]);
    cellMap.set(key, cell);
  }

  const theadCols = columns.map((v) => `<th>C++${v}</th>`).join("");
  const thead = `<thead><tr><th colspan="${layout.rowHeaderFields.length}">Environment</th>${theadCols}</tr></thead>`;

  const rows = renderRows(sorted, 0, columns, cellMap, layout);
  const tbody = `<tbody>${rows.map((r) => `<tr>${r}`).join("")}</tbody>`;

  return `<table>${thead}${tbody}</table>`;
}

function renderWarning(w: Cell["warnings"][number]): string {
  const location = w.file === undefined ? "" : `<code>${escapeHtml(w.file)}${w.line === undefined ? "" : `:${w.line}`}</code> `;
  const flag = w.flag === undefined ? "" : ` <code>[${escapeHtml(w.flag)}]</code>`;
  return `<li>${location}${escapeHtml(w.message)}${flag}</li>`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function renderWarnings(report: Report, layout: Layout, limitPerCell = Infinity): string {
  const warned = sortCells(report.cells, layout).filter((c) => c.warnings.length > 0);
  if (warned.length === 0) return "";

  const groups = warned.map((c) => {
    const title = [
      ...layout.rowHeaderFields.map((f) => c.env[f] ?? ""),
      `C++${c.env[layout.columnField] ?? ""}`,
    ].join(" ");
    const count = c.warnings.length;
    const shown = c.warnings.slice(0, limitPerCell).map(renderWarning);
    if (count > shown.length) shown.push(`<li>… and ${count - shown.length} more</li>`);
    return `<li><b>${escapeHtml(title)}</b> (${plural(count, "warning")})<ul>${shown.join("")}</ul></li>`;
  });

  const total = warned.reduce((n, c) => n + c.warnings.length, 0);
  const summary = `${plural(total, "warning")} in ${plural(warned.length, "environment")}`;
  return `<details><summary>${summary}</summary><ul>${groups.join("")}</ul></details>`;
}

export function renderBody(report: Report, layout: Layout): string {
  const table = renderTable(report, layout);
  const block = encodeBlock(report);
  // Shrink the visible lists until the body fits; the table and block always stay.
  for (const limit of [Infinity, 50, 10, 3, 0]) {
    const body = `${table}\n${renderWarnings(report, layout, limit)}\n${block}`;
    if (body.length <= maxBodyLength) return body;
  }
  return `${table}\n${block}`;
}
