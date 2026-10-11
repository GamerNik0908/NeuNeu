process.env.DB_FILE = ':memory:';
process.env.MAIL_TRANSPORT = 'memory';
delete process.env.STRIPE_SECRET_KEY;
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const app = require('../server/index.js');
const { verifySignature } = require('../server/billing.js');
const { totals } = require('../server/documents.js');
const { addInterval, today } = require('../server/util.js');
const { validIban } = require('../server/routes/account.js');
const mailer = require('../server/mailer.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

function client() {
  let cookie = '';
  return async (path, { method, body } = {}) => {
    const res = await fetch(base + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
}

const PROFILE = {
  company: 'Weber Design', owner: 'Lena Weber', street: 'Hafenstraße 12', zip: '20457', city: 'Hamburg',
  email: 'lena@weber.example', phone: '040 123456', tax_number: '12/345/67890', iban: 'DE02120300000000202051',
};
const ITEMS = [{ description: 'Webdesign', quantity: 10, unit: 'Std.', price: 85, taxRate: 19 }];

async function signup(email) {
  const api = client();
  assert.equal((await api('/api/auth/register', { body: { email, password: 'geheim1234', name: 'Lena Weber', terms: true } })).status, 201);
  return api;
}

test('Rechenlogik, Intervalle, IBAN-Prüfung', () => {
  assert.deepEqual(
    totals([{ quantity: 2, price: 100, taxRate: 19 }, { quantity: 1, price: 50, taxRate: 7 }]),
    { subtotal: 250, tax: 41.5, total: 291.5, groups: [{ rate: 19, net: 200, tax: 38 }, { rate: 7, net: 50, tax: 3.5 }] }
  );
  assert.equal(totals([{ quantity: 3, price: 33.33, taxRate: 19 }], 'small_business').tax, 0);
  // Rundung muss symmetrisch sein, sonst geht eine Stornorechnung nicht exakt auf
  const pos = totals([{ quantity: 1, price: 2310.5, taxRate: 19 }]);
  const neg = totals([{ quantity: 1, price: -2310.5, taxRate: 19 }]);
  assert.equal(pos.tax, 439);
  assert.equal(neg.total, -pos.total);
  assert.equal(totals([{ quantity: 3, price: 0.1, taxRate: 0 }]).total, 0.3);
  assert.equal(totals([{ quantity: 1.005, price: 100, taxRate: 0 }]).total, 100.5);
  assert.equal(addInterval('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addInterval('2026-11-15', 'quarterly'), '2027-02-15');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(validIban('DE02 1203 0000 0000 2020 51'));
  assert.ok(!validIban('DE02 1203 0000 0000 2020 52'));
});

test('Webhook-Signatur', () => {
  const secret = 'whsec_test', body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifySignature(body, `t=${t},v1=${sig}`, secret));
  assert.ok(!verifySignature(body, `t=${t},v1=${'0'.repeat(64)}`, secret));
  assert.ok(!verifySignature(body + 'x', `t=${t},v1=${sig}`, secret));
});

test('Registrierung braucht AGB-Bestätigung und gültige Daten', async () => {
  const api = client();
  assert.equal((await api('/api/me')).status, 401);
  assert.equal((await api('/api/auth/register', { body: { email: 'x@y.de', password: 'geheim1234', name: 'X' } })).status, 400);
  assert.equal((await api('/api/auth/register', { body: { email: 'x@y.de', password: 'kurz', name: 'X', terms: true } })).status, 400);
  await signup('dup@example.de');
  assert.equal((await api('/api/auth/register', { body: { email: 'DUP@example.de', password: 'geheim1234', name: 'X', terms: true } })).status, 409);
});

test('Rechnungs-Lebenszyklus: Entwurf → Abschließen → Versand → Bezahlt → Storno', async () => {
  const api = await signup('lena@example.de');
  const cust = (await api('/api/customers', { body: { name: 'Nordlicht GmbH', email: 'info@nordlicht.example', street: 'Speicherstadt 4', zip: '20457', city: 'Hamburg', country: 'DE' } })).data;
  assert.equal(cust.number, 'K-1001');

  // Entwurf hat noch keine Nummer
  const draft = (await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items: ITEMS } })).data;
  assert.equal(draft.number, '');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.total, 1011.5);

  // Ohne Firmendaten kein Abschluss (Pflichtangaben § 14 UStG)
  const missing = await api(`/api/documents/${draft.id}/finalize`, { body: {} });
  assert.equal(missing.status, 422);
  assert.ok(missing.data.missing.some((m) => m.field === 'tax_number'));

  assert.equal((await api('/api/profile', { method: 'PUT', body: { ...PROFILE, iban: 'DE00 1234' } })).status, 400);
  assert.equal((await api('/api/profile', { method: 'PUT', body: PROFILE })).data.iban, 'DE02 1203 0000 0000 2020 51');

  // Entwurf-PDF hat Wasserzeichen, aber keine E-Rechnung
  const draftPdf = await api(`/api/documents/${draft.id}/pdf`);
  assert.equal(draftPdf.status, 200);
  assert.ok(!draftPdf.data.includes('factur-x.xml'));

  // Gelöschte Entwürfe hinterlassen keine Lücke
  const throwaway = (await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items: ITEMS } })).data;
  assert.equal((await api(`/api/documents/${throwaway.id}`, { method: 'DELETE' })).status, 200);

  // Versand per E-Mail schließt ab und hängt PDF an
  const sent = await api(`/api/documents/${draft.id}/send`, {
    body: { to: 'info@nordlicht.example', subject: 'Rechnung', message: 'Hallo', copyToMe: true, attachXRechnung: true },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const year = new Date().getFullYear();
  assert.equal(sent.data.number, `RE-${year}-0001`);
  assert.equal(sent.data.status, 'sent');
  const mail = mailer.sent.at(-1);
  assert.deepEqual(mail.attachments, [`Rechnung_RE-${year}-0001.pdf`, `Rechnung_RE-${year}-0001_XRechnung.xml`]);
  assert.equal(mail.replyTo, 'lena@weber.example');
  assert.equal(mail.bcc, 'lena@weber.example');

  // Abgeschlossen = unveränderbar, nicht löschbar
  assert.equal((await api(`/api/documents/${draft.id}`, { method: 'PUT', body: { items: ITEMS } })).status, 409);
  assert.equal((await api(`/api/documents/${draft.id}`, { method: 'DELETE' })).status, 400);

  // Absenderdaten sind eingefroren
  await api('/api/profile', { method: 'PUT', body: { street: 'Neue Straße 1' } });
  const detail = (await api(`/api/documents/${draft.id}`)).data;
  assert.equal(detail.seller.street, 'Hafenstraße 12');
  assert.deepEqual(detail.einvoice.zugferd, []);
  assert.ok(detail.events.some((e) => e.type === 'sent_email'));

  // PDF enthält ZUGFeRD, XRechnung ist abrufbar
  const pdf = await api(`/api/documents/${draft.id}/pdf`);
  assert.ok(pdf.data.includes('factur-x.xml'));
  assert.ok(pdf.data.includes('PDF/A') || pdf.data.includes('pdfaid'));
  const xml = await api(`/api/documents/${draft.id}/xrechnung.xml`);
  assert.equal(xml.status, 200);
  assert.match(xml.data, /xrechnung_3\.0/);
  assert.match(xml.data, /<ram:ID>RE-\d{4}-0001<\/ram:ID>/);

  // Bezahlt + Storno
  assert.equal((await api(`/api/documents/${draft.id}/status`, { body: { status: 'paid' } })).data.status, 'paid');
  assert.equal((await api(`/api/documents/${draft.id}/status`, { body: { status: 'draft' } })).status, 400);
  const storno = (await api(`/api/documents/${draft.id}/cancel`, { body: {} })).data;
  assert.equal(storno.kind, 'cancellation');
  assert.equal(storno.number, `RE-${year}-0002`);
  assert.equal(storno.total, -1011.5);
  assert.equal((await api(`/api/documents/${draft.id}`)).data.status, 'cancelled');
  const stornoXml = await api(`/api/documents/${storno.id}/xrechnung.xml`);
  assert.match(stornoXml.data, /<ram:TypeCode>381<\/ram:TypeCode>/);
  assert.match(stornoXml.data, /<ram:GrandTotalAmount>1011\.50<\/ram:GrandTotalAmount>/);

  const stats = (await api('/api/stats')).data;
  assert.equal(stats.open.n, 0);
  assert.equal(stats.paidYear.s, 0); // stornierte Rechnung zählt nicht als Umsatz
});

