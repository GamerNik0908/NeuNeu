// Demo-Konten: Besucher können die App ohne Registrierung mit Beispieldaten ausprobieren.
// Demo-Konten werden nach 24 Stunden automatisch gelöscht und können keine E-Mails versenden.
const crypto = require('node:crypto');
const { db } = require('./db');
const auth = require('./auth');
const docs = require('./documents');
const { today, addDays, addInterval } = require('./util');

const DEMO_HOURS = 24;

function createDemoAccount() {
  const id = crypto.randomBytes(6).toString('hex');
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, name, plan, plan_status, plan_interval, is_demo, created_at)
         VALUES (?, ?, ?, 'business', 'demo', 'monthly', 1, ?)`
      )
      .run(`demo-${id}@demo.fakturo.invalid`, auth.hashPassword(crypto.randomBytes(24).toString('hex')), 'Lena Weber', Date.now())
      .lastInsertRowid
  );
  db.prepare(
    `INSERT INTO profiles (user_id, company, owner, street, zip, city, country, email, phone, website, tax_number, vat_id,
     bank, iban, bic, payment_days, next_customer_number, footer_note)
     VALUES (?, 'Weber Design', 'Lena Weber', 'Hafenstraße 12', '20457', 'Hamburg', 'DE', 'hallo@weber-design.example',
     '+49 40 1234567', 'weber-design.example', '12/345/67890', 'DE123456789', 'Hamburger Sparkasse',
     'DE02 2005 0550 1234 5678 90', 'HASPDEHHXXX', 14, 1005, 'Vielen Dank für Ihr Vertrauen!')`
  ).run(userId);

  const customer = (number, c) =>
    Number(
      db
        .prepare(
          `INSERT INTO customers (user_id, number, name, contact, email, street, zip, city, country, vat_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(userId, number, c.name, c.contact || '', c.email, c.street, c.zip, c.city, c.country, c.vat_id || '', Date.now()).lastInsertRowid
    );
  const nordlicht = customer('K-1001', { name: 'Nordlicht Studio GmbH', contact: 'Jonas Berg', email: 'buchhaltung@nordlicht.example', street: 'Speicherstadt 4', zip: '20457', city: 'Hamburg', country: 'DE' });
  const baeckerei = customer('K-1002', { name: 'Bäckerei Sonnenkorn', contact: 'Maria Klein', email: 'info@sonnenkorn.example', street: 'Marktplatz 3', zip: '21073', city: 'Hamburg', country: 'DE' });
  const atelier = customer('K-1003', { name: 'Atelier Lumière SARL', email: 'compta@lumiere.example', street: '12 Rue de Rivoli', zip: '75004', city: 'Paris', country: 'FR', vat_id: 'FR40123456789' });
  const kanzlei = customer('K-1004', { name: 'Kanzlei Hoffmann & Partner', contact: 'Dr. Petra Hoffmann', email: 'kanzlei@hoffmann.example', street: 'Jungfernstieg 20', zip: '20354', city: 'Hamburg', country: 'DE' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const t = today();
  const invoice = (customerId, daysAgo, items, { paidAfter = null, title = '', open = false } = {}) => {
    const issue = addDays(t, -daysAgo);
    const id = docs.createDocument(userId, { type: 'invoice', customer_id: customerId, items, title, issue_date: issue, due_date: addDays(issue, 14) });
    docs.finalizeInvoice(user, id);
    db.prepare('UPDATE documents SET finalized_at = ?, sent_at = ? WHERE id = ?').run(issue, issue, id);
    if (paidAfter !== null && !open) docs.setStatus(userId, id, 'paid');
    if (paidAfter !== null && !open) db.prepare('UPDATE documents SET paid_at = ? WHERE id = ?').run(addDays(issue, paidAfter), id);
    docs.logEvent(userId, id, 'sent_email', 'buchhaltung@kunde.example');
    return id;
  };
  const hours = (h, rate = 85) => [{ description: 'Webdesign & Umsetzung', quantity: h, unit: 'Std.', price: rate, taxRate: 19 }];

  invoice(nordlicht, 165, hours(24), { paidAfter: 9, title: 'Website-Relaunch Phase 1' });
  invoice(kanzlei, 150, [{ description: 'Corporate Design: Logo & Geschäftsausstattung', quantity: 1, unit: 'Pauschal', price: 1450, taxRate: 19 }], { paidAfter: 12 });
  invoice(baeckerei, 128, hours(9, 75), { paidAfter: 5, title: 'Online-Shop Anpassungen' });
  invoice(nordlicht, 118, hours(31), { paidAfter: 14, title: 'Website-Relaunch Phase 2' });
  invoice(atelier, 96, [{ description: 'UX audit & recommendations', quantity: 3, unit: 'Tag', price: 720, taxRate: 19 }], { paidAfter: 10 });
  invoice(kanzlei, 80, [{ description: 'Website-Wartung (Juli – September)', quantity: 3, unit: 'Monat', price: 149, taxRate: 19 }], { paidAfter: 7 });
  invoice(nordlicht, 62, hours(18), { paidAfter: 11, title: 'Landingpage Herbstkampagne' });
  invoice(baeckerei, 47, [{ description: 'Fotoshooting Produktbilder', quantity: 1, unit: 'Pauschal', price: 690, taxRate: 19 }, { description: 'Bildbearbeitung', quantity: 4, unit: 'Std.', price: 65, taxRate: 19 }], { paidAfter: 6 });
  invoice(kanzlei, 33, hours(6, 95), { open: true, paidAfter: 0, title: 'Barrierefreiheit-Check' }); // überfällig
  invoice(atelier, 20, [{ description: 'Design system workshop', quantity: 2, unit: 'Tag', price: 780, taxRate: 19 }], { paidAfter: 8 });
  invoice(nordlicht, 6, hours(14), { open: true, paidAfter: 0, title: 'Newsletter-Templates' });
  invoice(baeckerei, 2, [{ description: 'Speisekarte Layout & Druckdaten', quantity: 1, unit: 'Pauschal', price: 380, taxRate: 19 }], { open: true, paidAfter: 0 });

  docs.createDocument(userId, { type: 'invoice', customer_id: kanzlei, items: hours(4, 95), title: 'Anpassungen Kontaktformular' });
  const q1 = docs.createDocument(userId, {
    type: 'quote',
    customer_id: nordlicht,
    title: 'App-Prototyp',
    items: [
      { description: 'Konzept & Wireframes', quantity: 2, unit: 'Tag', price: 720, taxRate: 19 },
      { description: 'UI-Design (12 Screens)', quantity: 1, unit: 'Pauschal', price: 2400, taxRate: 19 },
      { description: 'Klickbarer Prototyp in Figma', quantity: 1, unit: 'Pauschal', price: 650, taxRate: 19 },
    ],
  });
  docs.createDocument(userId, { type: 'quote', customer_id: baeckerei, title: 'Social-Media-Paket', items: [{ description: 'Content-Planung & 12 Beiträge pro Monat', quantity: 3, unit: 'Monat', price: 490, taxRate: 19 }] });
  docs.setStatus(userId, q1, 'open');

  db.prepare('INSERT INTO recurring (user_id, customer_id, title, items, interval, next_date, created_at) VALUES (?,?,?,?,?,?,?)').run(
    userId,
    kanzlei,
    'Website-Wartung',
    JSON.stringify([{ description: 'Website-Wartung & Sicherheitsupdates', quantity: 1, unit: 'Monat', price: 149, taxRate: 19 }]),
    'monthly',
    addInterval(t.slice(0, 8) + '01', 'monthly'),
    Date.now()
  );
  return userId;
}

function cleanupDemoAccounts() {
  db.prepare('DELETE FROM users WHERE is_demo = 1 AND created_at < ?').run(Date.now() - DEMO_HOURS * 3600000);
}

module.exports = { createDemoAccount, cleanupDemoAccounts, DEMO_HOURS };
