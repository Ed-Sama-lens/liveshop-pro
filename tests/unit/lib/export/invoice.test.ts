import { describe, it, expect } from 'vitest';
import { generateInvoiceHtml, type InvoiceData } from '@/lib/export/invoice';

function makeInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    orderNumber: 'ORD-001',
    orderDate: '2026-01-15',
    shopName: 'Test Shop',
    customerName: 'Alice',
    customerPhone: '0812345678',
    customerEmail: 'alice@example.com',
    customerAddress: '123 Main St',
    items: [
      { name: 'Widget', sku: 'WDG-001', quantity: 2, unitPrice: '100', totalPrice: '200' },
    ],
    subtotal: '200',
    shippingFee: '50',
    total: '250',
    status: 'CONFIRMED',
    paymentMethod: 'TRANSFER',
    paymentStatus: 'VERIFIED',
    ...overrides,
  };
}

describe('generateInvoiceHtml', () => {
  it('returns valid HTML document', () => {
    const html = generateInvoiceHtml(makeInvoice());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes shop name in header', () => {
    const html = generateInvoiceHtml(makeInvoice({ shopName: 'Nazha Shop' }));
    expect(html).toContain('Nazha Shop');
  });

  it('includes order number', () => {
    const html = generateInvoiceHtml(makeInvoice({ orderNumber: 'ORD-999' }));
    expect(html).toContain('ORD-999');
  });

  it('includes customer details', () => {
    const html = generateInvoiceHtml(makeInvoice({
      customerName: 'Bob',
      customerPhone: '099',
      customerEmail: 'bob@test.com',
    }));
    expect(html).toContain('Bob');
    expect(html).toContain('099');
    expect(html).toContain('bob@test.com');
  });

  it('omits phone and email when null', () => {
    const html = generateInvoiceHtml(makeInvoice({
      customerPhone: null,
      customerEmail: null,
    }));
    expect(html).not.toContain('null');
  });

  it('includes item rows', () => {
    const html = generateInvoiceHtml(makeInvoice({
      items: [
        { name: 'Shirt', sku: 'SH-01', quantity: 3, unitPrice: '500', totalPrice: '1500' },
        { name: 'Pants', sku: 'PN-01', quantity: 1, unitPrice: '800', totalPrice: '800' },
      ],
    }));
    expect(html).toContain('Shirt');
    expect(html).toContain('SH-01');
    expect(html).toContain('Pants');
    expect(html).toContain('PN-01');
  });

  it('includes total amounts', () => {
    const html = generateInvoiceHtml(makeInvoice({
      subtotal: '1000',
      shippingFee: '100',
      total: '1100',
    }));
    expect(html).toContain('Subtotal');
    expect(html).toContain('Shipping');
    expect(html).toContain('Total');
  });

  it('includes payment section when paymentMethod is present', () => {
    const html = generateInvoiceHtml(makeInvoice({ paymentMethod: 'QR_CODE', paymentStatus: 'PENDING' }));
    expect(html).toContain('QR_CODE');
    expect(html).toContain('PENDING');
  });

  it('omits payment section when paymentMethod is null', () => {
    const html = generateInvoiceHtml(makeInvoice({ paymentMethod: null }));
    expect(html).not.toContain('Method:');
  });

  it('includes print button', () => {
    const html = generateInvoiceHtml(makeInvoice());
    expect(html).toContain('Print Invoice');
    expect(html).toContain('window.print()');
  });

  it('includes status badge', () => {
    const html = generateInvoiceHtml(makeInvoice({ status: 'SHIPPED' }));
    expect(html).toContain('SHIPPED');
  });

  it('handles address with null gracefully', () => {
    const html = generateInvoiceHtml(makeInvoice({
      customerAddress: null,
    }));
    expect(html).not.toContain('null');
    expect(html).toContain('Bill To');
  });
});
