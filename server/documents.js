// Geschäftslogik für Rechnungen, Angebote und wiederkehrende Rechnungen.
const { db, tx } = require('./db');

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addInterval(iso, interval) {
  const d = new Date(`${iso}T00:00:00Z`);
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[interval];
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function normalizeItems(items, defaultRate) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 100)
    .map((it) => ({
      description: String(it.description || '').slice(0, 500),
      quantity: round(Number(it.quantity) || 0),
      unit: String(it.unit || '').slice(0, 20),
      price: round(Number(it.price) || 0),
      taxRate: [0, 7, 19].includes(Number(it.taxRate)) ? Number(it.taxRate) : defaultRate,
    }))
    .filter((it) => it.description || it.price);
}

function totals(items, smallBusiness) {
  let subtotal = 0;
  const byRate = {};
  for (const it of items) {
    const net = round(it.quantity * it.price);
    subtotal += net;
    if (!smallBusiness) byRate[it.taxRate] = (byRate[it.taxRate] || 0) + net;
  }
  let tax = 0;
  for (const [rate, net] of Object.entries(byRate)) tax += round((net * Number(rate)) / 100);
  subtotal = round(subtotal);
  tax = round(tax);
  return { subtotal, tax, total: round(subtotal + tax) };
}

function customerSnapshot(c) {
  return JSON.stringify({
    name: c.name,
    contact: c.contact,
    email: c.email,
    street: c.street,
    zip: c.zip,
    city: c.city,
    country: c.country,
    vat_id: c.vat_id,
  });
}

function nextNumber(userId, type, issueDate) {
  const field = type === 'invoice' ? 'next_invoice_number' : 'next_quote_number';
  const prefixField = type === 'invoice' ? 'invoice_prefix' : 'quote_prefix';
  const p = db.prepare(`SELECT ${field} AS n, ${prefixField} AS prefix FROM profiles WHERE user_id = ?`).get(userId);
  db.prepare(`UPDATE profiles SET ${field} = ${field} + 1 WHERE user_id = ?`).run(userId);
  const year = issueDate.slice(0, 4);
  return `${p.prefix}-${year}-${String(p.n).padStart(4, '0')}`;
}

function invoicesThisMonth(userId) {
  const month = today().slice(0, 7);
  return db
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND type = 'invoice' AND substr(created_at_iso, 1, 7) = ?")
    .get(userId, month).n;
}

function serialize(doc) {
  if (!doc) return doc;
  const status =
    doc.type === 'invoice' && doc.status === 'sent' && doc.due_date && doc.due_date < today() ? 'overdue' : doc.status;
  return {
    ...doc,
    status,
    items: JSON.parse(doc.items),
    customer: JSON.parse(doc.customer),
    small_business: Boolean(doc.small_business),
  };
}

function getDoc(userId, id) {
  return db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(id, userId);
}

