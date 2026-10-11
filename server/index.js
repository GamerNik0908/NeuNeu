const fs = require('node:fs');
const path = require('node:path');

// .env laden (ohne Abhängigkeit)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const billing = require('./billing');
const docs = require('./documents');
const { planFor, publicPlans } = require('./plans');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'",
  });
  next();
});

// Stripe-Webhook braucht den unveränderten Body – deshalb vor express.json().
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await billing.handleWebhook(req.body.toString('utf8'), req.headers['stripe-signature']);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.use(express.json({ limit: '1mb' }));

// Schreibende API-Aufrufe nur als JSON – schützt zusätzlich vor CSRF über Formulare.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type muss application/json sein.' });
  }
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function userPayload(user) {
  const plan = planFor(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: plan.id,
    planName: plan.name,
    features: plan.features,
    limits: {
      invoicesPerMonth: Number.isFinite(plan.limits.invoicesPerMonth) ? plan.limits.invoicesPerMonth : null,
      customers: Number.isFinite(plan.limits.customers) ? plan.limits.customers : null,
    },
    usage: {
      invoicesThisMonth: docs.invoicesThisMonth(user.id),
      customers: db.prepare('SELECT COUNT(*) AS n FROM customers WHERE user_id = ?').get(user.id).n,
    },
    subscription: {
      status: user.plan_status,
      interval: user.plan_interval,
      currentPeriodEnd: user.current_period_end,
      cancelAtPeriodEnd: Boolean(user.cancel_at_period_end),
    },
    billingMode: billing.isLive() ? 'stripe' : 'demo',
  };
}

function requireFeature(feature) {
  return (req, res, next) => {
    if (!planFor(req.user).features[feature]) {
      return res.status(402).json({ error: 'Diese Funktion ist in deinem Plan nicht enthalten.', upgrade: true, feature });
    }
    next();
  };
}

// ---------- Öffentlich ----------
app.get('/api/plans', (req, res) => res.json({ plans: publicPlans(), trialDays: Number(process.env.TRIAL_DAYS ?? 14) }));

app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    if (!auth.rateLimit(`reg:${req.ip}`, 10)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte kurz.' });
    const email = str(req.body.email, 200).toLowerCase();
    const password = String(req.body.password || '');
    const name = str(req.body.name, 100);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    if (password.length < 8) return res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'Für diese E-Mail gibt es schon ein Konto.' });
    }
    const result = db
      .prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)')
      .run(email, auth.hashPassword(password), name, Date.now());
    const userId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, owner, email) VALUES (?, ?, ?)').run(userId, name, email);
    auth.createSession(res, userId);
    res.status(201).json({ ok: true });
  })
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    if (!auth.rateLimit(`login:${req.ip}:${email}`, 8)) {
      return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte versuche es in 15 Minuten erneut.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !auth.verifyPassword(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
    }
    auth.createSession(res, user.id);
    res.json({ ok: true });
  })
);

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------- Ab hier: angemeldet ----------
app.use('/api', auth.requireAuth);

app.get('/api/me', (req, res) => res.json(userPayload(req.user)));

