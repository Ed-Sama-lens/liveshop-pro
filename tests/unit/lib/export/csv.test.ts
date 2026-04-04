import { describe, it, expect } from 'vitest';
import { buildCsv } from '@/lib/export/csv';

describe('buildCsv', () => {
  it('builds CSV with header and rows', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const columns = [
      { key: 'name' as const, header: 'Name' },
      { key: 'age' as const, header: 'Age' },
    ];
    const csv = buildCsv(rows, columns);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toBe('Name,Age');
    expect(lines[1]).toBe('Alice,30');
    expect(lines[2]).toBe('Bob,25');
  });

  it('starts with BOM for Excel compatibility', () => {
    const csv = buildCsv([], [{ key: 'x' as const, header: 'X' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes fields with commas', () => {
    const rows = [{ name: 'Smith, John' }];
    const columns = [{ key: 'name' as const, header: 'Name' }];
    const csv = buildCsv(rows, columns);
    expect(csv).toContain('"Smith, John"');
  });

  it('escapes fields with double quotes', () => {
    const rows = [{ desc: 'He said "hello"' }];
    const columns = [{ key: 'desc' as const, header: 'Description' }];
    const csv = buildCsv(rows, columns);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('escapes fields with newlines', () => {
    const rows = [{ addr: 'Line 1\nLine 2' }];
    const columns = [{ key: 'addr' as const, header: 'Address' }];
    const csv = buildCsv(rows, columns);
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it('handles null and undefined values as empty', () => {
    const rows = [{ a: null, b: undefined }];
    const columns = [
      { key: 'a' as const, header: 'A' },
      { key: 'b' as const, header: 'B' },
    ];
    const csv = buildCsv(rows as any, columns);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[1]).toBe(',');
  });

  it('handles empty rows array', () => {
    const csv = buildCsv([], [{ key: 'x' as const, header: 'X' }]);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('X');
  });

  it('handles multiple columns correctly', () => {
    const rows = [{ a: '1', b: '2', c: '3' }];
    const columns = [
      { key: 'a' as const, header: 'A' },
      { key: 'b' as const, header: 'B' },
      { key: 'c' as const, header: 'C' },
    ];
    const csv = buildCsv(rows, columns);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toBe('A,B,C');
    expect(lines[1]).toBe('1,2,3');
  });
});