function createDocument(userId, input, extra = {}) {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(input.customer_id, userId);
  if (!customer) throw Object.assign(new Error('Bitte wähle einen Kunden aus.'), { status: 400 });
  const type = input.type === 'quote' ? 'quote' : 'invoice';
  const smallBusiness = Boolean(profile.small_business);
  const items = normalizeItems(input.items, profile.default_tax_rate);
  if (!items.length) throw Object.assign(new Error('Füge mindestens eine Position hinzu.'), { status: 400 });
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.issue_date) ? input.issue_date : today();
  const dueDays = type === 'invoice' ? profile.payment_days : 30;
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.due_date) ? input.due_date : addDays(issueDate, dueDays);
  const t = totals(items, smallBusiness);
  const now = Date.now();

  return tx(() => {
    const number = nextNumber(userId, type, issueDate);
    const res = db
      .prepare(
        `INSERT INTO documents (user_id, type, number, customer_id, customer, issue_date, due_date, service_date,
         status, title, intro, notes, items, small_business, subtotal, tax, total, source_id, recurring_id,
         created_at, updated_at, created_at_iso)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        type,
        number,
        customer.id,
        customerSnapshot(customer),
        issueDate,
        dueDate,
        String(input.service_date || '').slice(0, 60),
        type === 'invoice' ? 'draft' : 'open',
        String(input.title || '').slice(0, 200),
        String(input.intro || '').slice(0, 2000),
        String(input.notes || '').slice(0, 2000),
        JSON.stringify(items),
        smallBusiness ? 1 : 0,
        t.subtotal,
        t.tax,
        t.total,
        extra.source_id ?? null,
        extra.recurring_id ?? null,
        now,
        now,
        today()
      );
    return Number(res.lastInsertRowid);
  });
}

function updateDocument(userId, id, input) {
  const doc = getDoc(userId, id);
  if (!doc) return null;
  if (doc.type === 'invoice' && doc.status !== 'draft') {
    throw Object.assign(new Error('Versendete Rechnungen können nicht mehr geändert werden.'), { status: 400 });
  }
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  let customerJson = doc.customer;
  let customerId = doc.customer_id;
  if (input.customer_id && Number(input.customer_id) !== doc.customer_id) {
    const c = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(input.customer_id, userId);
    if (!c) throw Object.assign(new Error('Kunde nicht gefunden.'), { status: 400 });
    customerJson = customerSnapshot(c);
    customerId = c.id;
  }
  const items = input.items ? normalizeItems(input.items, profile.default_tax_rate) : JSON.parse(doc.items);
  if (!items.length) throw Object.assign(new Error('Füge mindestens eine Position hinzu.'), { status: 400 });
  const smallBusiness = Boolean(doc.small_business);
  const t = totals(items, smallBusiness);
  const date = (v, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
  db.prepare(
    `UPDATE documents SET customer_id = ?, customer = ?, issue_date = ?, due_date = ?, service_date = ?, title = ?,
     intro = ?, notes = ?, items = ?, subtotal = ?, tax = ?, total = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(
    customerId,
    customerJson,
    date(input.issue_date, doc.issue_date),
    date(input.due_date, doc.due_date),
    String(input.service_date ?? doc.service_date).slice(0, 60),
    String(input.title ?? doc.title).slice(0, 200),
    String(input.intro ?? doc.intro).slice(0, 2000),
    String(input.notes ?? doc.notes).slice(0, 2000),
    JSON.stringify(items),
    t.subtotal,
    t.tax,
    t.total,
    Date.now(),
    id,
    userId
  );
  return getDoc(userId, id);
}

const STATUSES = {
  invoice: ['draft', 'sent', 'paid', 'cancelled'],
  quote: ['open', 'accepted', 'declined'],
};

function setStatus(userId, id, status) {
  const doc = getDoc(userId, id);
  if (!doc) return null;
  if (!STATUSES[doc.type].includes(status)) throw Object.assign(new Error('Ungültiger Status.'), { status: 400 });
  db.prepare('UPDATE documents SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?').run(
    status,
    status === 'paid' ? today() : null,
    Date.now(),
    id
  );
  return getDoc(userId, id);
}

// Fällige wiederkehrende Rechnungen erzeugen (läuft beim Start und stündlich).
function runRecurring() {
  const due = db.prepare('SELECT * FROM recurring WHERE active = 1 AND next_date <= ?').all(today());
  for (const r of due) {
    const { planFor } = require('./plans');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id);
    if (!user || !planFor(user).features.recurring) continue;
    let next = r.next_date;
    // Holt verpasste Termine nach, maximal 12 auf einmal.
    for (let i = 0; i < 12 && next <= today(); i++) {
      try {
        createDocument(
          r.user_id,
          { type: 'invoice', customer_id: r.customer_id, items: JSON.parse(r.items), title: r.title, issue_date: next },
          { recurring_id: r.id }
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
  round,
  today,
  addDays,
  addInterval,
  totals,
  normalizeItems,
  serialize,
  getDoc,
  createDocument,
  updateDocument,
  setStatus,
  invoicesThisMonth,
  runRecurring,
};
