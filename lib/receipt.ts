'use client';

import type { Order } from '@/lib/types';

/**
 * Thermal receipt printing (58mm/80mm) via the browser print pipeline.
 *
 * Browser/OS limitation (intentional honesty): a normal web page cannot talk to
 * a USB/Bluetooth printer directly. The receipt is rendered as a dedicated
 * print document and the OS print dialog lets the operator pick the thermal
 * printer driver (most 58/80mm drivers appear as narrow paper sizes). ESC/POS
 * raw printing would require a native agent or a networked ESC/POS server,
 * which this environment does not have.
 */

const ESCAPE = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toLocaleString('ar-MA')
    : date.toLocaleString('ar-MA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function buildReceiptHtml(order: Order): string {
  const rows = order.items
    .map((item) => {
      const lineTotal = item.price !== undefined ? (item.price * item.quantity).toFixed(2) : null;
      return `<tr>
        <td class="qty">${item.quantity}×</td>
        <td class="name">${ESCAPE(item.name)}</td>
        <td class="price">${lineTotal !== null ? lineTotal : ''}</td>
      </tr>`;
    })
    .join('');

  const notes = order.notes
    ? `<div class="notes"><div class="notes-title">ملاحظات:</div>${ESCAPE(order.notes)}</div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>إيصال طاولة ${ESCAPE(String(order.table_number))} - #${ESCAPE(order.id.slice(0, 5))}</title>
<style>
  /* Thermal receipt: narrow roll, auto height, tiny margins. Works for both
     58mm and 80mm printers — the driver scales the page to the paper width. */
  @page { size: 80mm auto; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 76mm;
    font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  h1 { font-size: 16px; letter-spacing: 0.5px; }
  .sub { font-size: 11px; margin-top: 1mm; }
  .divider { border-top: 1px dashed #000; margin: 2mm 0; }
  .meta { font-size: 12px; line-height: 1.7; }
  .meta b { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 1mm 0; vertical-align: top; }
  td.qty { width: 10mm; white-space: nowrap; font-weight: bold; }
  td.name { }
  td.price { width: 16mm; text-align: left; white-space: nowrap; }
  .total-row td { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 1.5mm; }
  .notes { margin-top: 2mm; font-size: 12px; background: #eee; padding: 1.5mm; }
  .notes-title { font-weight: bold; margin-bottom: 0.5mm; }
  .footer { margin-top: 3mm; font-size: 10px; text-align: center; }
  @media print { html, body { width: auto; } }
</style>
</head>
<body>
  <div class="center">
    <h1>مطعم قا أحمد</h1>
    <div class="sub">Elkahmed Restaurant</div>
  </div>
  <div class="divider"></div>
  <div class="meta">
    <div><b>طاولة ${ESCAPE(String(order.table_number))}</b></div>
    <div>طلب #${ESCAPE(order.id.slice(0, 5))}</div>
    <div>${ESCAPE(time(order.created_at))}</div>
  </div>
  <div class="divider"></div>
  <table>
    ${rows || '<tr><td class="name">لا توجد عناصر مسجلة</td></tr>'}
    <tr class="total-row">
      <td class="qty"></td>
      <td class="name">الإجمالي</td>
      <td class="price">${order.total_amount.toFixed(2)} د.م</td>
    </tr>
  </table>
  ${notes}
  <div class="divider"></div>
  <div class="footer">شكراً لكم — بالعافية والراحة</div>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;
}

export function printReceipt(order: Order) {
  const html = buildReceiptHtml(order);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '-100vw';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  // Give the frame a beat to layout, then print and clean up.
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 250);
}
