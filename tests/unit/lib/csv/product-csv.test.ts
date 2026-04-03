import { describe, it, expect } from 'vitest';
import { parseProductCsv, generateProductCsv, CSV_HEADERS } from '@/lib/csv/product-csv';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHeader(): string {
  return CSV_HEADERS.join(',');
}

function makeRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    stockCode: 'SC001',
    saleCode: 'SALE001',
    name: 'Test Product',
    description: 'A description',
    category: 'Electronics',
    sku: 'SKU-001',
    attributes: '{"color":"Red"}',
    price: '9.99',
    costPrice: '5.00',
    quantity: '10',
    lowStockAt: '2',
  };
  const merged = { ...defaults, ...overrides };
  return CSV_HEADERS.map((h) => merged[h] ?? '').join(',');
}

// ─── parseProductCsv ─────────────────────────────────────────────────────────

describe('parseProductCsv()', () => {
  it('returns empty rows for empty CSV', () => {
    const result = parseProductCsv('');
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty rows for header-only CSV', () => {
    const result = parseProductCsv(makeHeader());
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('parses a valid single row correctly', () => {
    const csv = [makeHeader(), makeRow()].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].stockCode).toBe('SC001');
    expect(rows[0].name).toBe('Test Product');
    expect(rows[0].sku).toBe('SKU-001');
    expect(rows[0].price).toBe('9.99');
    expect(rows[0].attributes).toBe('{"color":"Red"}');
    expect(rows[0].quantity).toBe('10');
    expect(rows[0].lowStockAt).toBe('2');
  });

  it('parses multiple valid rows', () => {
    const csv = [
      makeHeader(),
      makeRow({ stockCode: 'SC001', sku: 'SKU-001' }),
      makeRow({ stockCode: 'SC002', sku: 'SKU-002' }),
      makeRow({ stockCode: 'SC003', sku: 'SKU-003' }),
    ].join('\n');

    const { rows, errors } = parseProductCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[1].stockCode).toBe('SC002');
    expect(rows[2].sku).toBe('SKU-003');
  });

  it('reports error for missing stockCode', () => {
    const csv = [makeHeader(), makeRow({ stockCode: '' })].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.message.includes('stockCode'))).toBe(true);
    expect(errors[0].line).toBe(2);
  });

  it('reports error for missing name', () => {
    const csv = [makeHeader(), makeRow({ name: '' })].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.message.includes('name'))).toBe(true);
  });

  it('reports error for missing sku', () => {
    const csv = [makeHeader(), makeRow({ sku: '' })].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.message.includes('sku'))).toBe(true);
  });

  it('reports error for missing price', () => {
    const csv = [makeHeader(), makeRow({ price: '' })].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.message.includes('price'))).toBe(true);
  });

  it('collects multiple field errors for the same row', () => {
    const csv = [makeHeader(), makeRow({ stockCode: '', name: '', sku: '', price: '' })].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(4);
  });

  it('returns an error when row count exceeds 2000', () => {
    const rows = Array.from({ length: 2001 }, (_, i) =>
      makeRow({ stockCode: `SC${i}`, sku: `SKU-${i}` })
    );
    const csv = [makeHeader(), ...rows].join('\n');
    const { rows: parsedRows, errors } = parseProductCsv(csv);

    expect(parsedRows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/2000/);
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      makeHeader(),
      makeRow({ name: '"Product, with comma"', description: '"Has a, comma in it"' }),
    ].join('\n');

    const { rows, errors } = parseProductCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Product, with comma');
    expect(rows[0].description).toBe('Has a, comma in it');
  });

  it('handles quoted fields containing escaped double-quotes', () => {
    const csv = [makeHeader(), makeRow({ name: '"Product ""Pro"" Edition"' })].join('\n');

    const { rows, errors } = parseProductCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe('Product "Pro" Edition');
  });

  it('skips blank lines between data rows', () => {
    const csv = [makeHeader(), makeRow({ stockCode: 'SC001', sku: 'SKU-001' }), '', makeRow({ stockCode: 'SC002', sku: 'SKU-002' })].join('\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it('handles CRLF line endings', () => {
    const csv = [makeHeader(), makeRow()].join('\r\n');
    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('produces frozen (immutable) result objects', () => {
    const csv = [makeHeader(), makeRow()].join('\n');
    const result = parseProductCsv(csv);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.errors)).toBe(true);
  });
});

// ─── generateProductCsv ──────────────────────────────────────────────────────

describe('generateProductCsv()', () => {
  it('generates a header-only CSV for empty product list', () => {
    const csv = generateProductCsv([]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
  });

  it('generates one row per variant', () => {
    const products = [
      {
        stockCode: 'SC001',
        saleCode: 'SALE001',
        name: 'Test Product',
        description: 'A description',
        category: { name: 'Electronics' },
        variants: [
          { sku: 'SKU-A', attributes: { color: 'Red' }, price: '9.99', costPrice: '5.00', quantity: 10, lowStockAt: 2 },
          { sku: 'SKU-B', attributes: { color: 'Blue' }, price: '9.99', costPrice: null, quantity: 5, lowStockAt: null },
        ],
      },
    ];

    const csv = generateProductCsv(products);
    const lines = csv.split('\n');
    // 1 header + 2 variant rows
    expect(lines).toHaveLength(3);
  });

  it('round-trips: generate then parse produces the same data', () => {
    const products = [
      {
        stockCode: 'SC001',
        saleCode: 'SALE001',
        name: 'Test Product',
        description: 'A description',
        category: { name: 'Electronics' },
        variants: [
          { sku: 'SKU-A', attributes: { color: 'Red', size: 'M' }, price: '9.99', costPrice: '5.00', quantity: 10, lowStockAt: 2 },
        ],
      },
    ];

    const csv = generateProductCsv(products);
    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].stockCode).toBe('SC001');
    expect(rows[0].sku).toBe('SKU-A');
    expect(rows[0].price).toBe('9.99');
    expect(rows[0].quantity).toBe('10');
    expect(rows[0].lowStockAt).toBe('2');

    const parsedAttributes = JSON.parse(rows[0].attributes) as Record<string, string>;
    expect(parsedAttributes.color).toBe('Red');
    expect(parsedAttributes.size).toBe('M');
  });

  it('escapes commas in field values', () => {
    const products = [
      {
        stockCode: 'SC001',
        saleCode: null,
        name: 'Product, with comma',
        description: null,
        category: null,
        variants: [
          { sku: 'SKU-A', attributes: {}, price: '9.99', costPrice: null, quantity: 0, lowStockAt: null },
        ],
      },
    ];

    const csv = generateProductCsv(products);
    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe('Product, with comma');
  });

  it('handles products with no variants by emitting one row with empty variant fields', () => {
    const products = [
      {
        stockCode: 'SC001',
        saleCode: null,
        name: 'No Variants',
        description: null,
        category: null,
        variants: [],
      },
    ];

    const csv = generateProductCsv(products);
    const lines = csv.split('\n');
    // 1 header + 1 product row
    expect(lines).toHaveLength(2);
  });

  it('handles null/undefined optional fields gracefully', () => {
    const products = [
      {
        stockCode: 'SC001',
        saleCode: null,
        name: 'Minimal Product',
        description: null,
        category: null,
        variants: [
          { sku: 'SKU-A', attributes: {}, price: '1.00', costPrice: null, quantity: 0, lowStockAt: null },
        ],
      },
    ];

    expect(() => generateProductCsv(products)).not.toThrow();
    const csv = generateProductCsv(products);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
  });
});
