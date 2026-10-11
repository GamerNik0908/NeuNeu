// Kleine, überall genutzte Helfer.

// Kaufmännisch runden (ab ,5 weg von null) – symmetrisch, damit Storno und Original exakt aufgehen.
// toPrecision(15) entfernt Gleitkomma-Rauschen wie 438.99499999999995.
function round(n) {
  const a = Math.abs(Number(n) || 0);
  if (a === 0) return 0;
  let r = Math.round(Number(`${a.toPrecision(15)}e2`)) / 100;
  if (!Number.isFinite(r)) r = Math.round(a * 100) / 100;
  return n < 0 ? -r : r;
}

// Datum in deutscher Zeit – sonst springt der Tag um Mitternacht falsch (Server laufen meist in UTC).
const berlinDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => berlinDate.format(new Date());

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
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

const dateDe = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const eur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const numDe = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 3 });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

module.exports = { round, today, isDate, addDays, addInterval, dateDe, eur, numDe, str, httpError };