app.put(
  '/api/me/password',
  wrap(async (req, res) => {
    const { current, next } = req.body;
    if (!auth.verifyPassword(String(current || ''), req.user.password_hash)) {
      return res.status(400).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
    }
    if (String(next || '').length < 8) return res.status(400).json({ error: 'Das neue Passwort muss mindestens 8 Zeichen haben.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(String(next)), req.user.id);
    res.json({ ok: true });
  })
);

app.delete('/api/me', (req, res) => {
  if (req.user.plan_status === 'active' && billing.isLive() && req.user.plan !== 'free') {
    return res.status(400).json({ error: 'Bitte kündige zuerst dein Abo im Kundenportal.' });
  }
  auth.destroySession(req, res);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Profil / Firmendaten
const PROFILE_FIELDS = {
  company: 120, owner: 120, street: 120, zip: 12, city: 80, country: 60, email: 120, phone: 40, website: 120,
  tax_number: 40, vat_id: 40, bank: 80, iban: 40, bic: 20, invoice_prefix: 10, quote_prefix: 10, footer_note: 500,
};

app.get('/api/profile', (req, res) => {
  res.json(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id));
});

app.put('/api/profile', (req, res) => {
  const b = req.body;
  const plan = planFor(req.user);
  const current = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  const values = {};
  for (const [field, max] of Object.entries(PROFILE_FIELDS)) values[field] = b[field] !== undefined ? str(b[field], max) : current[field];
  values.small_business = b.small_business !== undefined ? (b.small_business ? 1 : 0) : current.small_business;
  values.default_tax_rate = [0, 7, 19].includes(Number(b.default_tax_rate)) ? Number(b.default_tax_rate) : current.default_tax_rate;
  values.payment_days = Math.min(Math.max(parseInt(b.payment_days, 10) || current.payment_days, 0), 120);
  values.accent = /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : current.accent;
  if (b.next_invoice_number) values.next_invoice_number = Math.max(1, parseInt(b.next_invoice_number, 10) || 1);
  if (b.logo !== undefined) {
    if (b.logo && !plan.features.logo) return res.status(402).json({ error: 'Eigenes Logo gibt es ab dem Pro-Plan.', upgrade: true });
    if (b.logo && !/^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo)) {
      return res.status(400).json({ error: 'Bitte lade ein PNG-, JPG-, WebP- oder SVG-Bild hoch.' });
    }
    if (b.logo && b.logo.length > 700000) return res.status(400).json({ error: 'Das Logo ist zu groß (max. 500 KB).' });
    values.logo = b.logo || null;
  }
  const keys = Object.keys(values);
  db.prepare(`UPDATE profiles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(
    ...keys.map((k) => values[k]),
    req.user.id
  );
  if (b.owner !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(values.owner, req.user.id);
  res.json(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id));
});

// Kunden
function customerValues(b) {
  return {
    name: str(b.name, 160),
    contact: str(b.contact, 120),
    email: str(b.email, 160),
    street: str(b.street, 160),
    zip: str(b.zip, 12),
    city: str(b.city, 80),
    country: str(b.country, 60) || 'Deutschland',
    vat_id: str(b.vat_id, 40),
  };
}

app.get('/api/customers', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COALESCE(SUM(total),0) FROM documents d WHERE d.customer_id = c.id AND d.type='invoice' AND d.status='paid') AS revenue,
       (SELECT COUNT(*) FROM documents d WHERE d.customer_id = c.id AND d.type='invoice') AS invoice_count
       FROM customers c WHERE c.user_id = ? ORDER BY c.name COLLATE NOCASE`
    )
    .all(req.user.id);
  res.json(rows);
});

app.post('/api/customers', (req, res) => {
  const plan = planFor(req.user);
  const count = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE user_id = ?').get(req.user.id).n;
  if (count >= plan.limits.customers) {
    return res.status(402).json({ error: `Im ${plan.name}-Plan sind ${plan.limits.customers} Kunden enthalten.`, upgrade: true });
  }
  const v = customerValues(req.body);
  if (!v.name) return res.status(400).json({ error: 'Bitte gib einen Namen ein.' });
  const r = db
    .prepare('INSERT INTO customers (user_id, name, contact, email, street, zip, city, country, vat_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, v.name, v.contact, v.email, v.street, v.zip, v.city, v.country, v.vat_id, Date.now());
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/customers/:id', (req, res) => {
  const v = customerValues(req.body);
  if (!v.name) return res.status(400).json({ error: 'Bitte gib einen Namen ein.' });
  const r = db
    .prepare('UPDATE customers SET name=?, contact=?, email=?, street=?, zip=?, city=?, country=?, vat_id=? WHERE id = ? AND user_id = ?')
    .run(v.name, v.contact, v.email, v.street, v.zip, v.city, v.country, v.vat_id, req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

app.delete('/api/customers/:id', (req, res) => {
  const r = db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
  res.json({ ok: true });
});

// Dokumente (Rechnungen & Angebote)
app.get('/api/documents', (req, res) => {
  const type = req.query.type === 'quote' ? 'quote' : 'invoice';
  const rows = db
    .prepare('SELECT * FROM documents WHERE user_id = ? AND type = ? ORDER BY issue_date DESC, id DESC')
    .all(req.user.id, type)
    .map(docs.serialize);
  res.json(rows);
});

app.get('/api/documents/:id', (req, res) => {
  const doc = docs.getDoc(req.user.id, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  res.json(docs.serialize(doc));
});

function checkCreate(req, res, type) {
  const plan = planFor(req.user);
  if (type === 'quote' && !plan.features.quotes) {
    res.status(402).json({ error: 'Angebote gibt es ab dem Pro-Plan.', upgrade: true, feature: 'quotes' });
    return false;
  }
  if (type === 'invoice' && docs.invoicesThisMonth(req.user.id) >= plan.limits.invoicesPerMonth) {
    res.status(402).json({
      error: `Du hast dein Limit von ${plan.limits.invoicesPerMonth} Rechnungen in diesem Monat erreicht.`,
      upgrade: true,
      feature: 'invoices',
    });
    return false;
  }
  return true;
}

app.post('/api/documents', (req, res) => {
  const type = req.body.type === 'quote' ? 'quote' : 'invoice';
  if (!checkCreate(req, res, type)) return;
  const id = docs.createDocument(req.user.id, { ...req.body, type });
  res.status(201).json(docs.serialize(docs.getDoc(req.user.id, id)));
});

app.put('/api/documents/:id', (req, res) => {
  const doc = docs.updateDocument(req.user.id, req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  res.json(docs.serialize(doc));
});

app.post('/api/documents/:id/status', (req, res) => {
  const doc = docs.setStatus(req.user.id, req.params.id, str(req.body.status, 20));
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  res.json(docs.serialize(doc));
});

app.post('/api/documents/:id/duplicate', (req, res) => {
  const src = docs.getDoc(req.user.id, req.params.id);
  if (!src) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  const type = req.body.type === 'invoice' ? 'invoice' : src.type;
  if (!checkCreate(req, res, type)) return;
  if (!src.customer_id) return res.status(400).json({ error: 'Der Kunde dieses Dokuments existiert nicht mehr.' });
  const id = docs.createDocument(
    req.user.id,
    { type, customer_id: src.customer_id, items: JSON.parse(src.items), title: src.title, intro: type === src.type ? src.intro : '', notes: src.notes },
    { source_id: src.id }
  );
  if (src.type === 'quote' && type === 'invoice') docs.setStatus(req.user.id, src.id, 'accepted');
  res.status(201).json(docs.serialize(docs.getDoc(req.user.id, id)));
});

app.post('/api/documents/:id/reminder', requireFeature('reminders'), (req, res) => {
  const doc = docs.getDoc(req.user.id, req.params.id);
  if (!doc || doc.type !== 'invoice') return res.status(404).json({ error: 'Rechnung nicht gefunden.' });
  db.prepare('UPDATE documents SET reminder_level = MIN(reminder_level + 1, 3), updated_at = ? WHERE id = ?').run(Date.now(), doc.id);
  res.json(docs.serialize(docs.getDoc(req.user.id, doc.id)));
});

app.delete('/api/documents/:id', (req, res) => {
  const doc = docs.getDoc(req.user.id, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  if (doc.type === 'invoice' && doc.status !== 'draft') {
    return res.status(400).json({ error: 'Versendete Rechnungen können nicht gelöscht werden – storniere sie stattdessen.' });
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  res.json({ ok: true });
});

// Dashboard-Kennzahlen
app.get('/api/stats', (req, res) => {
  const uid = req.user.id;
  const today = docs.today();
  const year = today.slice(0, 4);
  const one = (sql, ...p) => db.prepare(sql).get(uid, ...p);
  const open = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM documents WHERE user_id=? AND type='invoice' AND status='sent' AND due_date >= ?", today);
  const overdue = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM documents WHERE user_id=? AND type='invoice' AND status='sent' AND due_date < ?", today);
  const paidYear = one("SELECT COALESCE(SUM(total),0) s, COALESCE(SUM(subtotal),0) net FROM documents WHERE user_id=? AND type='invoice' AND status='paid' AND substr(paid_at,1,4)=?", year);
  const quotes = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM documents WHERE user_id=? AND type='quote' AND status='open'");
  const months = [];
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    const row = one("SELECT COALESCE(SUM(subtotal),0) s FROM documents WHERE user_id=? AND type='invoice' AND status='paid' AND substr(paid_at,1,7)=?", m);
    months.push({ month: m, revenue: docs.round(row.s) });
  }
  const recent = db
    .prepare("SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC LIMIT 6")
    .all(uid)
    .map(docs.serialize);
  res.json({ open, overdue, paidYear, quotes, months, recent });
});

// CSV-Export für die Steuerberatung
app.get('/api/export.csv', requireFeature('csvExport'), (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : docs.today().slice(0, 4);
  const rows = db
    .prepare("SELECT * FROM documents WHERE user_id = ? AND type = 'invoice' AND substr(issue_date,1,4) = ? ORDER BY issue_date, id")
    .all(req.user.id, year)
    .map(docs.serialize);
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // Schutz vor Formel-Injection in Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const num = (n) => Number(n).toFixed(2).replace('.', ',');
  const header = ['Rechnungsnummer', 'Datum', 'Fällig', 'Kunde', 'USt-IdNr. Kunde', 'Netto', 'USt', 'Brutto', 'Status', 'Bezahlt am'];
  const statusDe = { draft: 'Entwurf', sent: 'Offen', overdue: 'Überfällig', paid: 'Bezahlt', cancelled: 'Storniert' };
  const lines = [header.map(cell).join(';')].concat(
    rows.map((r) =>
      [r.number, r.issue_date, r.due_date, r.customer.name, r.customer.vat_id, num(r.subtotal), num(r.tax), num(r.total), statusDe[r.status], r.paid_at]
        .map(cell)
        .join(';')
    )
  );
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="rechnungen-${year}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

// Wiederkehrende Rechnungen (Business)
app.get('/api/recurring', (req, res) => {
  const rows = db
    .prepare('SELECT r.*, c.name AS customer_name FROM recurring r JOIN customers c ON c.id = r.customer_id WHERE r.user_id = ? ORDER BY r.next_date')
    .all(req.user.id)
    .map((r) => ({ ...r, items: JSON.parse(r.items), active: Boolean(r.active) }));
  res.json(rows);
});

app.post('/api/recurring', requireFeature('recurring'), (req, res) => {
  const b = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(b.customer_id, req.user.id);
  if (!customer) return res.status(400).json({ error: 'Bitte wähle einen Kunden aus.' });
  if (!['monthly', 'quarterly', 'yearly'].includes(b.interval)) return res.status(400).json({ error: 'Ungültiges Intervall.' });
  const profile = db.prepare('SELECT default_tax_rate FROM profiles WHERE user_id = ?').get(req.user.id);
  const items = docs.normalizeItems(b.items, profile.default_tax_rate);
  if (!items.length) return res.status(400).json({ error: 'Füge mindestens eine Position hinzu.' });
  const next = /^\d{4}-\d{2}-\d{2}$/.test(b.next_date) && b.next_date >= docs.today() ? b.next_date : docs.today();
  db.prepare('INSERT INTO recurring (user_id, customer_id, title, items, interval, next_date, created_at) VALUES (?,?,?,?,?,?,?)').run(
    req.user.id, customer.id, str(b.title, 200), JSON.stringify(items), b.interval, next, Date.now()
  );
  docs.runRecurring();
  res.status(201).json({ ok: true });
});

app.post('/api/recurring/:id/toggle', requireFeature('recurring'), (req, res) => {
  const r = db.prepare('UPDATE recurring SET active = 1 - active WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Nicht gefunden.' });
  res.json({ ok: true });
});

app.delete('/api/recurring/:id', (req, res) => {
  db.prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Abo / Billing
app.post(
  '/api/billing/checkout',
  wrap(async (req, res) => {
    const plan = ['pro', 'business'].includes(req.body.plan) ? req.body.plan : null;
    const interval = req.body.interval === 'yearly' ? 'yearly' : 'monthly';
    if (!plan) return res.status(400).json({ error: 'Unbekannter Plan.' });
    res.json(await billing.createCheckout(req.user, plan, interval, APP_URL));
  })
);

app.post(
  '/api/billing/portal',
  wrap(async (req, res) => res.json(await billing.createPortal(req.user, APP_URL)))
);

app.post('/api/billing/demo-cancel', (req, res) => {
  if (billing.isLive()) return res.status(400).json({ error: 'Bitte nutze das Kundenportal.' });
  billing.demoCancel(req.user);
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// ---------- Seiten ----------
const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { extensions: ['html'], index: 'index.html' }));
app.get('/app', (req, res) => res.sendFile(path.join(pub, 'app.html')));
app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Da ist etwas schiefgelaufen. Bitte versuche es erneut.' });
});

docs.runRecurring();
setInterval(docs.runRecurring, 3600000).unref();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Fakturo läuft auf ${APP_URL} (${billing.isLive() ? 'Stripe aktiv' : 'Demo-Modus ohne Zahlungen'})`);
  });
}

module.exports = app;