test('Kostenloses Limit greift beim Abschließen, Upgrade schaltet frei', async () => {
  const api = await signup('limit@example.de');
  await api('/api/profile', { method: 'PUT', body: PROFILE });
  const cust = (await api('/api/customers', { body: { name: 'Kunde', street: 'Weg 1', zip: '10115', city: 'Berlin', country: 'DE' } })).data;
  const make = async () => (await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items: ITEMS } })).data;
  for (let i = 0; i < 3; i++) assert.equal((await api(`/api/documents/${(await make()).id}/finalize`, { body: {} })).status, 200);
  const fourth = await make(); // Entwürfe sind unbegrenzt
  const blocked = await api(`/api/documents/${fourth.id}/finalize`, { body: {} });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.data.feature, 'invoices');
  assert.equal((await api('/api/documents', { body: { type: 'quote', customer_id: cust.id, items: ITEMS } })).status, 402);
  assert.equal((await api('/api/export.csv')).status, 402);
  assert.equal((await api('/api/profile', { method: 'PUT', body: { logo: 'data:image/png;base64,iVBORw0KGgo=' } })).status, 402);

  assert.ok((await api('/api/billing/checkout', { body: { plan: 'pro', interval: 'monthly' } })).data.demo);
  assert.equal((await api('/api/me')).data.plan, 'pro');
  assert.equal((await api(`/api/documents/${fourth.id}/finalize`, { body: {} })).status, 200);

  // Angebot → Rechnung
  const quote = (await api('/api/documents', { body: { type: 'quote', customer_id: cust.id, items: ITEMS } })).data;
  assert.match(quote.number, /^AN-/);
  const inv = (await api(`/api/documents/${quote.id}/duplicate`, { body: { type: 'invoice' } })).data;
  assert.equal(inv.type, 'invoice');
  assert.equal(inv.status, 'draft');
  assert.equal((await api(`/api/documents/${quote.id}`)).data.status, 'accepted');

  // Mahnung mit Versand
  const reminder = await api(`/api/documents/${fourth.id}/reminder`, { body: { send: true, to: 'kunde@example.de', subject: 'Erinnerung', message: 'Bitte zahlen' } });
  assert.equal(reminder.data.reminder_level, 1);

  const csv = await api(`/api/export.csv?year=${new Date().getFullYear()}`);
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Kunde/);
  assert.ok(!csv.data.includes('Entwurf'));

  // Vorschläge aus früheren Positionen
  const sugg = (await api('/api/items/suggestions')).data;
  assert.equal(sugg[0].description, 'Webdesign');
});

