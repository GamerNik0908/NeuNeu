// Geschäftslogik für Rechnungen, Stornorechnungen, Angebote und wiederkehrende Rechnungen.
//
// Grundsätze (GoBD / § 14 UStG):
// - Rechnungen entstehen als Entwurf ohne Nummer. Erst beim Abschließen wird die nächste
//   fortlaufende Nummer vergeben – so entstehen keine Lücken, wenn Entwürfe gelöscht werden.
// - Abgeschlossene Rechnungen sind unveränderbar. Absender- und Empfängerdaten werden beim
//   Abschließen eingefroren, spätere Änderungen an Profil oder Kunde ändern alte Rechnungen nicht.
// - Korrekturen erfolgen über eine Stornorechnung mit eigener Nummer.
const { db, tx } = require('./db');
const { planFor } = require('./plans');
const { round, today, isDate, addDays, addInterval, dateDe, str, httpError } = require('./util');
const { isEU } = require('./countries');

const TAX_MODES = {
  standard: { label: 'Regelbesteuerung', category: 'S', note: '' },
  small_business: {
    label: 'Kleinunternehmer (§ 19 UStG)',
    category: 'E',
    note: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    exemption: 'Kleinunternehmer gemäß § 19 UStG',
  },
  reverse_charge: {
    label: 'Reverse-Charge (Unternehmen in der EU)',
    category: 'AE',
    note: 'Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge-Verfahren gemäß § 13b UStG bzw. Art. 196 MwStSystRL).',
    exemption: 'Steuerschuldnerschaft des Leistungsempfängers',
    exemptionCode: 'VATEX-EU-AE',
  },
  non_taxable: {
    label: 'Nicht steuerbar (Kunde außerhalb der EU)',
    category: 'O',
    note: 'Nicht im Inland steuerbare Leistung (Leistungsort beim Leistungsempfänger, § 3a Abs. 2 UStG).',
    exemption: 'Nicht im Inland steuerbar',
    exemptionCode: 'VATEX-EU-O',
  },
};

const SELLER_FIELDS = ['company', 'owner', 'street', 'zip', 'city', 'country', 'email', 'phone', 'website', 'tax_number', 'vat_id', 'bank', 'iban', 'bic', 'accent', 'footer_note'];
const CUSTOMER_FIELDS = ['number', 'name', 'contact', 'email', 'street', 'zip', 'city', 'country', 'vat_id', 'buyer_reference'];

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj?.[f] ?? '']));
const getProfile = (userId) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
const getCustomer = (userId, id) => db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(id, userId);
const getDoc = (userId, id) => db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(id, userId);

function suggestTaxMode(profile, customer) {
  if (profile.small_business) return 'small_business';
  const country = customer?.country || 'DE';
  if (country === 'DE') return 'standard';
  if (isEU(country)) return customer.vat_id ? 'reverse_charge' : 'standard';
  return 'non_taxable';
}

function normalizeItems(items, defaultRate, taxMode = 'standard') {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 200)
    .map((it) => {
      const rate = [0, 7, 19].includes(Number(it.taxRate)) ? Number(it.taxRate) : defaultRate;
      return {
        description: String(it.description || '').trim().slice(0, 1000),
        quantity: Math.round((Number(it.quantity) || 0) * 1000) / 1000,
        unit: String(it.unit || '').trim().slice(0, 20),
        price: round(Number(it.price) || 0),
        taxRate: taxMode === 'standard' ? rate : 0,
      };
    })
    .filter((it) => it.description || it.price);
}

// Steuer wird je Steuersatz auf die Summe gerechnet (wie es EN 16931 verlangt).
function totals(items, taxMode = 'standard') {
  const groups = {};
  let subtotal = 0;
  for (const it of items) {
    const net = round(it.quantity * it.price);
    subtotal += net;
    const rate = taxMode === 'standard' ? it.taxRate : 0;
    groups[rate] = round((groups[rate] || 0) + net);
  }
  const taxGroups = Object.entries(groups)
    .map(([rate, net]) => ({ rate: Number(rate), net, tax: round((net * Number(rate)) / 100) }))
    .sort((a, b) => b.rate - a.rate);
  subtotal = round(subtotal);
  const tax = round(taxGroups.reduce((s, g) => s + g.tax, 0));
  return { subtotal, tax, total: round(subtotal + tax), groups: taxGroups };
}

