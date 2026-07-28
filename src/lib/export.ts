import "server-only";

/**
 * Tabular export.
 *
 * CSV today, because it opens natively in Excel and Google Sheets and costs the
 * project no new dependencies. The seam is deliberate: `formatTable` is the only
 * place that knows the output format, so swapping in a real .xlsx writer (or a
 * PDF renderer) later means adding a branch here rather than touching any route
 * or button. Routes build a Table and ask for a Response; they never build a
 * string themselves.
 */

export type Table = {
  /** Used for the download filename and the sheet title. */
  name: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
};

export type ExportFormat = "csv";

/**
 * Escape one CSV field.
 *
 * Anything containing a delimiter, quote or newline is quoted, and embedded
 * quotes are doubled — RFC 4180. Leading =, +, - and @ are additionally
 * prefixed with a single quote: without it, a spreadsheet interprets the cell
 * as a formula, which is both a correctness bug and a CSV-injection vector when
 * the value came from user input (a company name, say).
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function formatTable(table: Table, format: ExportFormat = "csv"): string {
  switch (format) {
    case "csv":
      return [
        table.columns.map(csvCell).join(","),
        ...table.rows.map((row) => row.map(csvCell).join(",")),
      ].join("\r\n");
  }
}

/**
 * A downloadable Response for a table.
 *
 * The UTF-8 BOM is required for Excel on Windows to detect the encoding;
 * without it, non-ASCII company names arrive mojibaked.
 */
export function tableResponse(table: Table, format: ExportFormat = "csv"): Response {
  const body = "﻿" + formatTable(table, format);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${table.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
