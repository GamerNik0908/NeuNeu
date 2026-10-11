// Stripe-Anbindung ohne SDK: Checkout (Abo), Kundenportal und Webhooks.
// Ohne STRIPE_SECRET_KEY läuft alles im Demo-Modus.
const crypto = require('node:crypto');
const { db } = require('./db');

const env = process.env;
const isLive = () => Boolean(env.STRIPE_SECRET_KEY);

function priceId(plan, interval) {
  return env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`];
}

function planFromPrice(price) {
  for (const plan of ['pro', 'business']) {
    for (const interval of ['monthly', 'yearly']) {
      if (priceId(plan, interval) === price) return { plan, interval };
    }
  }
  return null;
}

// Stripe erwartet application/x-www-form-urlencoded mit verschachtelten Keys.
function encode(obj, prefix, out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encode(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return out.join('&');
}

async function stripe(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? encode(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe-Fehler');
  return data;
}

async function ensureCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripe('POST', '/customers', {
    email: user.email,
    name: user.name || undefined,
    metadata: { user_id: user.id },
  });
  db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customer.id, user.id);
  return customer.id;
}

async function createCheckout(user, plan, interval, appUrl) {
  if (!isLive()) {
    // Demo: Abo sofort aktivieren, damit die App vollständig ausprobiert werden kann.
    const period = interval === 'yearly' ? 365 : 30;
    db.prepare(
      `UPDATE users SET plan = ?, plan_interval = ?, plan_status = 'active', cancel_at_period_end = 0,
       current_period_end = ? WHERE id = ?`
    ).run(plan, interval, Math.floor(Date.now() / 1000) + period * 86400, user.id);
    return { url: `${appUrl}/app#/abo?checkout=success`, demo: true };
  }
  const price = priceId(plan, interval);
  if (!price) throw new Error('Für diesen Plan ist kein Stripe-Preis konfiguriert.');
  const customer = await ensureCustomer(user);
  const trialDays = Number(env.TRIAL_DAYS ?? 14);
  const hadSubscription = Boolean(user.stripe_subscription_id);
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: { 0: { price, quantity: 1 } },
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: 'true' },
    customer_update: { name: 'auto', address: 'auto' },
    subscription_data: {
      metadata: { user_id: user.id },
      trial_period_days: trialDays > 0 && !hadSubscription ? trialDays : undefined,
    },
    success_url: `${appUrl}/app#/abo?checkout=success`,
    cancel_url: `${appUrl}/app#/abo?checkout=cancel`,
  });
  return { url: session.url };
}

async function createPortal(user, appUrl) {
  if (!isLive()) return { url: `${appUrl}/app#/abo`, demo: true };
  const customer = await ensureCustomer(user);
  const portal = await stripe('POST', '/billing_portal/sessions', { customer, return_url: `${appUrl}/app#/abo` });
  return { url: portal.url };
}

// Beim Löschen des Kontos das Abo sofort beenden, damit nicht weiter abgebucht wird.
async function cancelImmediately(user) {
  if (!isLive() || !user.stripe_subscription_id) return;
  if (['canceled', 'incomplete_expired'].includes(user.plan_status)) return;
  await stripe('DELETE', `/subscriptions/${user.stripe_subscription_id}`);
}

function demoCancel(user) {
  db.prepare("UPDATE users SET plan = 'free', plan_status = 'canceled', plan_interval = NULL, current_period_end = NULL WHERE id = ?").run(user.id);
}

function applySubscription(sub) {
  const userId = Number(sub.metadata?.user_id) || null;
  const user = userId
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    : db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(sub.customer);
  if (!user) return;
  const item = sub.items?.data?.[0];
  const mapped = planFromPrice(item?.price?.id);
  const ended = ['canceled', 'incomplete_expired', 'unpaid'].includes(sub.status);
  const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;
  db.prepare(
    `UPDATE users SET plan = ?, plan_interval = ?, plan_status = ?, stripe_subscription_id = ?,
     stripe_customer_id = ?, current_period_end = ?, cancel_at_period_end = ? WHERE id = ?`
  ).run(
    ended || !mapped ? 'free' : mapped.plan,
    ended || !mapped ? null : mapped.interval,
    sub.status,
    sub.id,
    sub.customer,
    periodEnd,
    sub.cancel_at_period_end ? 1 : 0,
    user.id
  );
}

function verifySignature(rawBody, header, secret) {
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((p) => p.split('='))
      .filter((p) => p.length === 2)
  );
  const signatures = String(header || '')
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  if (!parts.t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return signatures.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

async function handleWebhook(rawBody, signature) {
  if (!env.STRIPE_WEBHOOK_SECRET || !verifySignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)) {
    const err = new Error('Ungültige Signatur');
    err.status = 400;
    throw err;
  }
  const event = JSON.parse(rawBody);
  const seen = db.prepare('INSERT OR IGNORE INTO stripe_events (id, received_at) VALUES (?, ?)').run(event.id, Date.now());
  if (seen.changes === 0) return;

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.mode === 'subscription' && obj.subscription) {
        const sub = await stripe('GET', `/subscriptions/${obj.subscription}`);
        if (!sub.metadata?.user_id && obj.client_reference_id) sub.metadata = { user_id: obj.client_reference_id };
        applySubscription(sub);
      }
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      applySubscription(obj);
      break;
    default:
      break;
  }
}

module.exports = { isLive, createCheckout, createPortal, cancelImmediately, demoCancel, handleWebhook, verifySignature };
