// Erzeugt Rechnungen, Stornorechnungen und Angebote als PDF/A-3.
// Abgeschlossene Rechnungen enthalten die E-Rechnung als eingebettete factur-x.xml (ZUGFeRD EN 16931).
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { TAX_MODES } = require('./documents');
const { countryName } = require('./countries');
const { round, dateDe, eur, numDe } = require('./util');

const FONTS = {
  R: path.join(__dirname, 'fonts', 'Inter-Regular.ttf'),
  S: path.join(__dirname, 'fonts', 'Inter-SemiBold.ttf'),
  B: path.join(__dirname, 'fonts', 'Inter-Bold.ttf'),
};

const W = 595.28;
const H = 841.89;
const L = 62;
const R = W - 56;
const CONTENT_BOTTOM = 735;
const INK = '#141b2b';
const TEXT = '#2a3142';
const MUTED = '#6b7385';
const LINE = '#e3e6ec';

const FACTURX_XMP = `
<rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
  <fx:DocumentType>INVOICE</fx:DocumentType>
  <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
  <fx:Version>1.0</fx:Version>
  <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
</rdf:Description>
<rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
  <pdfaExtension:schemas>
    <rdf:Bag>
      <rdf:li rdf:parseType="Resource">
        <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
        <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
        <pdfaSchema:prefix>fx</pdfaSchema:prefix>
        <pdfaSchema:property>
          <rdf:Seq>
            ${['DocumentFileName:name of the embedded XML invoice file', 'DocumentType:INVOICE', 'Version:The actual version of the Factur-X XML schema', 'ConformanceLevel:The conformance level of the embedded Factur-X data']
              .map((p) => {
                const [name, desc] = p.split(':');
                return `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${desc}</pdfaProperty:description></rdf:li>`;
              })
              .join('\n            ')}
          </rdf:Seq>
        </pdfaSchema:property>
      </rdf:li>
    </rdf:Bag>
  </pdfaExtension:schemas>
</rdf:Description>`;

function logoBuffer(logo) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(logo || '');
  return m ? Buffer.from(m[2], 'base64') : null;
}

function serviceLabel(doc) {
  if (doc.service_from && doc.service_to && doc.service_from !== doc.service_to) {
    return ['Leistungszeitraum', `${dateDe(doc.service_from)} – ${dateDe(doc.service_to)}`];
  }
  if (doc.service_from) return ['Leistungsdatum', dateDe(doc.service_from)];
  if (doc.service_date) return ['Leistungszeitraum', doc.service_date];
  return ['Leistungsdatum', dateDe(doc.issue_date)];
}

/**
 * @param {object} o
 * @param {object} o.doc       serialisiertes Dokument
 * @param {object} o.seller    Absenderdaten (inkl. logo)
 * @param {object} o.customer  Empfängerdaten
 * @param {boolean} o.branding "Erstellt mit Fakturo" anzeigen
 * @param {object} [o.original] Ursprungsrechnung (bei Storno)
 * @param {string} [o.xml]     einzubettende factur-x.xml
 */
