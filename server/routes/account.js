// Registrierung, Anmeldung, Passwort, Demo-Konto, Profil/Firmendaten
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const billing = require('../billing');
const mailer = require('../mailer');
const demo = require('../demo');
const docs = require('../documents');
const { planFor } = require('../plans');
const { COUNTRIES, EU, toCode } = require('../countries');
const { str, httpError } = require('../util');

const pub = express.Router();
const priv = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// IBAN-Prüfsumme (ISO 13616) – verhindert Tippfehler auf jeder Rechnung.
function validIban(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}
const formatIban = (iban) => iban.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

function userPayload(user) {
  const plan = planFor(user);
  return {
    id: user.id,
    email: user.is_demo ? 'demo@fakturo' : user.email,
    name: user.name,
    isDemo: Boolean(user.is_demo),
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
    emailEnabled: mailer.enabled() && !user.is_demo,
  };
}

// ---------- öffentlich ----------
pub.post('/register', (req, res) => {
  if (!auth.rateLimit(`reg:${req.ip}`, 10)) throw httpError(429, 'Zu viele Versuche. Bitte warte kurz.');
  const email = str(req.body.email, 200).toLowerCase();
  const password = String(req.body.password || '');
  const name = str(req.body.name, 100);
  if (!name) throw httpError(400, 'Bitte gib deinen Namen ein.');
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
  if (password.length < 8) throw httpError(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
  if (!req.body.terms) throw httpError(400, 'Bitte bestätige die AGB und die Datenschutzerklärung.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.');
  const userId = Number(
    db
      .prepare('INSERT INTO users (email, password_hash, name, created_at, accepted_terms_at) VALUES (?, ?, ?, ?, ?)')
      .run(email, auth.hashPassword(password), name, Date.now(), Date.now()).lastInsertRowid
  );
  db.prepare("INSERT INTO profiles (user_id, owner, email, country) VALUES (?, ?, ?, 'DE')").run(userId, name, email);
  auth.createSession(res, userId);
  res.status(201).json({ ok: true });
});

pub.post('/login', (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  if (!auth.rateLimit(`login:${req.ip}:${email}`, 8)) throw httpError(429, 'Zu viele Anmeldeversuche. Bitte versuche es in 15 Minuten erneut.');
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_demo = 0').get(email);
  if (!user || !auth.verifyPassword(String(req.body.password || ''), user.password_hash)) throw httpError(401, 'E-Mail oder Passwort ist falsch.');
  auth.createSession(res, user.id);
  res.json({ ok: true });
});

pub.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

pub.post('/demo', (req, res) => {
  if (!auth.rateLimit(`demo:${req.ip}`, 20, 3600000)) throw httpError(429, 'Zu viele Demo-Konten. Bitte versuche es später erneut.');
  const userId = demo.createDemoAccount();
  auth.createSession(res, userId, 1);
  res.status(201).json({ ok: true });
});

pub.post('/forgot', async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  if (!auth.rateLimit(`forgot:${req.ip}`, 5)) throw httpError(429, 'Zu viele Anfragen. Bitte warte kurz.');
  const user = EMAIL_RE.test(email) && db.prepare('SELECT * FROM users WHERE email = ? AND is_demo = 0').get(email);
  if (user) {
    const link = `${req.app.locals.appUrl}/reset?token=${auth.createPasswordReset(user.id)}`;
    if (mailer.enabled()) {
      await mailer.send({
        to: user.email,
        subject: 'Fakturo: Passwort zurücksetzen',
        text: `Hallo ${user.name || ''},\n\nüber den folgenden Link kannst du ein neues Passwort für Fakturo festlegen. Der Link ist eine Stunde gültig:\n\n${link}\n\nWenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren – dein Passwort bleibt unverändert.\n\nViele Grüße\nDein Fakturo-Team`,
      });
    } else {
      console.log(`[Passwort-Reset] E-Mail-Versand nicht eingerichtet. Link für ${user.email}: ${link}`);
    }
  }
  // Immer dieselbe Antwort – so lässt sich nicht herausfinden, welche E-Mails registriert sind.
  res.json({ ok: true, emailEnabled: mailer.enabled() });
});

pub.post('/reset', (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 8) throw httpError(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
  const userId = auth.consumePasswordReset(req.body.token, password);
  if (!userId) throw httpError(400, 'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.');
  auth.createSession(res, userId);
  res.json({ ok: true });
});

// ---------- angemeldet ----------
priv.get('/me', (req, res) => res.json(userPayload(req.user)));

