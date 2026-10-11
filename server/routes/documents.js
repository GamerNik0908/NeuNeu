// Kunden, Rechnungen, Angebote, Versand, E-Rechnung, Auswertungen
const express = require('express');
const { db } = require('../db');
const docs = require('../documents');
const mailer = require('../mailer');
const { planFor } = require('../plans');
const { renderPdf } = require('../pdf');
const { buildCII, einvoiceIssues } = require('../einvoice');
const { COUNTRIES, toCode } = require('../countries');
const { round, today, isDate, dateDe, str, httpError } = require('../util');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireFeature(user, feature, message = 'Diese Funktion ist in deinem Plan nicht enthalten.') {
  if (!planFor(user).features[feature]) throw httpError(402, message, { upgrade: true, feature });
}

// ---------- Kunden ----------
function customerValues(b) {
  const v = {
    name: str(b.name, 160),
    contact: str(b.contact, 120),
    email: str(b.email, 160),
    street: str(b.street, 160),
    zip: str(b.zip, 12),
    city: str(b.city, 80),
    country: toCode(b.country),
    vat_id: str(b.vat_id, 40).replace(/\s/g, '').toUpperCase(),
    buyer_reference: str(b.buyer_reference, 100),
  };
  if (!v.name) throw httpError(400, 'Bitte gib einen Namen ein.');
  if (v.email && !EMAIL_RE.test(v.email)) throw httpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
  if (!COUNTRIES[v.country]) throw httpError(400, 'Bitte wähle ein Land aus.');
  return v;
}

router.get('/customers', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT c.*,
          (SELECT COALESCE(SUM(total),0) FROM documents d WHERE d.customer_id = c.id AND d.type='invoice' AND d.kind='standard' AND d.status='paid') AS revenue,
          (SELECT COALESCE(SUM(total),0) FROM documents d WHERE d.customer_id = c.id AND d.type='invoice' AND d.status='sent') AS open_amount,
          (SELECT COUNT(*) FROM documents d WHERE d.customer_id = c.id AND d.type='invoice' AND d.kind='standard' AND d.status <> 'draft') AS invoice_count
         FROM customers c WHERE c.user_id = ? ORDER BY c.name COLLATE NOCASE`
      )
      .all(req.user.id)
  );
});

router.post('/customers', (req, res) => {
  const plan = planFor(req.user);
  const count = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE user_id = ?').get(req.user.id).n;
  if (count >= plan.limits.customers) {
    throw httpError(402, `Im ${plan.name}-Plan sind ${plan.limits.customers} Kunden enthalten.`, { upgrade: true, feature: 'customers' });
  }
  const v = customerValues(req.body);
  const id = (() => {
    const p = docs.getProfile(req.user.id);
    db.prepare('UPDATE profiles SET next_customer_number = next_customer_number + 1 WHERE user_id = ?').run(req.user.id);
    return db
      .prepare(
        `INSERT INTO customers (user_id, number, name, contact, email, street, zip, city, country, vat_id, buyer_reference, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(req.user.id, `K-${p.next_customer_number}`, v.name, v.contact, v.email, v.street, v.zip, v.city, v.country, v.vat_id, v.buyer_reference, Date.now())
      .lastInsertRowid;
  })();
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
});