function renderPdf({ doc, seller, customer, branding = false, original = null, xml = null }) {
  return new Promise((resolve, reject) => {
    const isQuote = doc.type === 'quote';
    const isStorno = doc.kind === 'cancellation';
    const isDraft = doc.type === 'invoice' && doc.status === 'draft';
    const mode = TAX_MODES[doc.tax_mode] || TAX_MODES.standard;
    const heading = isStorno ? 'Stornorechnung' : isQuote ? 'Angebot' : 'Rechnung';
    const accent = /^#[0-9a-f]{6}$/i.test(seller.accent) ? seller.accent : '#1f4fd8';
    const sellerName = seller.company || seller.owner || '';

    const pdf = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      autoFirstPage: true,
      pdfVersion: '1.7',
      subset: 'PDF/A-3b',
      font: FONTS.R,
      lang: 'de-DE',
      displayTitle: true,
      info: { Title: `${heading} ${doc.number || 'Entwurf'}`, Creator: 'Fakturo', Producer: 'Fakturo' },
    });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.registerFont('R', FONTS.R);
    pdf.registerFont('S', FONTS.S);
    pdf.registerFont('B', FONTS.B);

    const watermark = () => {
      if (!isDraft) return;
      pdf.save();
      pdf.rotate(-32, { origin: [W / 2, H / 2] });
      pdf.font('B').fontSize(96).fillColor('#eef0f5').text('ENTWURF', 0, H / 2 - 60, { width: W, align: 'center', lineBreak: false });
      pdf.restore();
    };
    watermark();
    pdf.on('pageAdded', watermark);

    const t = (font, size, color) => pdf.font(font).fontSize(size).fillColor(color);

    // ---------- Kopf ----------
    const logo = logoBuffer(seller.logo);
    if (logo) {
      try {
        pdf.image(logo, L, 46, { fit: [180, 58], align: 'left', valign: 'top' });
      } catch {
        t('B', 17, accent).text(sellerName, L, 52, { width: 270 });
      }
    } else {
      t('B', 17, accent).text(sellerName || ' ', L, 52, { width: 270 });
    }
    const companyLines = [
      seller.company && seller.owner ? seller.owner : '',
      seller.street,
      [seller.zip, seller.city].filter(Boolean).join(' '),
      seller.country && seller.country !== 'DE' ? countryName(seller.country) : '',
      seller.phone ? `Tel. ${seller.phone}` : '',
      seller.email,
      seller.website,
    ].filter(Boolean);
    t('S', 9.5, INK).text(sellerName, 340, 50, { width: R - 340, align: 'right' });
    t('R', 8.3, MUTED).text(companyLines.join('\n'), 340, pdf.y + 2, { width: R - 340, align: 'right', lineGap: 1.2 });

    // ---------- Anschrift & Metadaten ----------
    const sender = [sellerName, seller.street, [seller.zip, seller.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    let y = 150;
    t('R', 6.8, MUTED).text(sender, L, y, { width: 250, lineBreak: false, ellipsis: true });
    pdf.moveTo(L, y + 10).lineTo(L + Math.min(250, pdf.widthOfString(sender) + 2), y + 10).lineWidth(0.5).strokeColor('#c9ced8').stroke();
    const recipient = [
      customer.contact ? `z. Hd. ${customer.contact}` : '',
      customer.street,
      [customer.zip, customer.city].filter(Boolean).join(' '),
      customer.country && customer.country !== 'DE' ? countryName(customer.country).toUpperCase() : '',
    ].filter(Boolean);
    t('S', 10.5, INK).text(customer.name || '', L, y + 18, { width: 250 });
    t('R', 10, TEXT).text(recipient.join('\n'), L, pdf.y + 1, { width: 250, lineGap: 1.5 });
    const recipientEnd = pdf.y;

    const meta = [];
    meta.push([isQuote ? 'Angebotsnr.' : isStorno ? 'Stornonr.' : 'Rechnungsnr.', doc.number || 'Entwurf', true]);
    meta.push([isQuote ? 'Angebotsdatum' : 'Datum', dateDe(doc.issue_date)]);
    if (customer.number) meta.push(['Kundennr.', customer.number]);
    if (!isQuote) meta.push(serviceLabel(doc));
    if (isStorno && original) meta.push(['Bezug', `${original.number} vom ${dateDe(original.issue_date)}`]);
    if (!isQuote && !isStorno && doc.due_date) meta.push(['Fällig am', dateDe(doc.due_date), true]);
    if (isQuote && doc.due_date) meta.push(['Gültig bis', dateDe(doc.due_date)]);
    if (doc.reference) meta.push(['Ihre Referenz', doc.reference]);
    if (customer.vat_id) meta.push(['USt-IdNr. Kunde', customer.vat_id]);
    let my = 150;
    for (const [label, value, strong] of meta) {
      t('R', 8.8, MUTED).text(label, 345, my, { width: 90, lineBreak: false });
      t(strong ? 'S' : 'R', 8.8, INK).text(String(value), 420, my, { width: R - 420, align: 'right' });
      my = Math.max(my + 14.5, pdf.y + 3);
    }

    // ---------- Titel & Einleitung ----------
    y = Math.max(recipientEnd, my) + 42;
    t('B', 17, INK).text(doc.title ? `${heading} – ${doc.title}` : heading, L, y, { width: R - L });
    y = pdf.y + 8;
    if (doc.intro) {
      t('R', 9.5, TEXT).text(doc.intro, L, y, { width: R - L, lineGap: 2 });
      y = pdf.y + 14;
    } else y += 6;

    // ---------- Positionen ----------
    const items = doc.items.filter((it) => it.description || it.price);
    const showTax = doc.tax_mode === 'standard' && new Set(items.map((i) => i.taxRate)).size > 1;
    const cols = { pos: L + 8, desc: L + 34, qtyR: 0, priceR: 0, taxR: 0, totalR: R - 8 };
    cols.taxR = showTax ? cols.totalR - 76 : cols.totalR;
    cols.priceR = showTax ? cols.taxR - 40 : cols.totalR - 80;
    cols.qtyR = cols.priceR - 72;
    const descW = cols.qtyR - 62 - cols.desc;

    const tableHeader = () => {
      pdf.rect(L, y, R - L, 21).fill(accent);
      t('S', 7.4, '#ffffff');
      const hy = y + 7;
      const opts = { characterSpacing: 0.5, lineBreak: false };
      pdf.text('POS.', cols.pos, hy, opts);
      pdf.text('BESCHREIBUNG', cols.desc, hy, opts);
      pdf.text('MENGE', cols.qtyR - 70, hy, { ...opts, width: 70, align: 'right' });
      pdf.text('EINZELPREIS', cols.priceR - 80, hy, { ...opts, width: 80, align: 'right' });
      if (showTax) pdf.text('UST.', cols.taxR - 40, hy, { ...opts, width: 40, align: 'right' });
      pdf.text('GESAMT', cols.totalR - 80, hy, { ...opts, width: 80, align: 'right' });
      y += 21;
    };
    const newPage = () => {
      pdf.addPage();
      y = 60;
    };
    tableHeader();

    items.forEach((it, i) => {
      pdf.font('R').fontSize(9.2);
      const h = Math.max(pdf.heightOfString(it.description || ' ', { width: descW, lineGap: 1.5 }), 11) + 14;
      if (y + h > CONTENT_BOTTOM) {
        newPage();
        tableHeader();
      }
      const ry = y + 7;
      t('R', 9.2, MUTED).text(String(i + 1), cols.pos, ry, { lineBreak: false });
      t('R', 9.2, INK).text(it.description, cols.desc, ry, { width: descW, lineGap: 1.5 });
      t('R', 9.2, TEXT);
      pdf.text(`${numDe(it.quantity)}${it.unit ? ` ${it.unit}` : ''}`, cols.qtyR - 80, ry, { width: 80, align: 'right', lineBreak: false });
      pdf.text(eur(it.price), cols.priceR - 90, ry, { width: 90, align: 'right', lineBreak: false });
      if (showTax) pdf.text(`${it.taxRate} %`, cols.taxR - 40, ry, { width: 40, align: 'right', lineBreak: false });
      t('S', 9.2, INK).text(eur(round(it.quantity * it.price)), cols.totalR - 90, ry, { width: 90, align: 'right', lineBreak: false });
      y += h;
      pdf.moveTo(L, y).lineTo(R, y).lineWidth(0.6).strokeColor(LINE).stroke();
    });

    // ---------- Summen ----------
    const sums = [];
    if (doc.tax_mode !== 'small_business') sums.push(['Nettobetrag', eur(doc.subtotal)]);
    if (doc.tax_mode === 'standard') {
      for (const g of doc.tax_groups) {
        sums.push([`zzgl. ${g.rate} % USt.${doc.tax_groups.length > 1 ? ` auf ${eur(g.net)}` : ''}`, eur(g.tax)]);
      }
    }
    if (y + 34 + sums.length * 17 > CONTENT_BOTTOM) newPage();
    y += 12;
    const sx = R - 250;
    for (const [label, value] of sums) {
      t('R', 9.2, TEXT).text(label, sx + 10, y, { width: 160, lineBreak: false });
      pdf.text(value, R - 128, y, { width: 120, align: 'right', lineBreak: false });
      y += 17;
    }
    pdf.moveTo(sx, y + 1).lineTo(R, y + 1).lineWidth(1.4).strokeColor(accent).stroke();
    y += 9;
    t('B', 11, INK).text(isQuote ? 'Angebotssumme' : isStorno ? 'Gutschriftsbetrag' : 'Gesamtbetrag', sx + 10, y, { width: 150, lineBreak: false });
    pdf.text(eur(doc.total), R - 138, y, { width: 130, align: 'right', lineBreak: false });
    y += 34;

    // ---------- Hinweise ----------
    const paragraph = (text, font = 'R', color = TEXT, size = 9.2) => {
      if (!text) return;
      pdf.font(font).fontSize(size);
      const h = pdf.heightOfString(text, { width: R - L, lineGap: 2 });
      if (y + h > CONTENT_BOTTOM) newPage();
      t(font, size, color).text(text, L, y, { width: R - L, lineGap: 2 });
      y = pdf.y + 10;
    };
    paragraph(mode.note, 'S', INK);
    if (isQuote) {
      paragraph(`Dieses Angebot ist gültig bis zum ${dateDe(doc.due_date)}. Wir freuen uns auf Ihre Zusage.`);
    } else if (isStorno) {
      paragraph(`Der Betrag von ${eur(Math.abs(doc.total))} wird Ihnen erstattet bzw. mit offenen Forderungen verrechnet.`);
    } else if (doc.total > 0) {
      const ref = doc.number ? ` unter Angabe der Rechnungsnummer ${doc.number}` : '';
      const account = seller.iban ? ' auf das unten genannte Konto' : '';
      paragraph(`Bitte überweisen Sie den Gesamtbetrag von ${eur(doc.total)} bis zum ${dateDe(doc.due_date)}${ref}${account}.`);
    }
    paragraph(doc.notes);
    paragraph(seller.footer_note);
    paragraph(`Mit freundlichen Grüßen\n${seller.owner || sellerName}`);

    // ---------- Fußzeile auf jeder Seite ----------
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const fy = 768;
      pdf.moveTo(L, fy).lineTo(R, fy).lineWidth(0.6).strokeColor(LINE).stroke();
      const colW = (R - L) / 3 - 8;
      const col = (x, lines) => {
        t('R', 7.2, MUTED).text(lines.filter(Boolean).join('\n'), x, fy + 9, { width: colW, lineGap: 1.3 });
      };
      col(L, [sellerName, seller.company && seller.owner ? `Inhaber/in: ${seller.owner}` : '', seller.street, [seller.zip, seller.city].filter(Boolean).join(' ')]);
      col(L + (R - L) / 3, [seller.phone ? `Tel. ${seller.phone}` : '', seller.email, seller.website, seller.tax_number ? `Steuernr.: ${seller.tax_number}` : '', seller.vat_id ? `USt-IdNr.: ${seller.vat_id}` : '']);
      col(L + ((R - L) / 3) * 2, [seller.bank, seller.iban ? `IBAN: ${seller.iban}` : '', seller.bic ? `BIC: ${seller.bic}` : '']);
      if (range.count > 1) {
        t('R', 7.5, MUTED).text(`Seite ${i - range.start + 1} von ${range.count}`, R - 120, fy - 14, { width: 120, align: 'right', lineBreak: false });
      }
      if (branding) {
        t('R', 6.5, '#a3a9b6').text('Erstellt mit Fakturo', 0, H - 16, { width: W, align: 'center', lineBreak: false });
      }
    }

    if (xml) {
      pdf.file(Buffer.from(xml, 'utf8'), {
        name: 'factur-x.xml',
        type: 'text/xml',
        description: 'Factur-X / ZUGFeRD E-Rechnung (EN 16931)',
        relationship: 'Alternative',
        creationDate: new Date(),
        modifiedDate: new Date(),
      });
      pdf.appendXML(FACTURX_XMP);
    }
    pdf.end();
  });
}

module.exports = { renderPdf };