function nextNumber(userId, type, issueDate) {
  const field = type === 'invoice' ? 'next_invoice_number' : 'next_quote_number';
  const prefixField = type === 'invoice' ? 'invoice_prefix' : 'quote_prefix';
  const p = db.prepare(`SELECT ${field} AS n, ${prefixField} AS prefix FROM profiles WHERE user_id = ?`).get(userId);
  let n = p.n;
  let number;
  // Sicherheitsnetz: falls der Zähler manuell zurückgesetzt wurde, nie eine Nummer doppelt vergeben.
  do {
    number = `${p.prefix}-${issueDate.slice(0, 4)}-${String(n).padStart(4, '0')}`;
    n += 1;
  } while (db.prepare('SELECT 1 FROM documents WHERE user_id = ? AND type = ? AND number = ?').get(userId, type, number));
  db.prepare(`UPDATE profiles SET ${field} = ? WHERE user_id = ?`).run(n, userId);
  return number;
}

function invoicesThisMonth(userId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND type = 'invoice' AND kind = 'standard' AND substr(finalized_at, 1, 7) = ?")
    .get(userId, today().slice(0, 7)).n;
}

function logEvent(userId, documentId, type, detail = '') {
  db.prepare('INSERT INTO events (user_id, document_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, documentId, type, String(detail).slice(0, 300), Date.now());
}

function serialize(doc) {
  if (!doc) return doc;
  const overdue = doc.type === 'invoice' && doc.status === 'sent' && doc.due_date && doc.due_date < today();
  return {
    ...doc,
    status: overdue ? 'overdue' : doc.status,
    items: JSON.parse(doc.items),
    customer: JSON.parse(doc.customer),
    seller: doc.seller ? JSON.parse(doc.seller) : null,
    small_business: doc.tax_mode === 'small_business',
    tax_groups: totals(JSON.parse(doc.items), doc.tax_mode).groups,
  };
}

// Absenderdaten: eingefroren bei abgeschlossenen Dokumenten, sonst das aktuelle Profil.
function sellerOf(doc, profile) {
  const frozen = typeof doc.seller === 'string' ? JSON.parse(doc.seller) : doc.seller;
  return { ...pick(profile, SELLER_FIELDS), ...(frozen || {}), logo: profile.logo };
}

function documentFields(userId, input, base) {
  const profile = getProfile(userId);
  const customerId = input.customer_id !== undefined ? Number(input.customer_id) : base?.customer_id;
  const customer = customerId ? getCustomer(userId, customerId) : null;
  if (!customer && !base) throw httpError(400, 'Bitte wähle einen Kunden aus.');
  const taxMode = TAX_MODES[input.tax_mode] ? input.tax_mode : base?.tax_mode || suggestTaxMode(profile, customer);
  const items = normalizeItems(input.items ?? (base ? JSON.parse(base.items) : []), profile.default_tax_rate, taxMode);
  if (!items.length) throw httpError(400, 'Füge mindestens eine Position hinzu.');
  const issueDate = isDate(input.issue_date) ? input.issue_date : base?.issue_date || today();
  const type = base?.type || input.type;
  const dueDate = isDate(input.due_date) ? input.due_date : base?.due_date || addDays(issueDate, type === 'invoice' ? profile.payment_days : 30);
  const optDate = (v, fallback) => (v === '' || v === null ? null : isDate(v) ? v : fallback ?? null);
  let serviceFrom = optDate(input.service_from, base?.service_from);
  let serviceTo = optDate(input.service_to, base?.service_to);
  if (serviceFrom && serviceTo && serviceTo < serviceFrom) [serviceFrom, serviceTo] = [serviceTo, serviceFrom];
  if (!serviceFrom) serviceTo = null;
  const t = totals(items, taxMode);
  return {
    customer_id: customer ? customer.id : base.customer_id,
    customer: customer ? JSON.stringify(pick(customer, CUSTOMER_FIELDS)) : base.customer,
    issue_date: issueDate,
    due_date: dueDate,
    service_from: serviceFrom,
    service_to: serviceTo,
    tax_mode: taxMode,
    small_business: taxMode === 'small_business' ? 1 : 0,
    reference: str(input.reference ?? base?.reference, 100),
    title: str(input.title ?? base?.title, 200),
    intro: String(input.intro ?? base?.intro ?? '').slice(0, 3000),
    notes: String(input.notes ?? base?.notes ?? '').slice(0, 3000),
    items: JSON.stringify(items),
    subtotal: t.subtotal,
    tax: t.tax,
    total: t.total,
  };
}

function insertDocument(userId, type, f, extra = {}) {
  const now = Date.now();
  const res = db
    .prepare(
      `INSERT INTO documents (user_id, type, kind, number, customer_id, customer, issue_date, due_date, service_from, service_to,
       status, tax_mode, small_business, reference, title, intro, notes, items, subtotal, tax, total, source_id, recurring_id,
       seller, finalized_at, created_at, created_at_iso, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      userId, type, extra.kind || 'standard', extra.number || '', f.customer_id, f.customer, f.issue_date, f.due_date,
      f.service_from, f.service_to, extra.status || (type === 'invoice' ? 'draft' : 'open'), f.tax_mode, f.small_business,
      f.reference, f.title, f.intro, f.notes, f.items, f.subtotal, f.tax, f.total, extra.source_id ?? null,
      extra.recurring_id ?? null, extra.seller ?? null, extra.finalized_at ?? null, now, today(), now
    );
  return Number(res.lastInsertRowid);
}

function createDocument(userId, input, extra = {}) {
  const type = input.type === 'quote' ? 'quote' : 'invoice';
  return tx(() => {
    const f = documentFields(userId, { ...input, type });
    // Angebote müssen nicht lückenlos sein und bekommen ihre Nummer sofort.
    const number = type === 'quote' ? nextNumber(userId, 'quote', f.issue_date) : '';
    const id = insertDocument(userId, type, f, { ...extra, number });
    logEvent(userId, id, 'created', extra.eventDetail || '');
    return id;
  });
}

function updateDocument(userId, id, input) {
  const doc = getDoc(userId, id);
  if (!doc) return null;
  if (doc.type === 'invoice' && doc.status !== 'draft') {
    throw httpError(409, 'Abgeschlossene Rechnungen können nicht mehr geändert werden. Storniere sie und erstelle eine neue.');
  }
  const f = documentFields(userId, input, doc);
  const keys = Object.keys(f);
  db.prepare(`UPDATE documents SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    ...keys.map((k) => f[k]),
    Date.now(),
    id,
    userId
  );
  return getDoc(userId, id);
}

// Was fehlt, damit eine Rechnung die Pflichtangaben nach § 14 UStG erfüllt?
function missingForInvoice(seller, customer, taxMode) {
  const missing = [];
  if (!(seller.company || seller.owner)) missing.push({ field: 'company', label: 'Dein Name bzw. Firmenname', where: 'settings' });
  if (!seller.street || !seller.zip || !seller.city) missing.push({ field: 'street', label: 'Deine vollständige Anschrift', where: 'settings' });
  if (!seller.tax_number && !seller.vat_id) missing.push({ field: 'tax_number', label: 'Deine Steuernummer oder USt-IdNr.', where: 'settings' });
  if (!customer?.name) missing.push({ field: 'customer', label: 'Name des Kunden', where: 'customer' });
  if (customer && (!customer.street || !customer.zip || !customer.city)) missing.push({ field: 'customer_address', label: 'Vollständige Anschrift des Kunden', where: 'customer' });
  if (taxMode === 'reverse_charge') {
    if (!seller.vat_id) missing.push({ field: 'vat_id', label: 'Deine USt-IdNr. (für Reverse-Charge Pflicht)', where: 'settings' });
    if (!customer?.vat_id) missing.push({ field: 'customer_vat_id', label: 'USt-IdNr. des Kunden (für Reverse-Charge Pflicht)', where: 'customer' });
  }
  return missing;
}

function finalizeInvoice(user, id) {
  return tx(() => {
    const doc = getDoc(user.id, id);
    if (!doc || doc.type !== 'invoice') throw httpError(404, 'Rechnung nicht gefunden.');
    if (doc.status !== 'draft') return doc;
    const plan = planFor(user);
    if (invoicesThisMonth(user.id) >= plan.limits.invoicesPerMonth) {
      throw httpError(402, `Du hast dein Limit von ${plan.limits.invoicesPerMonth} Rechnungen in diesem Monat erreicht.`, {
        upgrade: true,
        feature: 'invoices',
      });
    }
    const profile = getProfile(user.id);
    const seller = pick(profile, SELLER_FIELDS);
    // Aktuelle Kundendaten übernehmen und ab jetzt einfrieren.
    const current = doc.customer_id ? getCustomer(user.id, doc.customer_id) : null;
    const customer = current ? pick(current, CUSTOMER_FIELDS) : JSON.parse(doc.customer);
    const missing = missingForInvoice(seller, customer, doc.tax_mode);
    if (missing.length) {
      throw httpError(422, 'Für eine gültige Rechnung fehlen noch Angaben.', { missing });
    }
    const number = doc.number || nextNumber(user.id, 'invoice', doc.issue_date);
    db.prepare(
      `UPDATE documents SET number = ?, status = 'sent', finalized_at = ?, seller = ?, customer = ?, updated_at = ? WHERE id = ?`
    ).run(number, today(), JSON.stringify(seller), JSON.stringify(customer), Date.now(), doc.id);
    logEvent(user.id, doc.id, 'finalized', number);
    return getDoc(user.id, doc.id);
  });
}

function cancelInvoice(userId, id) {
  return tx(() => {
    const doc = getDoc(userId, id);
    if (!doc || doc.type !== 'invoice' || doc.kind !== 'standard') throw httpError(404, 'Rechnung nicht gefunden.');
    if (!['sent', 'paid'].includes(doc.status)) throw httpError(400, 'Nur abgeschlossene Rechnungen können storniert werden.');
    const profile = getProfile(userId);
    const items = JSON.parse(doc.items).map((it) => ({ ...it, price: -it.price }));
    const t = totals(items, doc.tax_mode);
    const issueDate = today();
    const f = {
      customer_id: doc.customer_id,
      customer: doc.customer,
      issue_date: issueDate,
      due_date: null,
      service_from: doc.service_from,
      service_to: doc.service_to,
      tax_mode: doc.tax_mode,
      small_business: doc.small_business,
      reference: doc.reference,
      title: '',
      intro: `Hiermit stornieren wir die Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} vollständig.`,
      notes: '',
      items: JSON.stringify(items),
      subtotal: t.subtotal,
      tax: t.tax,
      total: t.total,
    };
    const number = nextNumber(userId, 'invoice', issueDate);
    const stornoId = insertDocument(userId, 'invoice', f, {
      kind: 'cancellation',
      number,
      status: 'issued',
      source_id: doc.id,
      seller: JSON.stringify(pick(profile, SELLER_FIELDS)),
      finalized_at: issueDate,
    });
    db.prepare("UPDATE documents SET status = 'cancelled', cancelled_by = ?, updated_at = ? WHERE id = ?").run(stornoId, Date.now(), doc.id);
    logEvent(userId, doc.id, 'cancelled', number);
    logEvent(userId, stornoId, 'cancellation_created', doc.number);
    return getDoc(userId, stornoId);
  });
}

const TRANSITIONS = {
  invoice: { sent: ['paid'], paid: ['sent'] },
  quote: { open: ['accepted', 'declined'], accepted: ['open', 'declined'], declined: ['open', 'accepted'] },
};

function setStatus(userId, id, status) {
  const doc = getDoc(userId, id);
  if (!doc) return null;
  if (doc.status === status) return doc;
  if (!TRANSITIONS[doc.type][doc.status]?.includes(status)) throw httpError(400, 'Dieser Statuswechsel ist nicht möglich.');
  db.prepare('UPDATE documents SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?').run(status, status === 'paid' ? today() : null, Date.now(), id);
  logEvent(userId, id, `status_${status}`);
  return getDoc(userId, id);
}

function deleteDocument(userId, id) {
  const doc = getDoc(userId, id);
  if (!doc) throw httpError(404, 'Dokument nicht gefunden.');
  if (doc.type === 'invoice' && doc.status !== 'draft') {
    throw httpError(400, 'Abgeschlossene Rechnungen können nicht gelöscht werden – storniere sie stattdessen.');
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
}

function events(userId, docId) {
  return db.prepare('SELECT type, detail, created_at FROM events WHERE user_id = ? AND document_id = ? ORDER BY created_at, id').all(userId, docId);
}

// Häufig genutzte Positionen als Vorschläge für den Editor.
function itemSuggestions(userId) {
  const seen = new Map();
  const rows = db.prepare('SELECT items FROM documents WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC LIMIT 500').all(userId, 'standard');
  for (const row of rows) {
    for (const it of JSON.parse(row.items)) {
      const key = it.description.trim().toLowerCase();
      if (!key) continue;
      const entry = seen.get(key);
      if (entry) entry.count += 1;
      else seen.set(key, { description: it.description, unit: it.unit, price: it.price, taxRate: it.taxRate, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 200);
}

// Fällige wiederkehrende Rechnungen als Entwurf erzeugen (läuft beim Start und stündlich).
function runRecurring() {
  const due = db.prepare('SELECT * FROM recurring WHERE active = 1 AND next_date <= ?').all(today());
  for (const r of due) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id);
    if (!user || !planFor(user).features.recurring) continue;
    let next = r.next_date;
    for (let i = 0; i < 12 && next <= today(); i++) {
      try {
        createDocument(
          r.user_id,
          { type: 'invoice', customer_id: r.customer_id, items: JSON.parse(r.items), title: r.title, issue_date: next, tax_mode: r.tax_mode || undefined },
          { recurring_id: r.id, eventDetail: 'automatisch aus wiederkehrender Rechnung' }
        );
      } catch (err) {
        console.error('Wiederkehrende Rechnung fehlgeschlagen', r.id, err.message);
        break;
      }
      next = addInterval(next, r.interval);
    }
    db.prepare('UPDATE recurring SET next_date = ? WHERE id = ?').run(next, r.id);
  }
}

module.exports = {
  TAX_MODES,
  SELLER_FIELDS,
  CUSTOMER_FIELDS,
  pick,
  getProfile,
  getCustomer,
  getDoc,
  suggestTaxMode,
  normalizeItems,
  totals,
  serialize,
  sellerOf,
  createDocument,
  updateDocument,
  missingForInvoice,
  finalizeInvoice,
  cancelInvoice,
  setStatus,
  deleteDocument,
  logEvent,
  events,
  itemSuggestions,
  invoicesThisMonth,
  runRecurring,
};
