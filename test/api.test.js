process.env.DB_FILE = ':memory:';
delete process.env.STRIPE_SECRET_KEY;
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const app = require('../server/index.js');
const { verifySignature } = require('../server/billing.js');
const { totals, addInterval } = require('../server/documents.js');

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
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}

test('Steuerberechnung & Intervalle', () => {
  assert.deepEqual(totals([{ quantity: 2, price: 100, taxRate: 19 }, { quantity: 1, price: 50, taxRate: 7 }], false), { subtotal: 250, tax: 41.5, total: 291.5 });
  assert.deepEqual(totals([{ quantity: 3, price: 33.33, taxRate: 19 }], true), { subtotal: 99.99, tax: 0, total: 99.99 });
  assert.equal(addInterval('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addInterval('2026-11-15', 'quarterly'), '2027-02-15');
});

test('Webhook-Signatur', () => {
  const secret = 'whsec_test', body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifySignature(body, `t=${t},v1=${sig}`, secret));
  assert.ok(!verifySignature(body, `t=${t},v1=${'0'.repeat(64)}`, secret));
  assert.ok(!verifySignature(body + 'x', `t=${t},v1=${sig}`, secret));
});

test('Kompletter Ablauf: Registrierung, Limits, Upgrade', async () => {
  const api = client();
  assert.equal((await api('/api/me')).status, 401);
  assert.equal((await api('/api/auth/register', { body: { email: 'a@b.de', password: 'kurz' } })).status, 400);
  assert.equal((await api('/api/auth/register', { body: { email: 'lena@example.de', password: 'geheim1234', name: 'Lena Weber' } })).status, 201);
  let me = (await api('/api/me')).data;
  assert.equal(me.plan, 'free');

  await api('/api/profile', { method: 'PUT', body: { company: 'Weber Design', street: 'Hafenstr. 1', zip: '20457', city: 'Hamburg', iban: 'DE02120300000000202051' } });
  const cust = (await api('/api/customers', { body: { name: 'Nordlicht GmbH', email: 'info@nordlicht.de' } })).data;
  assert.ok(cust.id);

  const items = [{ description: 'Webdesign', quantity: 10, unit: 'Std.', price: 85, taxRate: 19 }];
  const inv = (await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items } })).data;
  assert.equal(inv.number, `RE-${new Date().getFullYear()}-0001`);
  assert.equal(inv.total, 1011.5);
  assert.equal(inv.status, 'draft');

  // Entwurf änderbar, versendet nicht mehr
  assert.equal((await api(`/api/documents/${inv.id}`, { method: 'PUT', body: { items: [{ ...items[0], quantity: 2 }] } })).data.total, 202.3);
  await api(`/api/documents/${inv.id}/status`, { body: { status: 'sent' } });
  assert.equal((await api(`/api/documents/${inv.id}`, { method: 'PUT', body: { items } })).status, 400);
  assert.equal((await api(`/api/documents/${inv.id}`, { method: 'DELETE' })).status, 400);

  // Pro-Funktionen gesperrt
  assert.equal((await api('/api/documents', { body: { type: 'quote', customer_id: cust.id, items } })).status, 402);
  assert.equal((await api(`/api/documents/${inv.id}/reminder`, { body: {} })).status, 402);
  assert.equal((await api('/api/export.csv')).status, 402);

  // Limit: 3 Rechnungen pro Monat
  await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items } });
  await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items } });
  const blocked = await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items } });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.data.feature, 'invoices');

  // Upgrade (Demo-Modus)
  const co = (await api('/api/billing/checkout', { body: { plan: 'pro', interval: 'monthly' } })).data;
  assert.ok(co.demo);
  me = (await api('/api/me')).data;
  assert.equal(me.plan, 'pro');
  assert.equal((await api('/api/documents', { body: { type: 'invoice', customer_id: cust.id, items } })).status, 201);
  const quote = (await api('/api/documents', { body: { type: 'quote', customer_id: cust.id, items } })).data;
  assert.match(quote.number, /^AN-/);
  const converted = (await api(`/api/documents/${quote.id}/duplicate`, { body: { type: 'invoice' } })).data;
  assert.equal(converted.type, 'invoice');
  assert.equal((await api(`/api/documents/${quote.id}`)).data.status, 'accepted');
  assert.equal((await api(`/api/documents/${inv.id}/reminder`, { body: {} })).data.reminder_level, 1);

  await api(`/api/documents/${inv.id}/status`, { body: { status: 'paid' } });
  const stats = (await api('/api/stats')).data;
  assert.equal(stats.paidYear.s, 202.3);

  const csv = await api(`/api/export.csv?year=${new Date().getFullYear()}`);
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Nordlicht GmbH/);

  // Wiederkehrend nur in Business
  const recBody = { customer_id: cust.id, interval: 'monthly', items: [{ description: 'Wartung', quantity: 1, price: 99 }] };
  assert.equal((await api('/api/recurring', { body: recBody })).status, 402);
  await api('/api/billing/checkout', { body: { plan: 'business', interval: 'yearly' } });
  assert.equal((await api('/api/recurring', { body: recBody })).status, 201);
  const rec = (await api('/api/recurring')).data;
  assert.equal(rec.length, 1);
  assert.ok(rec[0].next_date > new Date().toISOString().slice(0, 10), 'erste Rechnung wurde sofort erzeugt');

  // Fremde Daten nicht sichtbar
  const other = client();
  await other('/api/auth/register', { body: { email: 'max@example.de', password: 'geheim1234' } });
  assert.equal((await other(`/api/documents/${inv.id}`)).status, 404);
  assert.equal((await other('/api/customers')).data.length, 0);

  // Login/Logout
  await api('/api/auth/logout', { body: {} });
  assert.equal((await api('/api/me')).status, 401);
  assert.equal((await api('/api/auth/login', { body: { email: 'lena@example.de', password: 'falsch123' } })).status, 401);
  assert.equal((await api('/api/auth/login', { body: { email: 'LENA@example.de', password: 'geheim1234' } })).status, 200);
});

test('Schreibende Requests ohne JSON werden abgelehnt', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
  assert.equal(res.status, 415);
});
