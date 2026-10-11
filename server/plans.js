// Zentrale Definition der Abo-Pläne. Preise in Euro.
// Die Limits werden serverseitig durchgesetzt und vom Frontend angezeigt.

const PLANS = {
  free: {
    id: 'free',
    name: 'Starter',
    price: { monthly: 0, yearly: 0 },
    limits: { invoicesPerMonth: 3, customers: 5 },
    features: {
      logo: false,
      quotes: false,
      reminders: false,
      csvExport: false,
      recurring: false,
      removeBranding: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 9, yearly: 84 },
    limits: { invoicesPerMonth: Infinity, customers: Infinity },
    features: {
      logo: true,
      quotes: true,
      reminders: true,
      csvExport: true,
      recurring: false,
      removeBranding: true,
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    price: { monthly: 19, yearly: 180 },
    limits: { invoicesPerMonth: Infinity, customers: Infinity },
    features: {
      logo: true,
      quotes: true,
      reminders: true,
      csvExport: true,
      recurring: true,
      removeBranding: true,
    },
  },
};

function planFor(user) {
  // Ein Abo zählt nur, solange es aktiv (oder in der Testphase) ist.
  const active = ['active', 'trialing', 'past_due', 'demo'].includes(user.plan_status);
  if (!active || !PLANS[user.plan]) return PLANS.free;
  if (user.current_period_end && user.current_period_end * 1000 < Date.now() - 3 * 86400000) {
    return PLANS.free;
  }
  return PLANS[user.plan];
}

function publicPlans() {
  return Object.values(PLANS).map((p) => ({
    ...p,
    limits: {
      invoicesPerMonth: Number.isFinite(p.limits.invoicesPerMonth) ? p.limits.invoicesPerMonth : null,
      customers: Number.isFinite(p.limits.customers) ? p.limits.customers : null,
    },
  }));
}

module.exports = { PLANS, planFor, publicPlans };
