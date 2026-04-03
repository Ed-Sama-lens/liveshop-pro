// ─── Types ───────────────────────────────────────────────────────────────────

export interface RawProductRow {
  readonly stockCode: string;
  readonly saleCode: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly sku: string;
  readonly attributes: string;
  readonly price: string;
  readonly costPrice: string;
  readonly quantity: string;
  readonly lowStockAt: string;
}

export interface RowError {
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  readonly rows: readonly RawProductRow[];
  readonly errors: readonly RowError[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const CSV_HEADERS = Object.freeze([
  'stockCode',
  'saleCode',
  'name',
  'description',
  'category',
  'sku',
  'attributes',
  'price',
  'costPrice',
  'quantity',
  'lowStockAt',
] as const);

const MAX_ROWS = 2000;
const REQUIRED_FIELDS: ReadonlyArray<keyof RawProductRow> = ['stockCode', 'name', 'sku', 'price'];

// ─── CSV Field Parser ─────────────────────────────────────────────────────────

/**
 * Parse a single CSV line into fields, supporting quoted fields that may
 * contain commas or escaped double-quotes ("").
 */
function parseFields(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      i += 1;
      let value = '';
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote
            value += '"';
            i += 2;
          } else {
            // End of quoted field
            i += 1;
            break;
          }
        } else {
          value += line[i];
          i += 1;
        }
      }
      fields.push(value);
      // Skip comma separator
      if (line[i] === ',') {
        i += 1;
      }
    } else {
      // Unquoted field — read until comma or end
      const start = i;
      while (i < line.length && line[i] !== ',') {
        i += 1;
      }
      fields.push(line.slice(start, i));
      // Skip comma separator
      if (line[i] === ',') {
        i += 1;
      }
    }
  }

  return fields;
}

// ─── Parse ───────────────────────────────────────────────────────────────────

export function parseProductCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/);

  // Strip empty trailing lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    return Object.freeze({ rows: Object.freeze([]), errors: Object.freeze([]) });
  }

  const headerFields = parseFields(lines[0]);
  const headerIndices = new Map<string, number>();
  for (let i = 0; i < headerFields.length; i++) {
    headerIndices.set(headerFields[i].trim(), i);
  }

  const dataLines = lines.slice(1);

  if (dataLines.length > MAX_ROWS) {
    return Object.freeze({
      rows: Object.freeze([]),
      errors: Object.freeze([
        Object.freeze({
          line: MAX_ROWS + 2,
          message: `CSV exceeds maximum of ${MAX_ROWS} rows`,
        }),
      ]),
    });
  }

  const rows: RawProductRow[] = [];
  const errors: RowError[] = [];

  for (let idx = 0; idx < dataLines.length; idx++) {
    const lineNumber = idx + 2; // 1-based, account for header
    const rawLine = dataLines[idx];

    if (rawLine.trim() === '') continue;

    const fields = parseFields(rawLine);

    const getField = (name: string): string => {
      const colIdx = headerIndices.get(name);
      if (colIdx === undefined) return '';
      return (fields[colIdx] ?? '').trim();
    };

    const row: RawProductRow = Object.freeze({
      stockCode: getField('stockCode'),
      saleCode: getField('saleCode'),
      name: getField('name'),
      description: getField('description'),
      category: getField('category'),
      sku: getField('sku'),
      attributes: getField('attributes'),
      price: getField('price'),
      costPrice: getField('costPrice'),
      quantity: getField('quantity'),
      lowStockAt: getField('lowStockAt'),
    });

    const rowErrors: RowError[] = [];
    for (const field of REQUIRED_FIELDS) {
      if (!row[field]) {
        rowErrors.push(
          Object.freeze({ line: lineNumber, message: `Missing required field: ${field}` })
        );
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      rows.push(row);
    }
  }

  return Object.freeze({
    rows: Object.freeze(rows),
    errors: Object.freeze(errors),
  });
}

// ─── Generate ─────────────────────────────────────────────────────────────────

interface ProductForExport {
  readonly stockCode: string;
  readonly saleCode: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly category: { readonly name: string } | null;
  readonly variants?: ReadonlyArray<{
    readonly sku: string;
    readonly attributes: Record<string, string>;
    readonly price: string;
    readonly costPrice: string | null;
    readonly quantity: number;
    readonly lowStockAt: number | null;
  }>;
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateProductCsv(products: readonly ProductForExport[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const lines: string[] = [headerLine];

  for (const product of products) {
    const variants = product.variants ?? [];

    if (variants.length === 0) {
      // Product with no variants — emit one row with empty variant fields
      const row = [
        escapeCsvField(product.stockCode),
        escapeCsvField(product.saleCode ?? ''),
        escapeCsvField(product.name),
        escapeCsvField(product.description ?? ''),
        escapeCsvField(product.category?.name ?? ''),
        '',
        '',
        '',
        '',
        '',
        '',
      ];
      lines.push(row.join(','));
    } else {
      for (const variant of variants) {
        const row = [
          escapeCsvField(product.stockCode),
          escapeCsvField(product.saleCode ?? ''),
          escapeCsvField(product.name),
          escapeCsvField(product.description ?? ''),
          escapeCsvField(product.category?.name ?? ''),
          escapeCsvField(variant.sku),
          escapeCsvField(JSON.stringify(variant.attributes)),
          escapeCsvField(variant.price),
          escapeCsvField(variant.costPrice ?? ''),
          escapeCsvField(String(variant.quantity)),
          escapeCsvField(variant.lowStockAt != null ? String(variant.lowStockAt) : ''),
        ];
        lines.push(row.join(','));
      }
    }
  }

  return lines.join('\n');
}
