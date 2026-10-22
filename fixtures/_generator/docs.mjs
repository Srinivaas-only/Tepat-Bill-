// Synthetic demo documents (fake businesses, fake numbers). Every row the AI should read carries data-line="<index>".
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Kalam:wght@400;700&family=DM+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=block" rel="stylesheet">`;
const page = (body, css) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{box-sizing:border-box;margin:0;padding:0} body{background:#fff}
${css}</style></head><body>${body}</body></html>`;

// ---------- 1. Owner's handwritten notebook order (PO) ----------
const poNotebook = {
  file: 'po_notebook_borong_ali', width: 820, height: 1000,
  html: page(`<div id="doc"><div class="paper">
    <div class="hd">Order — Borong Ali</div><div class="dt">18/10/26</div>
    <div class="row" data-line="0"><span>Maggi kari</span><span>10 ctn</span></div>
    <div class="row" data-line="1"><span>Beras Rambutan 10kg</span><span>5 beg</span></div>
    <div class="row" data-line="2"><span>Minyak masak Buruh 5kg</span><span>6 btl</span></div>
    <div class="row" data-line="3"><span>Gula pasir 1kg</span><span>50 pek</span></div>
    <div class="note">hantar Isnin pagi ✓</div>
  </div></div>`, `
  #doc{width:820px;height:1000px;background:#8a7a66;padding:60px 70px}
  .paper{width:100%;height:100%;background:repeating-linear-gradient(#fdfcf6 0 43px,#b9d3ea 43px 44px);border-left:3px solid #e8a3a3;
    transform:rotate(-1.6deg);box-shadow:0 12px 30px rgba(0,0,0,.35);padding:40px 46px;font-family:Caveat,cursive;color:#1d2b6b}
  .hd{font-size:46px;font-weight:700;line-height:88px} .dt{font-size:32px;text-align:right;margin-top:-70px;margin-bottom:24px}
  .row{display:flex;justify-content:space-between;font-size:40px;line-height:88px;padding-right:20px}
  .note{font-size:32px;line-height:88px;color:#3b4aa8;transform:rotate(-2deg)}`),
  expected: { docType: 'purchase_order', supplierName: 'Borong Ali', docDate: '2026-10-18', lines: [
    { description: 'Maggi kari', qty: 10, unit: 'ctn' },
    { description: 'Beras Rambutan 10kg', qty: 5, unit: 'beg' },
    { description: 'Minyak masak Buruh 5kg', qty: 6, unit: 'btl' },
    { description: 'Gula pasir 1kg', qty: 50, unit: 'pek' }] },
};

// ---------- 2. Supplier printed invoice (demo: short 2 ctn Maggi = RM90; Gula +RM0.40 x 50 = RM20) ----------
const invRows = [
  ['MAGGI KARI 5\'S (CTN 8 PEK)', 10, 'CTN', '45.00', '450.00'],
  ['BERAS CAP RAMBUTAN 10KG', 5, 'BAG', '38.50', '192.50'],
  ['MINYAK MASAK BURUH 5KG', 6, 'BTL', '31.90', '191.40'],
  ['GULA PASIR 1KG', 50, 'PKT', '3.20', '160.00'],
];
const invoiceA = {
  file: 'invoice_borong_ali_INV-2291', width: 900, height: 1180,
  html: page(`<div id="doc">
    <div class="top"><div><div class="co">SYARIKAT BORONG ALI SDN. BHD.</div>
      <div class="sm">(1234567-X) · Lot 8, Jalan Kampar, 30250 Ipoh, Perak · Tel 05-254 7788</div></div>
      <div class="ttl">INVOIS<br><span>INVOICE</span></div></div>
    <div class="meta"><div><b>Kepada / Bill to</b><br>KEDAI RUNCIT MAJU<br>No. 12, Jalan Bendahara, 30200 Ipoh</div>
      <div><b>No. Invois:</b> INV-2291<br><b>Tarikh:</b> 20/10/2026<br><b>Terma:</b> 90 hari<br><b>Ruj:</b> Order 18/10</div></div>
    <table><thead><tr><th>#</th><th>Perkara / Description</th><th>Kuantiti</th><th>Unit</th><th>Harga (RM)</th><th>Jumlah (RM)</th></tr></thead><tbody>
    ${invRows.map((r, i) => `<tr data-line="${i}"><td>${i + 1}</td><td>${r[0]}</td><td class="n">${r[1]}</td><td>${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td></tr>`).join('')}
    </tbody></table>
    <div class="tot"><div>JUMLAH / TOTAL &nbsp; RM 993.90</div></div>
    <div class="foot">Barang yang telah dijual tidak boleh dipulangkan tanpa kebenaran. Cek atas nama SYARIKAT BORONG ALI SDN. BHD.</div>
    <div class="sig">______________________<br>Tandatangan Pelanggan</div>
  </div>`, `
  #doc{width:900px;height:1180px;padding:56px 60px;font-family:'DM Sans',sans-serif;color:#1b1b1b;background:#fff}
  .top{display:flex;justify-content:space-between;border-bottom:3px solid #1f4fa8;padding-bottom:18px}
  .co{font-size:26px;font-weight:700;color:#1f4fa8}.sm{font-size:13px;color:#555;margin-top:6px}
  .ttl{font-size:30px;font-weight:700;text-align:right;line-height:1}.ttl span{font-size:16px;color:#777;letter-spacing:3px}
  .meta{display:flex;justify-content:space-between;margin:26px 0;font-size:15px;line-height:1.6}
  table{width:100%;border-collapse:collapse;font-size:15px} th{background:#eef2fb;text-align:left;padding:10px;font-size:13px}
  td{padding:14px 10px;border-bottom:1px solid #ddd} .n{text-align:right;font-family:'IBM Plex Mono',monospace}
  .tot{display:flex;justify-content:flex-end;margin-top:22px}.tot div{font-weight:700;font-size:20px;border-top:2px solid #111;padding-top:10px}
  .foot{margin-top:60px;font-size:12px;color:#666}.sig{margin-top:70px;font-size:13px;color:#444}`),
  expected: { docType: 'invoice', supplierName: 'Syarikat Borong Ali Sdn. Bhd.', docNo: 'INV-2291', docDate: '2026-10-20',
    currency: 'MYR', supplierCountry: 'MY', totalAmount: '993.90',
    lines: invRows.map(r => ({ description: r[0], qty: r[1], unit: r[2], unitPrice: r[3], lineTotal: r[4] })) },
};

// ---------- 3. Signed delivery order (bon) with the owner's handwritten received count ----------
const bon = {
  file: 'bon_signed_DO-5512', width: 860, height: 980,
  html: page(`<div id="doc"><div class="slip">
    <div class="co">SYARIKAT BORONG ALI SDN. BHD.</div><div class="t">DELIVERY ORDER &nbsp; No. DO-5512</div>
    <div class="m">Kepada: Kedai Runcit Maju &nbsp;·&nbsp; Tarikh: 20/10/2026 &nbsp;·&nbsp; Ruj Invois: INV-2291</div>
    <table><tr><th>Perkara</th><th>Kuantiti</th></tr>
    ${invRows.map((r, i) => `<tr data-line="${i}"><td>${r[0]}</td><td>${r[1]} ${r[2]}${i === 0 ? '<span class="pen">8 terima sahaja</span>' : ''}</td></tr>`).join('')}
    </table>
    <div class="recv">Diterima dalam keadaan baik:<span class="pen sign">Rahman &nbsp; 20/10/26</span></div>
  </div></div>`, `
  #doc{width:860px;height:980px;background:#cfc6b8;padding:50px}
  .slip{background:#fffbe9;height:100%;padding:40px;transform:rotate(1.2deg);box-shadow:0 10px 26px rgba(0,0,0,.3);font-family:'IBM Plex Mono',monospace;color:#222}
  .co{font-weight:600;font-size:20px}.t{font-size:22px;font-weight:600;margin:10px 0}.m{font-size:13px;margin-bottom:26px}
  table{width:100%;border-collapse:collapse;font-size:16px}th{text-align:left;border-bottom:2px solid #222;padding:8px}
  td{padding:18px 8px;border-bottom:1px dashed #999;position:relative}
  .pen{font-family:Kalam,cursive;color:#1238b8;font-size:26px;margin-left:24px;transform:rotate(-4deg);display:inline-block}
  .recv{margin-top:70px;font-size:15px}.sign{font-size:34px;margin-left:16px}`),
  expected: { docType: 'delivery_note', supplierName: 'Syarikat Borong Ali Sdn. Bhd.', docNo: 'DO-5512', docDate: '2026-10-20',
    lines: invRows.map(r => ({ description: r[0], qty: r[1], unit: r[2] })) },
};

// ---------- 4. WhatsApp order screenshot (PO for the bakery) ----------
const waOrder = {
  file: 'po_whatsapp_kilang_roti_sinar', width: 430, height: 820,
  html: page(`<div id="doc">
    <div class="bar"><div class="av">KR</div><div><b>Kilang Roti Sinar</b><br><span>online</span></div></div>
    <div class="chat">
      <div class="day">19 Oktober 2026</div>
      <div class="me"><div>Salam Sinar, nak order utk Selasa ya</div>
        <div data-line="0">Roti putih besar 20</div>
        <div data-line="1">Roti kaya 10</div>
        <div>TQ 🙏</div><span class="tm">9:41 PM ✓✓</span></div>
      <div class="them">Ok boss, Selasa pagi sampai 👍<span class="tm">9:52 PM</span></div>
    </div></div>`, `
  #doc{width:430px;height:820px;background:#efeae2;font-family:'DM Sans',sans-serif}
  .bar{background:#075e54;color:#fff;display:flex;gap:12px;align-items:center;padding:14px 16px;font-size:16px}.bar span{font-size:12px;opacity:.8}
  .av{width:40px;height:40px;border-radius:50%;background:#cfe9e4;color:#075e54;display:grid;place-items:center;font-weight:700}
  .chat{padding:16px;display:flex;flex-direction:column;gap:10px}.day{align-self:center;background:#e1f2fb;font-size:12px;padding:4px 10px;border-radius:8px}
  .me,.them{max-width:78%;padding:10px 12px;border-radius:10px;font-size:16px;line-height:1.5;box-shadow:0 1px 1px rgba(0,0,0,.12)}
  .me{align-self:flex-end;background:#d9fdd3}.them{align-self:flex-start;background:#fff}.tm{display:block;text-align:right;font-size:11px;color:#667}`),
  expected: { docType: 'purchase_order', supplierName: 'Kilang Roti Sinar', docDate: '2026-10-19', lines: [
    { description: 'Roti putih besar', qty: 20 }, { description: 'Roti kaya', qty: 10 }] },
};

// ---------- 5. Handwritten cash bill (substitution: kaya ordered, mentega jagung delivered) ----------
const cashBill = {
  file: 'invoice_kilang_roti_sinar_0118', width: 700, height: 900,
  html: page(`<div id="doc"><div class="bill">
    <div class="co">KILANG ROTI SINAR</div><div class="ad">No. 3, Jln Pasir Puteh, Ipoh · 016-552 0198</div>
    <div class="t">BIL TUNAI / CASH BILL <span class="no">No. 0118</span></div>
    <div class="mt">Tarikh: <span class="h">21/10/26</span> &nbsp; Kepada: <span class="h">Kedai Runcit Maju</span></div>
    <table><tr><th>Kuantiti</th><th>Butir-butir</th><th>Harga</th><th>RM</th></tr>
      <tr data-line="0"><td class="h">20</td><td class="h">Roti putih besar</td><td class="h">1.90</td><td class="h">38.00</td></tr>
      <tr data-line="1"><td class="h">10</td><td class="h">Roti mentega jagung</td><td class="h">2.10</td><td class="h">21.00</td></tr>
      <tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr>
      <tr><td colspan="3" class="r">JUMLAH RM</td><td class="h b">59.00</td></tr></table>
  </div></div>`, `
  #doc{width:700px;height:900px;background:#9aa3a8;padding:40px}
  .bill{background:#fbf3f6;height:100%;padding:32px;transform:rotate(-0.8deg);box-shadow:0 10px 24px rgba(0,0,0,.3);font-family:'DM Sans',sans-serif;color:#7a1f3d}
  .co{font-size:28px;font-weight:700;text-align:center}.ad{text-align:center;font-size:12px}.t{text-align:center;margin:14px 0;font-weight:700}
  .no{color:#c0392b;margin-left:10px}.mt{font-size:14px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}th,td{border:1.5px solid #c78aa0;padding:14px 8px;font-size:14px;height:58px}.r{text-align:right;font-weight:700}
  .h{font-family:Kalam,cursive;color:#14317a;font-size:24px}.b{font-weight:700}`),
  expected: { docType: 'invoice', supplierName: 'Kilang Roti Sinar', docNo: '0118', docDate: '2026-10-21', currency: 'MYR', totalAmount: '59.00',
    lines: [{ description: 'Roti putih besar', qty: 20, unitPrice: '1.90', lineTotal: '38.00' },
            { description: 'Roti mentega jagung', qty: 10, unitPrice: '2.10', lineTotal: '21.00' }] },
};

// ---------- 6. Foreign supplier commercial invoice (USD) -> self-billed e-invoice preview ----------
const fRows = [['Roasted Seaweed Snack 24x10g', 20, 'CTN', '18.50', '370.00'], ['Dried Shiitake Mushroom 500g', 10, 'CTN', '24.00', '240.00']];
const foreign = {
  file: 'invoice_foreign_GZ-2026-088', width: 900, height: 1000,
  html: page(`<div id="doc">
    <div class="co">GUANGZHOU HENGDA SNACKS TRADING CO., LTD.</div>
    <div class="ad">Room 1208, Tianhe Road 88, Guangzhou, Guangdong, China · +86 20 3888 1234</div>
    <h1>COMMERCIAL INVOICE</h1>
    <div class="meta"><div><b>Invoice No:</b> GZ-2026-088<br><b>Date:</b> 2026-10-15<br><b>Currency:</b> USD<br><b>Incoterm:</b> CIF Port Klang</div>
      <div><b>Buyer:</b><br>KEDAI RUNCIT MAJU<br>No. 12, Jalan Bendahara<br>30200 Ipoh, Perak, MALAYSIA</div></div>
    <table><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price (USD)</th><th>Amount (USD)</th></tr>
    ${fRows.map((r, i) => `<tr data-line="${i}"><td>${r[0]}</td><td class="n">${r[1]}</td><td>${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td></tr>`).join('')}
    <tr><td colspan="4" class="r">TOTAL USD</td><td class="n b">610.00</td></tr></table>
    <div class="foot">Country of origin: China · HS 2008.99 / 0712.39 · Payment: T/T 30 days</div>
  </div>`, `
  #doc{width:900px;height:1000px;padding:56px;font-family:'DM Sans',sans-serif;background:#fff;color:#222}
  .co{font-size:22px;font-weight:700;color:#a11}.ad{font-size:12px;color:#555;margin-top:4px}h1{font-size:28px;margin:30px 0 18px;letter-spacing:2px}
  .meta{display:flex;justify-content:space-between;font-size:14px;line-height:1.7;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:15px}th{background:#f3e9e9;text-align:left;padding:10px}td{padding:14px 10px;border-bottom:1px solid #ddd}
  .n{text-align:right;font-family:'IBM Plex Mono',monospace}.r{text-align:right;font-weight:700}.b{font-weight:700}.foot{margin-top:40px;font-size:12px;color:#666}`),
  expected: { docType: 'invoice', supplierName: 'Guangzhou Hengda Snacks Trading Co., Ltd.', docNo: 'GZ-2026-088', docDate: '2026-10-15',
    currency: 'USD', supplierCountry: 'CN', totalAmount: '610.00',
    lines: fRows.map(r => ({ description: r[0], qty: r[1], unit: r[2], unitPrice: r[3], lineTotal: r[4] })) },
};

// ---------- 7. Delivery photo (evidence only; never read for counts) ----------
const boxes = Array.from({ length: 8 }, (_, i) => `<div class="box" style="left:${80 + (i % 4) * 150}px;top:${i < 4 ? 330 : 190}px">MAGGI<br><small>KARI · CTN</small></div>`).join('');
const delivery = {
  file: 'delivery_photo_INV-2291', width: 760, height: 620,
  html: page(`<div id="doc"><div class="floor"></div>${boxes}<div class="tag">20/10/2026 10:14</div></div>`, `
  #doc{width:760px;height:620px;position:relative;background:linear-gradient(#d9d2c3 0 55%,#9c8f7a 55%);overflow:hidden;font-family:'DM Sans',sans-serif}
  .box{position:absolute;width:140px;height:140px;background:linear-gradient(135deg,#c79a5b,#a8773b);border:2px solid #7d5629;color:#7a1010;font-weight:700;
    display:grid;place-items:center;text-align:center;font-size:20px;box-shadow:6px 8px 0 rgba(0,0,0,.25)}
  .box small{font-size:11px;color:#3b2a14}.tag{position:absolute;right:14px;bottom:10px;color:#ffd84d;font-family:'IBM Plex Mono',monospace;font-size:16px}`),
  expected: null,
};

export const DOCS = [poNotebook, invoiceA, bon, waOrder, cashBill, foreign, delivery].map(d => ({
  ...d, expected: d.expected ?? { docType: 'other', supplierName: '', lines: [] },
}));
