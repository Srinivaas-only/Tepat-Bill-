// LHDN MyInvois self-billed invoice (type 11, version 1.0, JSON/UBL 2.1) built from our approved draft. Pure.
// Field names follow the MyInvois SDK samples as recalled by our research; the sandbox is the final judge, so every document is
// sandbox-checkable (see server/myinvois.ts). Amounts: our drafts hold minor units of the invoice currency -> decimal here.
import type { SelfBilledDraft } from './einvoice';

const v = (x: string | number, extra: Record<string, string> = {}) => [{ _: x, ...extra }];
const money = (minor: number) => Number((minor / 100).toFixed(2));
const iso3 = (c?: string) => ({ MY: 'MYS', CN: 'CHN', SG: 'SGP', US: 'USA', TH: 'THA', ID: 'IDN', VN: 'VNM', JP: 'JPN', KR: 'KOR', IN: 'IND', GB: 'GBR', AU: 'AUS', HK: 'HKG', TW: 'TWN' } as Record<string, string>)[(c ?? '').toUpperCase()] ?? 'XXX';

function party(name: string, tin: string, brn: string, addr: string, country: string, msic: string, tel = 'NA', mail = 'NA') {
  return [{ Party: [{
    IndustryClassificationCode: v(msic, { name: 'Not Applicable' }),
    PartyIdentification: [{ ID: v(tin, { schemeID: 'TIN' }) }, { ID: v(brn || 'NA', { schemeID: 'BRN' }) }],
    PostalAddress: [{ CityName: v('NA'), PostalZone: v('NA'), CountrySubentityCode: v('17'), AddressLine: [{ Line: v(addr || 'NA') }], Country: [{ IdentificationCode: v(country, { listID: 'ISO3166-1', listAgencyID: '6' }) }] }],
    PartyLegalEntity: [{ RegistrationName: v(name) }],
    Contact: [{ Telephone: v(tel), ElectronicMail: v(mail) }],
  }] }];
}

export function toMyInvoisUbl(d: SelfBilledDraft, now: Date): Record<string, unknown> {
  const f = d.fields;
  const total = money(f.totalSen);
  const foreign = f.currency !== 'MYR';
  const date = now.toISOString().slice(0, 10), time = now.toISOString().slice(11, 19) + 'Z';
  const line = (l: SelfBilledDraft['fields']['lines'][number], i: number) => ({
    ID: v(String(i + 1)), InvoicedQuantity: v(l.qty, { unitCode: 'C62' }), LineExtensionAmount: v(money(l.totalSen), { currencyID: f.currency }),
    TaxTotal: [{ TaxAmount: v(0, { currencyID: f.currency }), TaxSubtotal: [{ TaxableAmount: v(money(l.totalSen), { currencyID: f.currency }), TaxAmount: v(0, { currencyID: f.currency }), TaxCategory: [{ ID: v('E'), TaxExemptionReason: v('Not applicable'), TaxScheme: [{ ID: v('OTH', { schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }) }] }] }] }],
    Item: [{ CommodityClassification: [{ ItemClassificationCode: v('022', { listID: 'CLASS' }) }], Description: v(l.description) }],
    Price: [{ PriceAmount: v(money(l.unitPriceSen), { currencyID: f.currency }) }],
    ItemPriceExtension: [{ Amount: v(money(l.totalSen), { currencyID: f.currency }) }],
  });
  return {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [{
      ID: v(f.eInvoiceNo), IssueDate: v(date), IssueTime: v(time),
      InvoiceTypeCode: v('11', { listVersionID: '1.0' }),
      DocumentCurrencyCode: v(f.currency), TaxCurrencyCode: v('MYR'),
      ...(foreign && f.exchangeRateToMYR ? { TaxExchangeRate: [{ CalculationRate: v(f.exchangeRateToMYR), SourceCurrencyCode: v(f.currency), TargetCurrencyCode: v('MYR') }] } : {}),
      // self-billed: the supplier is the FOREIGN seller (generic TIN), the customer is the Malaysian buyer who issues the document
      AccountingSupplierParty: party(f.supplierName, f.supplierTin, 'NA', 'NA', iso3(f.supplierCountry), '00000'),
      AccountingCustomerParty: party(f.buyer.name, f.buyer.tin, f.buyer.brn, f.buyer.address, 'MYS', f.buyer.msic || '47111'),
      TaxTotal: [{ TaxAmount: v(0, { currencyID: f.currency }), TaxSubtotal: [{ TaxableAmount: v(total, { currencyID: f.currency }), TaxAmount: v(0, { currencyID: f.currency }), TaxCategory: [{ ID: v('E'), TaxExemptionReason: v('Not applicable'), TaxScheme: [{ ID: v('OTH', { schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }) }] }] }] }],
      LegalMonetaryTotal: [{ LineExtensionAmount: v(total, { currencyID: f.currency }), TaxExclusiveAmount: v(total, { currencyID: f.currency }), TaxInclusiveAmount: v(total, { currencyID: f.currency }), PayableAmount: v(total, { currencyID: f.currency }) }],
      InvoiceLine: f.lines.map(line),
    }],
  };
}
