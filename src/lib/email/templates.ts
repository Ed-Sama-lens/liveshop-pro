// ─── Email Templates ─────────────────────────────────────────────────────────
// Simple HTML templates for transactional emails.
// No external template engine — keep it lean and dependency-free.

interface OrderConfirmationData {
  readonly customerName: string;
  readonly orderNumber: string;
  readonly items: readonly {
    readonly name: string;
    readonly quantity: number;
    readonly price: string;
  }[];
  readonly totalAmount: string;
  readonly shopName: string;
}

interface ShippingUpdateData {
  readonly customerName: string;
  readonly orderNumber: string;
  readonly trackingNumber: string | null;
  readonly provider: string;
  readonly status: string;
  readonly shopName: string;
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; }
    .footer { background: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: 0; }
    .item-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .total { font-size: 18px; font-weight: bold; color: #1a1a2e; padding-top: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-info { background: #dbeafe; color: #1e40af; }
    .badge-success { background: #dcfce7; color: #166534; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}

export function orderConfirmationEmail(data: OrderConfirmationData): {
  subject: string;
  html: string;
  text: string;
} {
  const itemRows = data.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${item.name}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center">${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">฿${Number(item.price).toLocaleString()}</td></tr>`
    )
    .join('');

  const html = baseLayout(`
    <div class="header">
      <h1 style="margin:0;font-size:20px">${data.shopName}</h1>
    </div>
    <div class="content">
      <h2 style="margin-top:0">Order Confirmation</h2>
      <p>Hi ${data.customerName},</p>
      <p>Thank you for your order! Here's your order summary:</p>
      <p><strong>Order #:</strong> ${data.orderNumber}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead>
          <tr style="border-bottom:2px solid #e5e7eb">
            <th style="text-align:left;padding:8px 0">Item</th>
            <th style="text-align:center;padding:8px 0">Qty</th>
            <th style="text-align:right;padding:8px 0">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      <p class="total">Total: ฿${Number(data.totalAmount).toLocaleString()}</p>
      <p style="margin-top:20px;color:#6b7280">We'll notify you when your order ships.</p>
    </div>
    <div class="footer">
      <p>${data.shopName} — Powered by LiveShop Pro</p>
    </div>
  `);

  const text = `Order Confirmation - ${data.orderNumber}\n\nHi ${data.customerName},\n\nThank you for your order!\n\n${data.items.map((i) => `${i.name} x${i.quantity} — ฿${Number(i.price).toLocaleString()}`).join('\n')}\n\nTotal: ฿${Number(data.totalAmount).toLocaleString()}\n\n— ${data.shopName}`;

  return {
    subject: `Order Confirmed — ${data.orderNumber} | ${data.shopName}`,
    html,
    text,
  };
}

export function shippingUpdateEmail(data: ShippingUpdateData): {
  subject: string;
  html: string;
  text: string;
} {
  const statusBadge =
    data.status === 'DELIVERED'
      ? '<span class="badge badge-success">Delivered</span>'
      : `<span class="badge badge-info">${data.status}</span>`;

  const trackingInfo = data.trackingNumber
    ? `<p><strong>Tracking #:</strong> ${data.trackingNumber}</p><p><strong>Provider:</strong> ${data.provider}</p>`
    : `<p><strong>Provider:</strong> ${data.provider}</p>`;

  const html = baseLayout(`
    <div class="header">
      <h1 style="margin:0;font-size:20px">${data.shopName}</h1>
    </div>
    <div class="content">
      <h2 style="margin-top:0">Shipping Update</h2>
      <p>Hi ${data.customerName},</p>
      <p>Your order <strong>${data.orderNumber}</strong> has a shipping update:</p>
      <div style="margin:16px 0">${statusBadge}</div>
      ${trackingInfo}
      ${data.status === 'DELIVERED' ? '<p style="color:#166534;font-weight:600">Your order has been delivered! Thank you for shopping with us.</p>' : '<p style="color:#6b7280">We\'ll keep you updated on the delivery progress.</p>'}
    </div>
    <div class="footer">
      <p>${data.shopName} — Powered by LiveShop Pro</p>
    </div>
  `);

  const text = `Shipping Update — ${data.orderNumber}\n\nHi ${data.customerName},\n\nStatus: ${data.status}\nProvider: ${data.provider}${data.trackingNumber ? `\nTracking #: ${data.trackingNumber}` : ''}\n\n— ${data.shopName}`;

  return {
    subject: `Shipping Update — ${data.orderNumber} | ${data.shopName}`,
    html,
    text,
  };
}