router.put('/customers/:id', (req, res) => {
  const v = customerValues(req.body);
  const r = db
    .prepare('UPDATE customers SET name=?, contact=?, email=?, street=?, zip=?, city=?, country=?, vat_id=?, buyer_reference=? WHERE id = ? AND user_id = ?')
    .run(v.name, v.contact, v.email, v.street, v.zip, v.city, v.country, v.vat_id, v.buyer_reference, req.params.id, req.user.id);
  if (!r.changes) throw httpError(404, 'Kunde nicht gefunden.');
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

router.delete('/customers/:id', (req, res) => {
  // Abgeschlossene Rechnungen behalten ihre eingefrorene Kopie der Kundendaten.
  const r = db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) throw httpError(404, 'Kunde nicht gefunden.');
  res.json({ ok: true });
});

// ---------- Dokumente ----------
function loadDoc(req) {
  const doc = docs.getDoc(req.user.id, req.params.id);
  if (!doc) throw httpError(404, 'Dokument nicht gefunden.');
  return doc;
}

function context(user, raw) {
  const doc = docs.serialize(raw);
  const profile = docs.getProfile(user.id);
  const seller = docs.sellerOf(raw, profile);
  // Bei Entwürfen immer die aktuellen Kundendaten verwenden.
  const live = raw.status === 'draft' || raw.type === 'quote' ? raw.customer_id && docs.getCustomer(user.id, raw.customer_id) : null;
  const customer = live ? docs.pick(live, docs.CUSTOMER_FIELDS) : doc.customer;
  const original = doc.kind === 'cancellation' && doc.source_id ? docs.getDoc(user.id, doc.source_id) : null;
  return { doc, seller, customer, original };
}

const fileName = (doc, ext) => `${doc.kind === 'cancellation' ? 'Storno' : doc.type === 'quote' ? 'Angebot' : 'Rechnung'}_${(doc.number || 'Entwurf').replace(/[^A-Za-z0-9_-]/g, '_')}.${ext}`;

async function buildPdf(user, raw) {
  const { doc, seller, customer, original } = context(user, raw);
  const zugferd = doc.type === 'invoice' && doc.number && einvoiceIssues(doc, seller, customer, 'en16931').length === 0;
  const xml = zugferd ? buildCII(doc, seller, customer, { guideline: 'en16931', original }) : null;
  const branding = !planFor(user).features.removeBranding;
  return { pdf: await renderPdf({ doc, seller, customer, original, xml, branding }), doc, seller, customer, original };
}

router.get('/documents', (req, res) => {
  const type = req.query.type === 'quote' ? 'quote' : 'invoice';
  const rows = db
    .prepare(
      `SELECT * FROM documents WHERE user_id = ? AND type = ?
       ORDER BY CASE WHEN status = 'draft' THEN 0 ELSE 1 END, issue_date DESC, id DESC`
    )
    .all(req.user.id, type)
    .map(docs.serialize)
    .map(({ items, seller, ...d }) => d);
  res.json(rows);
});

router.get('/documents/:id', (req, res) => {
  const raw = loadDoc(req);
  const { doc, seller, customer } = context(req.user, raw);
  const related = (id) => (id ? db.prepare('SELECT id, number, issue_date FROM documents WHERE id = ? AND user_id = ?').get(id, req.user.id) || null : null);
  const finalized = doc.type === 'invoice' && doc.status !== 'draft';
  res.json({
    ...doc,
    customer,
    events: docs.events(req.user.id, doc.id),
    source: related(doc.source_id),
    cancelled_by_doc: related(doc.cancelled_by),
    missing: doc.status === 'draft' ? docs.missingForInvoice(docs.pick(seller, docs.SELLER_FIELDS), customer, doc.tax_mode) : [],
    einvoice: finalized
      ? { zugferd: einvoiceIssues(doc, seller, customer, 'en16931'), xrechnung: einvoiceIssues(doc, seller, customer, 'xrechnung') }
      : null,
  });
});

router.post('/documents', (req, res) => {
  const type = req.body.type === 'quote' ? 'quote' : 'invoice';
  if (type === 'quote') requireFeature(req.user, 'quotes', 'Angebote gibt es ab dem Pro-Plan.');
  const id = docs.createDocument(req.user.id, { ...req.body, type });
  res.status(201).json(docs.serialize(docs.getDoc(req.user.id, id)));
});

router.put('/documents/:id', (req, res) => {
  const doc = docs.updateDocument(req.user.id, req.params.id, req.body);
  if (!doc) throw httpError(404, 'Dokument nicht gefunden.');
  res.json(docs.serialize(doc));
});

router.post('/documents/:id/finalize', (req, res) => {
  res.json(docs.serialize(docs.finalizeInvoice(req.user, Number(req.params.id))));
});

router.post('/documents/:id/status', (req, res) => {
  const doc = docs.setStatus(req.user.id, req.params.id, str(req.body.status, 20));
  if (!doc) throw httpError(404, 'Dokument nicht gefunden.');
  res.json(docs.serialize(doc));
});

router.post('/documents/:id/cancel', (req, res) => {
  res.status(201).json(docs.serialize(docs.cancelInvoice(req.user.id, Number(req.params.id))));
});

router.post('/documents/:id/duplicate', (req, res) => {
  const src = loadDoc(req);
  const type = req.body.type === 'invoice' ? 'invoice' : src.type;
  if (type === 'quote') requireFeature(req.user, 'quotes', 'Angebote gibt es ab dem Pro-Plan.');
  if (!src.customer_id) throw httpError(400, 'Der Kunde dieses Dokuments wurde gelöscht. Lege ihn neu an und erstelle das Dokument neu.');
  const converting = src.type === 'quote' && type === 'invoice';
  const items = JSON.parse(src.items).map((it) => (src.kind === 'cancellation' ? { ...it, price: -it.price } : it));
  const id = docs.createDocument(
    req.user.id,
    {
      type,
      customer_id: src.customer_id,
      items,
      tax_mode: src.tax_mode,
      reference: src.reference,
      title: src.kind === 'cancellation' ? '' : src.title,
      intro: converting ? 'Vielen Dank für Ihren Auftrag. Für die erbrachten Leistungen erlaube ich mir, Folgendes in Rechnung zu stellen:' : src.intro,
      notes: src.notes,
    },
    { source_id: src.id, eventDetail: converting ? `aus Angebot ${src.number}` : `Kopie von ${src.number || 'Entwurf'}` }
  );
  if (converting) {
    if (src.status !== 'accepted') docs.setStatus(req.user.id, src.id, 'accepted');
    docs.logEvent(req.user.id, src.id, 'converted', '');
  }
  res.status(201).json(docs.serialize(docs.getDoc(req.user.id, id)));
});

router.delete('/documents/:id', (req, res) => {
  docs.deleteDocument(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.get('/documents/:id/pdf', async (req, res) => {
  const { pdf, doc } = await buildPdf(req.user, loadDoc(req));
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${fileName(doc, 'pdf')}"`);
  res.set('Cache-Control', 'no-store');
  res.send(pdf);
});

router.get('/documents/:id/xrechnung.xml', (req, res) => {
  const { doc, seller, customer, original } = context(req.user, loadDoc(req));
  const issues = einvoiceIssues(doc, seller, customer, 'xrechnung');
  if (issues.length) throw httpError(422, `Für die XRechnung fehlt noch: ${issues.join(', ')}.`, { missing: issues });
  docs.logEvent(req.user.id, doc.id, 'xrechnung', '');
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${fileName(doc, 'xml').replace('.xml', '_XRechnung.xml')}"`);
  res.send(buildCII(doc, seller, customer, { guideline: 'xrechnung', original }));
});

// Versand per E-Mail mit PDF (inkl. ZUGFeRD) im Anhang. Entwürfe werden dabei abgeschlossen.
router.post('/documents/:id/send', async (req, res) => {
  if (req.user.is_demo) throw httpError(403, 'Im Demo-Konto werden keine E-Mails versendet. Erstelle dein kostenloses Konto, um Rechnungen zu verschicken.');
  if (!mailer.enabled()) throw httpError(501, 'Der E-Mail-Versand ist nicht eingerichtet.');
  const to = str(req.body.to, 300)
    .split(/[,;\s]+/)
    .filter(Boolean);
  if (!to.length || !to.every((e) => EMAIL_RE.test(e))) throw httpError(400, 'Bitte gib eine gültige Empfänger-Adresse ein.');
  const subject = str(req.body.subject, 200);
  const message = String(req.body.message || '').slice(0, 10000);
  if (!subject || !message) throw httpError(400, 'Betreff und Nachricht dürfen nicht leer sein.');
  if (!sendAllowed(req)) throw httpError(429, 'Du hast sehr viele E-Mails in kurzer Zeit verschickt. Bitte warte ein paar Minuten.');

  let raw = loadDoc(req);
  if (raw.type === 'invoice' && raw.status === 'draft') raw = docs.finalizeInvoice(req.user, raw.id);
  const { pdf, doc, seller, customer, original } = await buildPdf(req.user, raw);
  const attachments = [{ filename: fileName(doc, 'pdf'), content: pdf, contentType: 'application/pdf' }];
  if (req.body.attachXRechnung && doc.type === 'invoice') {
    const issues = einvoiceIssues(doc, seller, customer, 'xrechnung');
    if (issues.length) throw httpError(422, `Für die XRechnung fehlt noch: ${issues.join(', ')}.`);
    attachments.push({ filename: fileName(doc, 'xml').replace('.xml', '_XRechnung.xml'), content: buildCII(doc, seller, customer, { guideline: 'xrechnung', original }), contentType: 'application/xml' });
  }
  const replyTo = seller.email || req.user.email;
  await mailer.send({
    to,
    bcc: req.body.copyToMe ? replyTo : undefined,
    replyTo,
    fromName: seller.company || seller.owner,
    subject,
    text: message,
    attachments,
  });
  db.prepare('UPDATE documents SET sent_at = ?, updated_at = ? WHERE id = ?').run(today(), Date.now(), doc.id);
  docs.logEvent(req.user.id, doc.id, 'sent_email', to.join(', '));
  res.json(docs.serialize(docs.getDoc(req.user.id, doc.id)));
});

// Schutz vor Missbrauch des Versands: max. 60 E-Mails pro Stunde und Konto
const sendCounter = new Map();
function sendAllowed(req) {
  const key = req.user.id;
  const now = Date.now();
  const list = (sendCounter.get(key) || []).filter((t) => t > now - 3600000);
  list.push(now);
  sendCounter.set(key, list);
  return list.length <= 60;
}

const REMINDER_NAMES = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'];

router.post('/documents/:id/reminder', async (req, res) => {
  requireFeature(req.user, 'reminders', 'Zahlungserinnerungen gibt es ab dem Pro-Plan.');
  const raw = loadDoc(req);
  if (raw.type !== 'invoice' || raw.kind !== 'standard' || raw.status !== 'sent') throw httpError(400, 'Erinnerungen sind nur für offene Rechnungen möglich.');
  const level = Math.min(raw.reminder_level, 2);
  if (req.body.send) {
    if (req.user.is_demo) throw httpError(403, 'Im Demo-Konto werden keine E-Mails versendet.');
    const to = str(req.body.to, 300).split(/[,;\s]+/).filter(Boolean);
    if (!to.length || !to.every((e) => EMAIL_RE.test(e))) throw httpError(400, 'Bitte gib eine gültige Empfänger-Adresse ein.');
    if (!sendAllowed(req)) throw httpError(429, 'Bitte warte ein paar Minuten.');
    const { pdf, doc, seller } = await buildPdf(req.user, raw);
    await mailer.send({
      to,
      replyTo: seller.email || req.user.email,
      fromName: seller.company || seller.owner,
      subject: str(req.body.subject, 200),
      text: String(req.body.message || '').slice(0, 10000),
      attachments: [{ filename: fileName(doc, 'pdf'), content: pdf, contentType: 'application/pdf' }],
    });
  }
  db.prepare('UPDATE documents SET reminder_level = ?, updated_at = ? WHERE id = ?').run(Math.min(raw.reminder_level + 1, 3), Date.now(), raw.id);
  docs.logEvent(req.user.id, raw.id, 'reminder', REMINDER_NAMES[level]);
  res.json(docs.serialize(docs.getDoc(req.user.id, raw.id)));
});

router.get('/items/suggestions', (req, res) => res.json(docs.itemSuggestions(req.user.id)));

// ---------- Auswertungen ----------
router.get('/stats', (req, res) => {
  const uid = req.user.id;
  const t = today();
  const year = t.slice(0, 4);
  const one = (sql, ...p) => db.prepare(sql).get(uid, ...p);
  const open = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM documents WHERE user_id=? AND type='invoice' AND status='sent' AND due_date >= ?", t);
  const overdue = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM documents WHERE user_id=? AND type='invoice' AND status='sent' AND due_date < ?", t);
  const paidYear = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s, COALESCE(SUM(subtotal),0) net FROM documents WHERE user_id=? AND type='invoice' AND status='paid' AND substr(paid_at,1,4)=?", year);
  const quotes = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM documents WHERE user_id=? AND type='quote' AND status='open'");
  const drafts = one("SELECT COUNT(*) n FROM documents WHERE user_id=? AND type='invoice' AND status='draft'");
  const months = [];
  const base = new Date(`${t.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    const paid = one("SELECT COALESCE(SUM(subtotal),0) s FROM documents WHERE user_id=? AND type='invoice' AND status='paid' AND substr(paid_at,1,7)=?", m);
    const invoiced = one("SELECT COALESCE(SUM(subtotal),0) s FROM documents WHERE user_id=? AND type='invoice' AND status IN ('sent','paid','issued') AND substr(issue_date,1,7)=?", m);
    months.push({ month: m, paid: round(paid.s), invoiced: round(invoiced.s) });
  }
  const top = db
    .prepare(
      `SELECT json_extract(customer,'$.name') AS name, SUM(subtotal) AS net FROM documents
       WHERE user_id = ? AND type='invoice' AND status IN ('sent','paid','issued') AND substr(issue_date,1,4) = ?
       GROUP BY customer_id ORDER BY net DESC LIMIT 5`
    )
    .all(uid, year)
    .filter((r) => r.net > 0);
  // Durchschnittliche Zahlungsdauer in Tagen – zeigt, wie schnell Kunden zahlen.
  const paidRows = db.prepare("SELECT issue_date, paid_at FROM documents WHERE user_id=? AND type='invoice' AND status='paid' AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 50").all(uid);
  const avgDays = paidRows.length
    ? Math.round(paidRows.reduce((s, r) => s + (Date.parse(r.paid_at) - Date.parse(r.issue_date)) / 86400000, 0) / paidRows.length)
    : null;
  const recent = db
    .prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC LIMIT 6')
    .all(uid)
    .map(docs.serialize)
    .map(({ items, seller, ...d }) => d);
  const overdueList = db
    .prepare("SELECT * FROM documents WHERE user_id=? AND type='invoice' AND status='sent' AND due_date < ? ORDER BY due_date LIMIT 5")
    .all(uid, t)
    .map(docs.serialize)
    .map(({ items, seller, ...d }) => d);
  res.json({ open, overdue, paidYear, quotes, drafts, months, top, avgDays, recent, overdueList, invoiceCount: one("SELECT COUNT(*) n FROM documents WHERE user_id=? AND type='invoice'").n });
});

// CSV-Export für Steuerberatung / EÜR (Excel-kompatibel: Semikolon, deutsches Zahlenformat)
router.get('/export.csv', (req, res) => {
  requireFeature(req.user, 'csvExport', 'Der CSV-Export ist ab dem Pro-Plan enthalten.');
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : today().slice(0, 4);
  const rows = db
    .prepare("SELECT * FROM documents WHERE user_id = ? AND type = 'invoice' AND status <> 'draft' AND substr(issue_date,1,4) = ? ORDER BY number")
    .all(req.user.id, year)
    .map(docs.serialize);
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`; // Schutz vor Formel-Injection in Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const num = (n) => Number(n).toFixed(2).replace('.', ',');
  const statusDe = { sent: 'Offen', overdue: 'Überfällig', paid: 'Bezahlt', cancelled: 'Storniert', issued: 'Stornorechnung' };
  const header = ['Rechnungsnummer', 'Art', 'Rechnungsdatum', 'Fällig', 'Kundennr.', 'Kunde', 'Land', 'USt-IdNr. Kunde', 'Steuerfall', 'Netto', 'USt 19 %', 'USt 7 %', 'USt gesamt', 'Brutto', 'Status', 'Bezahlt am', 'Bezug'];
  const lines = [header.map(cell).join(';')];
  for (const r of rows) {
    const g = Object.fromEntries(r.tax_groups.map((x) => [x.rate, x.tax]));
    lines.push(
      [
        r.number, r.kind === 'cancellation' ? 'Stornorechnung' : 'Rechnung', dateDe(r.issue_date), dateDe(r.due_date), r.customer.number, r.customer.name,
        r.customer.country, r.customer.vat_id, docs.TAX_MODES[r.tax_mode]?.label, num(r.subtotal), num(g[19] || 0), num(g[7] || 0), num(r.tax), num(r.total),
        statusDe[r.status] || r.status, dateDe(r.paid_at), r.source_id ? db.prepare('SELECT number FROM documents WHERE id = ?').get(r.source_id)?.number : '',
      ]
        .map(cell)
        .join(';')
    );
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="Rechnungen_${year}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

// ---------- Wiederkehrende Rechnungen ----------
router.get('/recurring', (req, res) => {
  res.json(
    db
      .prepare('SELECT r.*, c.name AS customer_name FROM recurring r JOIN customers c ON c.id = r.customer_id WHERE r.user_id = ? ORDER BY r.next_date')
      .all(req.user.id)
      .map((r) => ({ ...r, items: JSON.parse(r.items), active: Boolean(r.active) }))
  );
});

router.post('/recurring', (req, res) => {
  requireFeature(req.user, 'recurring', 'Wiederkehrende Rechnungen gibt es im Business-Plan.');
  const b = req.body;
  const customer = docs.getCustomer(req.user.id, b.customer_id);
  if (!customer) throw httpError(400, 'Bitte wähle einen Kunden aus.');
  if (!['monthly', 'quarterly', 'yearly'].includes(b.interval)) throw httpError(400, 'Ungültiges Intervall.');
  const profile = docs.getProfile(req.user.id);
  const taxMode = docs.TAX_MODES[b.tax_mode] ? b.tax_mode : docs.suggestTaxMode(profile, customer);
  const items = docs.normalizeItems(b.items, profile.default_tax_rate, taxMode);
  if (!items.length || items.some((it) => !it.description)) throw httpError(400, 'Bitte gib eine Leistung mit Beschreibung an.');
  const next = isDate(b.next_date) && b.next_date >= today() ? b.next_date : today();
  db.prepare('INSERT INTO recurring (user_id, customer_id, title, items, interval, next_date, tax_mode, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
    req.user.id, customer.id, str(b.title, 200), JSON.stringify(items), b.interval, next, taxMode, Date.now()
  );
  docs.runRecurring();
  res.status(201).json({ ok: true });
});

router.post('/recurring/:id/toggle', (req, res) => {
  requireFeature(req.user, 'recurring');
  const r = db.prepare('UPDATE recurring SET active = 1 - active WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) throw httpError(404, 'Nicht gefunden.');
  res.json({ ok: true });
});

router.delete('/recurring/:id', (req, res) => {
  db.prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