test('Steuerfälle: Reverse-Charge braucht USt-IdNr., Drittland ohne USt.', async () => {
  const api = await signup('steuer@example.de');
  await api('/api/profile', { method: 'PUT', body: PROFILE });
  const eu = (await api('/api/customers', { body: { name: 'Atelier SARL', street: '1 Rue', zip: '75001', city: 'Paris', country: 'FR', vat_id: 'FR40123456789' } })).data;
  const us = (await api('/api/customers', { body: { name: 'Acme Inc.', street: '1 Main St', zip: '10001', city: 'New York', country: 'US' } })).data;
  const rc = (await api('/api/documents', { body: { type: 'invoice', customer_id: eu.id, items: ITEMS } })).data;
  assert.equal(rc.tax_mode, 'reverse_charge');
  assert.equal(rc.tax, 0);
  const blocked = await api(`/api/documents/${rc.id}/finalize`, { body: {} });
  assert.equal(blocked.status, 422);
  assert.ok(blocked.data.missing.some((m) => m.field === 'vat_id'));
  await api('/api/profile', { method: 'PUT', body: { vat_id: 'DE 123 456 789' } });
  assert.equal((await api(`/api/documents/${rc.id}/finalize`, { body: {} })).status, 200);
  const o = (await api('/api/documents', { body: { type: 'invoice', customer_id: us.id, items: ITEMS } })).data;
  assert.equal(o.tax_mode, 'non_taxable');
  assert.equal(o.total, 850);
});

