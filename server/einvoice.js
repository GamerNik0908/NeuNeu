// E-Rechnung nach EN 16931 im Format UN/CEFACT CII.
//
// - 'xrechnung': XRechnung 3.0 (CIUS für Deutschland) als eigenständige XML-Datei.
// - 'en16931':   ZUGFeRD 2 / Factur-X Profil EN 16931 – wird als factur-x.xml ins PDF eingebettet.
const { TAX_MODES, totals } = require('./documents');
const { round } = require('./util');

const GUIDELINES = {
  xrechnung: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  en16931: 'urn:cen.eu:en16931:2017',
};

// Einheiten nach UN/ECE Recommendation 20
const UNIT_CODES = {
  std: 'HUR', 'std.': 'HUR', stunde: 'HUR', stunden: 'HUR', h: 'HUR',
  tag: 'DAY', tage: 'DAY', pt: 'DAY', woche: 'WEE', wochen: 'WEE', monat: 'MON', monate: 'MON', jahr: 'ANN',
  min: 'MIN', minute: 'MIN', minuten: 'MIN',
  stk: 'H87', 'stk.': 'H87', stück: 'H87', st: 'H87', 'st.': 'H87',
  pauschal: 'LS', pausch: 'LS', psch: 'LS', 'psch.': 'LS',
  km: 'KMT', m: 'MTR', 'm²': 'MTK', m2: 'MTK', qm: 'MTK', kg: 'KGM', g: 'GRM', l: 'LTR', liter: 'LTR',
};
const unitCode = (unit) => UNIT_CODES[String(unit || '').trim().toLowerCase()] || 'C62';

const x = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const amt = (n) => round(n).toFixed(2);
const qty = (n) => String(Math.round(Number(n) * 10000) / 10000);
const d102 = (iso) => iso.replace(/-/g, '');
const dt = (iso) => `<udt:DateTimeString format="102">${d102(iso)}</udt:DateTimeString>`;
const opt = (cond, s) => (cond ? s : '');

// Welche Angaben fehlen für das jeweilige Format? (leere Liste = E-Rechnung möglich)
function einvoiceIssues(doc, seller, customer, guideline = 'xrechnung') {
  const issues = [];
  const mode = TAX_MODES[doc.tax_mode] || TAX_MODES.standard;
  if (doc.type !== 'invoice' || !doc.number) issues.push('Nur abgeschlossene Rechnungen können als E-Rechnung ausgegeben werden.');
  if (!(seller.company || seller.owner)) issues.push('Dein Firmenname');
  if (!seller.street || !seller.zip || !seller.city) issues.push('Deine vollständige Anschrift');
  if (!customer.name) issues.push('Name des Kunden');
  if (!customer.country || customer.country.length !== 2) issues.push('Land des Kunden');
  if (mode.category !== 'O' && !seller.vat_id && !seller.tax_number) issues.push('Deine Steuernummer oder USt-IdNr.');
  if (mode.category === 'AE' && (!seller.vat_id || !customer.vat_id)) issues.push('USt-IdNr. von dir und vom Kunden (Reverse-Charge)');
  if (guideline === 'xrechnung') {
    if (!seller.iban) issues.push('Deine IBAN');
    if (!seller.email) issues.push('Deine E-Mail-Adresse');
    if (!seller.phone) issues.push('Deine Telefonnummer');
    if (!customer.email) issues.push('E-Mail-Adresse des Kunden');
    if (!customer.zip || !customer.city) issues.push('PLZ und Ort des Kunden');
  }
  return issues;
}

function address(p) {
  return `<ram:PostalTradeAddress>
          ${opt(p.zip, `<ram:PostcodeCode>${x(p.zip)}</ram:PostcodeCode>`)}
          ${opt(p.street, `<ram:LineOne>${x(p.street)}</ram:LineOne>`)}
          ${opt(p.city, `<ram:CityName>${x(p.city)}</ram:CityName>`)}
          <ram:CountryID>${x(p.country || 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>`;
}

