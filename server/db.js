const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'fakturo.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Grundschema (Version 1). Änderungen kommen ausschließlich als Migration dazu,
// damit bestehende Datenbanken beim Update erhalten bleiben.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free',
  plan_interval TEXT,
  plan_status TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'Deutschland',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  tax_number TEXT NOT NULL DEFAULT '',
  vat_id TEXT NOT NULL DEFAULT '',
  bank TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bic TEXT NOT NULL DEFAULT '',
  small_business INTEGER NOT NULL DEFAULT 0,
  default_tax_rate REAL NOT NULL DEFAULT 19,
  payment_days INTEGER NOT NULL DEFAULT 14,
  invoice_prefix TEXT NOT NULL DEFAULT 'RE',
  quote_prefix TEXT NOT NULL DEFAULT 'AN',
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  next_quote_number INTEGER NOT NULL DEFAULT 1,
  accent TEXT NOT NULL DEFAULT '#1f4fd8',
  logo TEXT,
  footer_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'Deutschland',
  vat_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('invoice','quote')),
  number TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  service_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  small_business INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  total REAL NOT NULL,
  reminder_level INTEGER NOT NULL DEFAULT 0,
  source_id INTEGER,
  recurring_id INTEGER,
  paid_at TEXT,
  created_at INTEGER NOT NULL,
  created_at_iso TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, type, issue_date);

CREATE TABLE IF NOT EXISTS recurring (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('monthly','quarterly','yearly')),
  next_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
`);

const MIGRATIONS = [
  // 2: Entwürfe ohne Nummer, Stornorechnungen, Steuerfälle, E-Rechnung, Verlauf, Passwort-Reset, Demo-Konten
  () => {
    const add = (table, column, def) => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    };
    add('users', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
    add('users', 'accepted_terms_at', 'INTEGER');
    add('profiles', 'next_customer_number', 'INTEGER NOT NULL DEFAULT 1001');
    add('customers', 'number', "TEXT NOT NULL DEFAULT ''");
    add('customers', 'buyer_reference', "TEXT NOT NULL DEFAULT ''");
    add('documents', 'kind', "TEXT NOT NULL DEFAULT 'standard'");
    add('documents', 'tax_mode', "TEXT NOT NULL DEFAULT 'standard'");
    add('documents', 'reference', "TEXT NOT NULL DEFAULT ''");
    add('documents', 'service_from', 'TEXT');
    add('documents', 'service_to', 'TEXT');
    add('documents', 'seller', 'TEXT');
    add('documents', 'finalized_at', 'TEXT');
    add('documents', 'sent_at', 'TEXT');
    add('documents', 'cancelled_by', 'INTEGER');
    add('recurring', 'tax_mode', 'TEXT');

    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_doc ON events(document_id, created_at);
      CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_number ON documents(user_id, type, number) WHERE number <> '';
    `);

    // Altdaten übernehmen
    db.exec(`
      UPDATE documents SET tax_mode = 'small_business' WHERE small_business = 1;
      UPDATE documents SET finalized_at = created_at_iso WHERE type = 'invoice' AND status <> 'draft' AND finalized_at IS NULL;
      UPDATE documents SET number = '' WHERE type = 'invoice' AND status = 'draft';
    `);
    const { toCode } = require('./countries');
    for (const c of db.prepare('SELECT id, country FROM customers').all()) {
      db.prepare('UPDATE customers SET country = ? WHERE id = ?').run(toCode(c.country), c.id);
    }
    for (const p of db.prepare('SELECT user_id, country FROM profiles').all()) {
      db.prepare('UPDATE profiles SET country = ? WHERE user_id = ?').run(toCode(p.country), p.user_id);
    }
    // Kundennummern vergeben
    for (const u of db.prepare('SELECT user_id FROM profiles').all()) {
      let n = 1001;
      for (const c of db.prepare("SELECT id FROM customers WHERE user_id = ? AND number = '' ORDER BY id").all(u.user_id)) {
        db.prepare('UPDATE customers SET number = ? WHERE id = ?').run(`K-${n++}`, c.id);
      }
      db.prepare('UPDATE profiles SET next_customer_number = ? WHERE user_id = ?').run(n, u.user_id);
    }
  },
];

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const version = db.prepare('PRAGMA user_version').get().user_version || 1;
MIGRATIONS.forEach((migrate, i) => {
  const target = i + 2;
  if (version < target) {
    tx(() => {
      migrate();
      db.exec(`PRAGMA user_version = ${target}`);
    });
  }
});

// Tägliche Sicherung (die letzten 14 Tage bleiben erhalten).
function backup() {
  if (file === ':memory:') return;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `fakturo-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(target)) return;
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(dir).filter((f) => /^fakturo-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(path.join(dir, old));
}

module.exports = { db, tx, backup };