priv.put('/me/password', (req, res) => {
  if (req.user.is_demo) throw httpError(403, 'Im Demo-Konto nicht möglich.');
  const { current, next } = req.body;
  if (!auth.verifyPassword(String(current || ''), req.user.password_hash)) throw httpError(400, 'Das aktuelle Passwort stimmt nicht.');
  if (String(next || '').length < 8) throw httpError(400, 'Das neue Passwort muss mindestens 8 Zeichen haben.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(String(next)), req.user.id);
  res.json({ ok: true });
});

priv.delete('/me', async (req, res) => {
  await billing.cancelImmediately(req.user);
  auth.destroySession(req, res);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

const PROFILE_FIELDS = {
  company: 120, owner: 120, street: 120, zip: 12, city: 80, email: 120, phone: 40, website: 120,
  tax_number: 40, vat_id: 40, bank: 80, iban: 42, bic: 11, invoice_prefix: 10, quote_prefix: 10, footer_note: 500,
};

priv.get('/profile', (req, res) => res.json(docs.getProfile(req.user.id)));

priv.put('/profile', (req, res) => {
  const b = req.body;
  const plan = planFor(req.user);
  const current = docs.getProfile(req.user.id);
  const v = {};
  for (const [field, max] of Object.entries(PROFILE_FIELDS)) v[field] = b[field] !== undefined ? str(b[field], max) : current[field];
  if (v.email && !EMAIL_RE.test(v.email)) throw httpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
  if (v.iban) {
    if (!validIban(v.iban)) throw httpError(400, 'Die IBAN ist ungültig – bitte prüfe sie noch einmal.');
    v.iban = formatIban(v.iban);
  }
  v.bic = v.bic.replace(/\s/g, '').toUpperCase();
  if (v.bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.bic)) throw httpError(400, 'Die BIC ist ungültig.');
  v.vat_id = v.vat_id.replace(/\s/g, '').toUpperCase();
  if (v.vat_id && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(v.vat_id)) throw httpError(400, 'Die USt-IdNr. hat ein ungültiges Format (z. B. DE123456789).');
  if (!/^[A-Za-z0-9-]{1,10}$/.test(v.invoice_prefix) || !/^[A-Za-z0-9-]{1,10}$/.test(v.quote_prefix)) {
    throw httpError(400, 'Präfixe dürfen nur Buchstaben, Ziffern und Bindestriche enthalten.');
  }
  v.country = b.country !== undefined ? toCode(b.country) : current.country;
  v.small_business = b.small_business !== undefined ? (b.small_business ? 1 : 0) : current.small_business;
  v.default_tax_rate = [0, 7, 19].includes(Number(b.default_tax_rate)) ? Number(b.default_tax_rate) : current.default_tax_rate;
  v.payment_days = b.payment_days !== undefined ? Math.min(Math.max(parseInt(b.payment_days, 10) || 0, 0), 120) : current.payment_days;
  v.accent = /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : current.accent;
  if (b.next_invoice_number !== undefined) {
    const n = parseInt(b.next_invoice_number, 10);
    if (!(n >= 1)) throw httpError(400, 'Die nächste Rechnungsnummer muss mindestens 1 sein.');
    // Zurückdrehen würde doppelte Nummern riskieren – nur Hochsetzen ist erlaubt (z. B. beim Umstieg).
    if (n < current.next_invoice_number) throw httpError(400, `Die Nummer kann nur erhöht werden (aktuell ${current.next_invoice_number}).`);
    v.next_invoice_number = n;
  }
  if (b.logo !== undefined) {
    if (b.logo && !plan.features.logo) throw httpError(402, 'Eigenes Logo gibt es ab dem Pro-Plan.', { upgrade: true, feature: 'logo' });
    if (b.logo && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.logo)) throw httpError(400, 'Bitte lade ein Bild hoch (PNG oder JPG).');
    if (b.logo && b.logo.length > 700000) throw httpError(400, 'Das Logo ist zu groß (max. 500 KB).');
    v.logo = b.logo || null;
  }
  const keys = Object.keys(v);
  db.prepare(`UPDATE profiles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...keys.map((k) => v[k]), req.user.id);
  if (b.owner !== undefined && v.owner) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(v.owner, req.user.id);
  res.json(docs.getProfile(req.user.id));
});

priv.get('/meta', (req, res) => {
  res.json({
    countries: COUNTRIES,
    eu: EU,
    taxModes: Object.fromEntries(Object.entries(docs.TAX_MODES).map(([k, m]) => [k, { label: m.label, note: m.note }])),
  });
});

module.exports = { pub, priv, validIban, userPayload };