function buildCII(doc, seller, customer, { guideline = 'xrechnung', original = null } = {}) {
  const mode = TAX_MODES[doc.tax_mode] || TAX_MODES.standard;
  const isCredit = doc.kind === 'cancellation';
  // Stornorechnungen werden als Gutschrift (381) mit positiven Beträgen übertragen.
  const sign = isCredit ? -1 : 1;
  const items = doc.items.map((it) => ({ ...it, price: it.price * sign }));
  const t = totals(items, doc.tax_mode);
  const sellerName = seller.company || seller.owner;
  const buyerRef = customer.buyer_reference || doc.reference || customer.number || doc.number;
  const noTaxIds = mode.category === 'O';

  const lines = items
    .map(
      (it, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${x(it.description.split('\n')[0] || 'Leistung')}</ram:Name>${opt(
        it.description.includes('\n'),
        `<ram:Description>${x(it.description)}</ram:Description>`
      )}</ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(Math.abs(it.price))}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode(it.unit)}">${qty(it.price < 0 ? -it.quantity : it.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${mode.category}</ram:CategoryCode>
          ${opt(mode.category !== 'O', `<ram:RateApplicablePercent>${mode.category === 'S' ? it.taxRate : 0}</ram:RateApplicablePercent>`)}
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${amt(it.quantity * it.price)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
    )
    .join('');

  const taxes = t.groups
    .map(
      (g) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amt(g.tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${opt(mode.exemption, `<ram:ExemptionReason>${x(mode.exemption)}</ram:ExemptionReason>`)}
        <ram:BasisAmount>${amt(g.net)}</ram:BasisAmount>
        <ram:CategoryCode>${mode.category}</ram:CategoryCode>
        ${opt(mode.exemptionCode, `<ram:ExemptionReasonCode>${mode.exemptionCode}</ram:ExemptionReasonCode>`)}
        <ram:RateApplicablePercent>${mode.category === 'S' ? g.rate : 0}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
    )
    .join('');

  const period =
    doc.service_from && doc.service_to
      ? `<ram:BillingSpecifiedPeriod>
        <ram:StartDateTime>${dt(doc.service_from)}</ram:StartDateTime>
        <ram:EndDateTime>${dt(doc.service_to)}</ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>`
      : '';
  const deliveryDate = doc.service_from && !doc.service_to ? doc.service_from : !doc.service_from ? doc.issue_date : null;

  const notes = [mode.note, doc.notes].filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${GUIDELINES[guideline]}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${x(doc.number)}</ram:ID>
    <ram:TypeCode>${isCredit ? 381 : 380}</ram:TypeCode>
    <ram:IssueDateTime>${dt(doc.issue_date)}</ram:IssueDateTime>${notes.map((n) => `
    <ram:IncludedNote><ram:Content>${x(n)}</ram:Content></ram:IncludedNote>`).join('')}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      ${opt(buyerRef, `<ram:BuyerReference>${x(buyerRef)}</ram:BuyerReference>`)}
      <ram:SellerTradeParty>
        ${opt(!seller.vat_id || noTaxIds, `<ram:ID>${x(seller.tax_number || seller.email || sellerName)}</ram:ID>`)}
        <ram:Name>${x(sellerName)}</ram:Name>
        ${opt(
          seller.owner || seller.phone || seller.email,
          `<ram:DefinedTradeContact>
          <ram:PersonName>${x(seller.owner || sellerName)}</ram:PersonName>
          ${opt(seller.phone, `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${x(seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>`)}
          ${opt(seller.email, `<ram:EmailURIUniversalCommunication><ram:URIID>${x(seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>`)}
        </ram:DefinedTradeContact>`
        )}
        ${address(seller)}
        ${opt(seller.email, `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(seller.email)}</ram:URIID></ram:URIUniversalCommunication>`)}
        ${opt(seller.tax_number, `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${x(seller.tax_number)}</ram:ID></ram:SpecifiedTaxRegistration>`)}
        ${opt(seller.vat_id && !noTaxIds, `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(seller.vat_id.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>`)}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        ${opt(customer.number, `<ram:ID>${x(customer.number)}</ram:ID>`)}
        <ram:Name>${x(customer.name)}</ram:Name>
        ${opt(customer.contact, `<ram:DefinedTradeContact><ram:PersonName>${x(customer.contact)}</ram:PersonName></ram:DefinedTradeContact>`)}
        ${address(customer)}
        ${opt(customer.email, `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(customer.email)}</ram:URIID></ram:URIUniversalCommunication>`)}
        ${opt(customer.vat_id && !noTaxIds, `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(customer.vat_id.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>`)}
      </ram:BuyerTradeParty>
      ${opt(doc.reference, `<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${x(doc.reference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>`)}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${opt(deliveryDate, `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${deliveryDate && dt(deliveryDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>`)}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      ${opt(!isCredit, `<ram:PaymentReference>${x(doc.number)}</ram:PaymentReference>`)}
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${opt(
        seller.iban && !isCredit,
        `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${x(seller.iban.replace(/\s/g, ''))}</ram:IBANID>
          <ram:AccountName>${x(sellerName)}</ram:AccountName>
        </ram:PayeePartyCreditorFinancialAccount>
        ${opt(seller.bic, `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${x(seller.bic.replace(/\s/g, ''))}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>`)}
      </ram:SpecifiedTradeSettlementPaymentMeans>`
      )}
      ${opt(isCredit, `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>1</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>`)}${taxes}
      ${period}
      ${opt(
        !isCredit && doc.due_date,
        `<ram:SpecifiedTradePaymentTerms>
        <ram:Description>Zahlbar ohne Abzug bis ${doc.due_date && doc.due_date.split('-').reverse().join('.')}</ram:Description>
        <ram:DueDateDateTime>${doc.due_date && dt(doc.due_date)}</ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>`
      )}
      ${opt(isCredit, '<ram:SpecifiedTradePaymentTerms><ram:Description>Der Betrag wird erstattet bzw. verrechnet.</ram:Description></ram:SpecifiedTradePaymentTerms>')}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(t.subtotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(t.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amt(t.tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(t.total)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amt(t.total)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      ${opt(
        original,
        original &&
          `<ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${x(original.number)}</ram:IssuerAssignedID>
        <ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${d102(original.issue_date)}</qdt:DateTimeString></ram:FormattedIssueDateTime>
      </ram:InvoiceReferencedDocument>`
      )}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`.replace(/^\s*\n/gm, '');
}

module.exports = { buildCII, einvoiceIssues, unitCode, GUIDELINES };