test('Demo-Konto mit Beispieldaten, ohne E-Mail-Versand und ohne Abo', async () => {
  const api = client();
  assert.equal((await api('/api/auth/demo', { body: {} })).status, 201);
  const me = (await api('/api/me')).data;
  assert.ok(me.isDemo);
  assert.equal(me.emailEnabled, false);
  const stats = (await api('/api/stats')).data;
  assert.ok(stats.paidYear.s > 0 || stats.months.some((m) => m.paid > 0));
  assert.equal(stats.overdue.n, 1);
  const invoices = (await api('/api/documents?type=invoice')).data;
  const open = invoices.find((d) => d.status === 'sent');
  assert.equal((await api(`/api/documents/${open.id}/send`, { body: { to: 'a@b.de', subject: 'x', message: 'y' } })).status, 403);
  assert.equal((await api('/api/billing/checkout', { body: { plan: 'pro' } })).status, 403);
  assert.equal((await api('/api/recurring')).data.length, 1);
});

test('Passwort vergessen & zurücksetzen', async () => {
  await signup('vergessen@example.de');
  const api = client();
  assert.equal((await api('/api/auth/forgot', { body: { email: 'vergessen@example.de' } })).status, 200);
  assert.equal((await api('/api/auth/forgot', { body: { email: 'gibtsnicht@example.de' } })).status, 200);
  const mail = mailer.sent.at(-1);
  const token = mail.text.match(/token=([A-Za-z0-9_-]+)/)[1];
  assert.equal((await api('/api/auth/reset', { body: { token: 'falsch', password: 'neuespasswort' } })).status, 400);
  assert.equal((await api('/api/auth/reset', { body: { token, password: 'neuespasswort' } })).status, 200);
  assert.equal((await api('/api/auth/reset', { body: { token, password: 'nochmalneu1' } })).status, 400, 'Token nur einmal gültig');
  assert.equal((await client()('/api/auth/login', { body: { email: 'vergessen@example.de', password: 'neuespasswort' } })).status, 200);
});

test('Daten anderer Nutzer sind nicht erreichbar', async () => {
  const a = await signup('a@example.de');
  const cust = (await a('/api/customers', { body: { name: 'Geheim', country: 'DE' } })).data;
  const doc = (await a('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items: ITEMS } })).data;
  const b = await signup('b@example.de');
  assert.equal((await b(`/api/documents/${doc.id}`)).status, 404);
  assert.equal((await b(`/api/documents/${doc.id}/pdf`)).status, 404);
  assert.equal((await b(`/api/customers/${cust.id}`, { method: 'PUT', body: { name: 'x', country: 'DE' } })).status, 404);
  assert.equal((await b('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items: ITEMS } })).status, 400);
  assert.equal((await b('/api/customers')).data.length, 0);
});

test('Schreibende Requests ohne JSON werden abgelehnt', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
  assert.equal(res.status, 415);
});
