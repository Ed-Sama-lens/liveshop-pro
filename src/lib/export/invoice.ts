/**
 * Generate a print-ready HTML invoice for an order.
 */

export interface InvoiceItem {
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly totalPrice: string;
}

export interface InvoiceData {
  readonly orderNumber: string;
  readonly orderDate: string;
  readonly shopName: string;
  readonly customerName: string;
  readonly customerPhone: string | null;
  readonly customerEmail: string | null;
  readonly customerAddress: string | null;
  readonly items: readonly InvoiceItem[];
  readonly subtotal: string;
  readonly shippingFee: string;
  readonly total: string;
  readonly status: string;
  readonly paymentMethod: string | null;
  readonly paymentStatus: string | null;
}

export function generateInvoiceHtml(data: InvoiceData): string {
  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${item.name}<br><span style="font-size:11px;color:#6b7280">${item.sku}</span></td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">฿${Number(item.unitPrice).toLocaleString()}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">฿${Number(item.totalPrice).toLocaleString()}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${data.orderNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .shop-name { font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .invoice-title { font-size: 28px; font-weight: 700; color: #6b7280; text-align: right; }
    .invoice-meta { text-align: right; font-size: 13px; color: #6b7280; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 8px; }
    .customer-info { font-size: 14px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #1a1a2e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 4px 8px; font-size: 14px; }
    .totals .total-row td { border-top: 2px solid #1a1a2e; font-size: 18px; font-weight: 700; padding-top: 8px; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .footer { margin-top: 48px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #1a1a2e; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    .print-btn:hover { background: #2d2d4e; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print Invoice</button>

  <div class="header">
    <div>
      <div class="shop-name">${data.shopName}</div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <strong>${data.orderNumber}</strong><br>
        ${data.orderDate}<br>
        <span class="status-badge" style="background:#dbeafe;color:#1e40af">${data.status}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Bill To</div>
    <div class="customer-info">
      <strong>${data.customerName}</strong><br>
      ${data.customerPhone ? `${data.customerPhone}<br>` : ''}
      ${data.customerEmail ? `${data.customerEmail}<br>` : ''}
      ${data.customerAddress ?? ''}
    </div>
  </div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </div>

  <table class="totals">
    <tr>
      <td>Subtotal</td>
      <td style="text-align:right;font-family:monospace">฿${Number(data.subtotal).toLocaleString()}</td>
    </tr>
    <tr>
      <td>Shipping</td>
      <td style="text-align:right;font-family:monospace">฿${Number(data.shippingFee).toLocaleString()}</td>
    </tr>
    <tr class="total-row">
      <td>Total</td>
      <td style="text-align:right;font-family:monospace">฿${Number(data.total).toLocaleString()}</td>
    </tr>
  </table>

  ${data.paymentMethod ? `
  <div class="section">
    <div class="section-title">Payment</div>
    <p style="font-size:14px">Method: ${data.paymentMethod} &nbsp; Status: ${data.paymentStatus ?? 'Pending'}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>${data.shopName} — Powered by LiveShop Pro</p>
    <p>Thank you for your business!</p>
  </div>
</body>
</html>`;
}
