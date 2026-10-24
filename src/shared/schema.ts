// Drizzle schema. Money = integer sen. Quantities = integer. Times = timestamptz.
import { pgTable, text, integer, boolean, timestamp, jsonb, primaryKey, serial, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  whatsapp: text('whatsapp'),
  isForeign: boolean('is_foreign').notNull().default(false),
  country: text('country'),
  policyNote: text('policy_note'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // po | invoice | delivery_note | photo
  photoKind: text('photo_kind'), // invoice | po | signed_bon | delivery
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  sha256: text('sha256').notNull(),
  width: integer('width'),
  height: integer('height'),
  pageCount: integer('page_count'),
  invoiceId: text('invoice_id'),
  deliveryId: text('delivery_id'),
  uploadedByRole: text('uploaded_by_role').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const extractions = pgTable('extractions', {
  sha256: text('sha256').primaryKey(),
  model: text('model').notNull(), // gemini-3.8-flash | gemini-3.5-flash-lite | fixture | manual
  doc: jsonb('doc').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  poNo: text('po_no').notNull().unique(),
  supplierId: text('supplier_id').notNull(),
  documentId: text('document_id'),
  source: text('source').notNull(), // notebook | whatsapp | typed
  orderedAt: ts('ordered_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export type Box = [number, number, number, number];

export const poLines = pgTable('po_lines', {
  id: text('id').primaryKey(),
  poId: text('po_id').notNull(),
  sku: text('sku').notNull(),
  description: text('description').notNull(),
  orderedQty: integer('ordered_qty').notNull(),
  unit: text('unit'),
  unitPriceSen: integer('unit_price_sen'),
  box: jsonb('box').$type<Box | null>(),
  position: integer('position').notNull(),
});

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNo: text('invoice_no').notNull(),
  supplierId: text('supplier_id').notNull(),
  poId: text('po_id'),
  documentId: text('document_id'),
  docDate: text('doc_date'), // printed date, YYYY-MM-DD
  currency: text('currency').notNull().default('MYR'),
  exchangeRateBp: integer('exchange_rate_bp'), // 4.20 = 42000
  totalForeignMinor: integer('total_foreign_minor'),
  totalSen: integer('total_sen').notNull(),
  issuedAt: ts('issued_at').notNull(), // time recorded in app
  payment: text('payment').notNull().default('on_credit'),
  paidAt: ts('paid_at'),
  dueAt: ts('due_at').notNull(),
  ownerMarkedCorrect: boolean('owner_marked_correct').notNull().default(false),
  extractionModel: text('extraction_model'),
  priceListSnapshot: jsonb('price_list_snapshot').$type<Record<string, { lastInvoiceSen?: number; agreedSen?: number }> | null>(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('invoices_supplier_no_uq').on(t.supplierId, sql`lower(${t.invoiceNo})`)]);

export const invoiceLines = pgTable('invoice_lines', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  lineId: text('line_id').notNull(),
  sku: text('sku'),
  description: text('description').notNull(),
  qty: integer('qty').notNull(),
  unit: text('unit'),
  unitPriceSen: integer('unit_price_sen').notNull(),
  unitPriceForeignMinor: integer('unit_price_foreign_minor'),
  lineTotalSen: integer('line_total_sen'),
  box: jsonb('box').$type<Box | null>(),
  position: integer('position').notNull(),
});

export const receivedCounts = pgTable('received_counts', {
  invoiceId: text('invoice_id').notNull(),
  key: text('key').notNull(),
  qty: integer('qty').notNull(),
  // staff = counted/confirmed by a person, delivery = taken from the linked delivery, default = untouched billed-qty placeholder (NOT verified receipt)
  source: text('source').notNull().default('staff'),
  recordedByRole: text('recorded_by_role').notNull(),
  recordedAt: ts('recorded_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.invoiceId, t.key] })]);

export const deliveries = pgTable('deliveries', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').notNull(),
  poId: text('po_id'),
  documentId: text('document_id'),
  doNo: text('do_no').notNull(),
  docDate: text('doc_date'),
  receivedAt: ts('received_at').notNull(),
  ownerMarkedCorrect: boolean('owner_marked_correct').notNull().default(false),
  invoiceId: text('invoice_id').unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('deliveries_supplier_no_uq').on(t.supplierId, sql`lower(${t.doNo})`)]);

export const deliveryLines = pgTable('delivery_lines', {
  id: text('id').primaryKey(),
  deliveryId: text('delivery_id').notNull(),
  lineId: text('line_id').notNull(),
  sku: text('sku'),
  description: text('description').notNull(),
  qty: integer('qty').notNull(),
  unit: text('unit'),
  box: jsonb('box').$type<Box | null>(),
  position: integer('position').notNull(),
});

export const deliveryCounts = pgTable('delivery_counts', {
  deliveryId: text('delivery_id').notNull(),
  key: text('key').notNull(),
  qty: integer('qty').notNull(),
  recordedByRole: text('recorded_by_role').notNull(),
  recordedAt: ts('recorded_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.deliveryId, t.key] })]);

export const priceList = pgTable('price_list', {
  supplierId: text('supplier_id').notNull(),
  sku: text('sku').notNull(),
  lastInvoiceSen: integer('last_invoice_sen'),
  agreedSen: integer('agreed_sen'),
}, t => [primaryKey({ columns: [t.supplierId, t.sku] })]);

export const aliases = pgTable('aliases', {
  supplierId: text('supplier_id').notNull(),
  normalisedDesc: text('normalised_desc').notNull(),
  sku: text('sku').notNull(),
}, t => [primaryKey({ columns: [t.supplierId, t.normalisedDesc] })]);

export const flags = pgTable('flags', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').notNull(),
  invoiceId: text('invoice_id'),
  stage: text('stage').notNull().default('invoice'), // invoice | delivery
  deliveryId: text('delivery_id'),
  supersededBy: text('superseded_by'),
  /** a recount changed the quantities behind this (already approved/settled) flag: the owner must review it */
  needsRecheck: boolean('needs_recheck').notNull().default(false),
  /** the unrecovered balance of a partially accepted claim is its own (disputed) flag, linked to the one that was settled */
  parentFlagId: text('parent_flag_id'),
  poId: text('po_id'),
  invoiceLineId: text('invoice_line_id').notNull(),
  sku: text('sku'),
  type: text('type').notNull(),
  amountSen: integer('amount_sen').notNull(),
  status: text('status').notNull().default('proposed'),
  settlement: text('settlement'),
  /** what the supplier actually accepted (credit note / deduction), with the owner-recorded reference. Null = the full flagged amount. */
  acceptedSen: integer('accepted_sen'),
  settlementRef: text('settlement_ref'),
  settlementNote: text('settlement_note'),
  request: text('request'),
  missingQty: integer('missing_qty'),
  invoiceUnitSen: integer('invoice_unit_sen'),
  baselineUnitSen: integer('baseline_unit_sen'),
  baselineSource: text('baseline_source'),
  pricedQty: integer('priced_qty'),
  direction: text('direction'),
  possibleSubstituteFor: text('possible_substitute_for'),
  note: text('note'),
  evidenceToken: text('evidence_token').notNull().unique(),
  openedAt: ts('opened_at'),
  sentAt: ts('sent_at'),
  settledAt: ts('settled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('flags_invoice_line_type_root_uq').on(t.invoiceId, t.invoiceLineId, t.type).where(sql`stage = 'invoice' and parent_flag_id is null`),
  uniqueIndex('flags_delivery_line_type_uq').on(t.deliveryId, t.invoiceLineId, t.type).where(sql`stage = 'delivery'`),
]);

export const flagPhotos = pgTable('flag_photos', {
  flagId: text('flag_id').notNull(),
  documentId: text('document_id').notNull(),
}, t => [primaryKey({ columns: [t.flagId, t.documentId] })]);

export const einvoiceDrafts = pgTable('einvoice_drafts', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().unique(),
  status: text('status').notNull().default('draft'),
  fields: jsonb('fields').notNull(),
  /** result of a real MyInvois submission (sandbox or production); null = never submitted */
  submission: jsonb('submission'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  at: ts('at').notNull().defaultNow(),
  role: text('role').notNull(),
  action: text('action').notNull(),
  ref: text('ref'),
  meta: jsonb('meta'),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const ALL_TABLES = [
  'flag_photos', 'flags', 'einvoice_drafts', 'received_counts', 'delivery_counts', 'delivery_lines', 'deliveries', 'invoice_lines', 'invoices', 'po_lines',
  'purchase_orders', 'aliases', 'price_list', 'documents', 'extractions', 'suppliers', 'events', 'settings',
] as const;
