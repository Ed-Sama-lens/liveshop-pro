/**
 * Generic CSV builder.
 * Handles escaping, quoting, and BOM for Excel compatibility.
 */

function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly { key: keyof T & string; header: string }[]
): string {
  const header = columns.map((col) => escapeField(col.header)).join(',');

  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return '';
        return escapeField(String(val));
      })
      .join(',')
  );

  // BOM prefix for Excel UTF-8 support
  return '\uFEFF' + [header, ...dataRows].join('\r\n');
}
