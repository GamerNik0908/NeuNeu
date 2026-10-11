const fs = require('node:fs');
const path = require('node:path');

// .env laden (ohne zusätzliche Abhängigkeit)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const { backup } = require('./db');
const auth = require('./auth');
const billing = require('./billing');
const docs = require('./documents');
const demo = require('./demo');
const mailer = require('./mailer');
const account = require('./routes/account');
const documentRoutes = require('./routes/documents');
const { publicPlans } = require('./plans');
const { httpError } = require('./util');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PROD = process.env.NODE_ENV === 'production';
app.locals.appUrl = APP_URL;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

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

// Schreibende API-Aufrufe nur als JSON – zusammen mit SameSite-Cookies ein Schutz gegen CSRF.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type muss application/json sein.' });
  }
  res.set('Cache-Control', 'no-store');
  next();
});

// ---------- öffentlich ----------
app.get('/api/plans', (req, res) =>
  res.json({ plans: publicPlans(), trialDays: Number(process.env.TRIAL_DAYS ?? 14), emailEnabled: mailer.enabled() })
);
app.use('/api/auth', account.pub);

// ---------- angemeldet ----------
app.use('/api', auth.requireAuth);
app.use('/api', account.priv);
app.use('/api', documentRoutes);

app.post('/api/billing/checkout', async (req, res) => {
  if (req.user.is_demo) throw httpError(403, 'Im Demo-Konto kann kein Abo abgeschlossen werden. Erstelle zuerst dein kostenloses Konto.');
  const plan = ['pro', 'business'].includes(req.body.plan) ? req.body.plan : null;
  const interval = req.body.interval === 'yearly' ? 'yearly' : 'monthly';
  if (!plan) throw httpError(400, 'Unbekannter Plan.');
  res.json(await billing.createCheckout(req.user, plan, interval, APP_URL));
});

app.post('/api/billing/portal', async (req, res) => {
  if (req.user.is_demo) throw httpError(403, 'Im Demo-Konto nicht verfügbar.');
  res.json(await billing.createPortal(req.user, APP_URL));
});

app.post('/api/billing/demo-cancel', (req, res) => {
  if (billing.isLive()) throw httpError(400, 'Bitte nutze das Kundenportal.');
  if (req.user.is_demo) throw httpError(403, 'Im Demo-Konto nicht verfügbar.');
  billing.demoCancel(req.user);
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// ---------- Seiten ----------
const pub = path.join(__dirname, '..', 'public');
app.use(
  express.static(pub, {
    extensions: ['html'],
    index: 'index.html',
    setHeaders: (res, file) => {
      if (/\.(woff2|svg|png|jpg)$/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
    },
  })
);
app.get('/app', (req, res) => res.sendFile(path.join(pub, 'app.html')));
app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Die Daten sind zu groß.' });
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message, upgrade: err.upgrade, feature: err.feature, missing: err.missing });
  }
  if (err.status === 501) return res.status(501).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Da ist etwas schiefgelaufen. Bitte versuche es erneut.' });
});

// Hintergrundaufgaben
const hourly = () => {
  try {
    docs.runRecurring();
    demo.cleanupDemoAccounts();
  } catch (err) {
    console.error('Hintergrundaufgabe fehlgeschlagen:', err);
  }
};
hourly();
setInterval(hourly, 3600000).unref();
const daily = () => {
  try {
    backup();
  } catch (err) {
    console.error('Backup fehlgeschlagen:', err);
  }
};
setTimeout(daily, 5000).unref();
setInterval(daily, 6 * 3600000).unref();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Fakturo läuft auf ${APP_URL}`);
    console.log(`  Zahlungen:  ${billing.isLive() ? 'Stripe aktiv' : 'Demo-Modus (Upgrades ohne Zahlung)'}`);
    console.log(`  E-Mail:     ${mailer.enabled() ? 'SMTP aktiv' : 'nicht eingerichtet (Versand über eigenes E-Mail-Programm)'}`);
  });
}

module.exports = app;
