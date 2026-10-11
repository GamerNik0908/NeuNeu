(() => {
  'use strict';

  // ---------- Hilfsfunktionen ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const eur = (n) => eurFmt.format(Number(n) || 0);
  const numDe = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const dateDe = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
  const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const parseNum = (v) => {
    const s = String(v ?? '').trim().replace(/\s|€/g, '');
    if (!s) return 0;
    const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const todayIso = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const addDays = (iso, days) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + Number(days));
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const monthName = (ym) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short' });
  const initials = (s) => String(s || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  const svg = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const I = {
    home: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
    invoice: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
    quote: svg('<path d="M4 4h16v12H5.2L4 17.2z"/><path d="m9 10 2 2 4-4"/>'),
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    repeat: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    card: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
    download: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
    mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 'stroke-width="2.6"'),
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    back: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
    star: svg('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    ban: svg('<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>'),
    convert: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M12 12l3 3-3 3"/>'),
  };
  const checkIcon = `<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

  const STATUS = {
    draft: 'Entwurf', sent: 'Offen', overdue: 'Überfällig', paid: 'Bezahlt', cancelled: 'Storniert',
    open: 'Offen', accepted: 'Angenommen', declined: 'Abgelehnt',
  };
  const badge = (s) => `<span class="badge b-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const INTERVALS = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich' };

  // ---------- Zustand & API ----------
  const S = { me: null, profile: null, plans: null, trialDays: 14 };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      location.href = '/login';
      throw Object.assign(new Error('Nicht angemeldet'), { handled: true });
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 402) {
      showUpsell(data.feature || 'generic', data.error);
      throw Object.assign(new Error(data.error), { handled: true });
    }
    if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
    return data;
  }

  const fail = (err) => {
    if (!err.handled) toast(err.message, true);
  };

  async function refreshMe() {
    S.me = await api('/api/me');
    renderChrome();
  }

  // ---------- UI-Bausteine ----------
  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' err' : ''}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function openModal(html, { wide = false } = {}) {
    closeModal();
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const backdrop = root.firstElementChild;
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && closeModal());
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
    const first = $('input, select, textarea, button.btn-primary', root);
    first?.focus();
    return $('.modal', root);
  }
  function closeModal() {
    $('#modalRoot').innerHTML = '';
  }
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

  const modalHead = (title, sub = '') =>
    `<div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted small" style="margin:4px 0 0">${esc(sub)}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Schließen">${I.x}</button></div>`;

  function confirmDialog(title, text, okLabel = 'Bestätigen', danger = false) {
    return new Promise((resolve) => {
      const m = openModal(
        `${modalHead(title)}<div class="modal-body"><p class="muted" style="margin:0">${esc(text)}</p></div>
        <div class="modal-foot"><button class="btn btn-secondary" data-act="no">Abbrechen</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(okLabel)}</button></div>`
      );
      m.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act) {
          closeModal();
          resolve(act === 'yes');
        }
      });
      $('[data-close]', m).addEventListener('click', () => resolve(false));
    });
  }

  const UPSELL = {
    invoices: { title: 'Dein Monatslimit ist erreicht', text: 'Im Starter-Plan sind 3 Rechnungen pro Monat enthalten. Mit Pro schreibst du so viele Rechnungen, wie du möchtest.', plan: 'pro' },
    customers: { title: 'Mehr Kunden mit Pro', text: 'Im Starter-Plan kannst du bis zu 5 Kunden anlegen. Mit Pro gibt es kein Limit.', plan: 'pro' },
    quotes: { title: 'Angebote gibt es ab Pro', text: 'Schreibe Angebote im gleichen Design und wandle sie nach der Zusage mit einem Klick in eine Rechnung um.', plan: 'pro' },
    logo: { title: 'Dein Logo auf jeder Rechnung', text: 'Mit Pro erscheinen deine Rechnungen mit eigenem Logo und ohne Fakturo-Hinweis – professioneller geht es nicht.', plan: 'pro' },
    reminders: { title: 'Schneller bezahlt werden', text: 'Mit Pro verschickst du höfliche Zahlungserinnerungen und Mahnungen als fertige Vorlage – ohne unangenehmes Formulieren.', plan: 'pro' },
    csvExport: { title: 'Export für die Steuer', text: 'Mit Pro exportierst du alle Rechnungen eines Jahres als CSV – perfekt für Steuerberatung und EÜR.', plan: 'pro' },
    recurring: { title: 'Rechnungen, die sich selbst schreiben', text: 'Mit Business erstellt Fakturo wiederkehrende Rechnungen für Retainer und Wartungsverträge automatisch.', plan: 'business' },
    generic: { title: 'Upgrade auf Pro', text: 'Schalte alle Funktionen frei und spare jeden Monat Stunden.', plan: 'pro' },
  };

  function showUpsell(feature, message) {
    const u = UPSELL[feature] || UPSELL.generic;
    const plan = u.plan;
    const price = plan === 'pro' ? '9 €' : '19 €';
    const perks =
      plan === 'pro'
        ? ['Unbegrenzt Rechnungen & Kunden', 'Angebote mit 1-Klick-Umwandlung', 'Eigenes Logo, ohne Fakturo-Hinweis', 'Zahlungserinnerungen & CSV-Export']
        : ['Alles aus Pro', 'Wiederkehrende Rechnungen automatisch', 'Monatlich, vierteljährlich, jährlich', 'Bevorzugter Support'];
    const m = openModal(
      `<div class="upsell">
        <div class="ico">${I.star}</div>
        <h2>${esc(u.title)}</h2>
        <p>${esc(feature === 'generic' && message ? message : u.text)}</p>
        <ul>${perks.map((p) => `<li>${checkIcon}<span>${esc(p)}</span></li>`).join('')}</ul>
        <button class="btn btn-primary btn-lg btn-block" data-checkout="${plan}">${S.trialDays ? `${S.trialDays} Tage gratis testen` : `Jetzt upgraden`}</button>
        <p class="small muted" style="margin:12px 0 0">Danach ${price}/Monat · monatlich kündbar</p>
        <button class="btn btn-ghost btn-sm mt" data-close>Vielleicht später</button>
      </div>`
    );
    $('[data-checkout]', m).addEventListener('click', (e) => startCheckout(plan, 'monthly', e.currentTarget));
  }

  async function startCheckout(plan, interval, button) {
    if (button) button.disabled = true;
    try {
      const r = await api('/api/billing/checkout', { body: { plan, interval } });
      if (r.demo) {
        closeModal();
        await refreshMe();
        location.hash = '#/abo?checkout=success';
        route();
      } else location.href = r.url;
    } catch (err) {
      fail(err);
      if (button) button.disabled = false;
    }
  }

  // ---------- Rahmen (Sidebar) ----------
  function renderChrome() {
    const me = S.me;
    const f = me.features;
    const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
    const items = [
      ['/', 'Übersicht', I.home],
      ['/rechnungen', 'Rechnungen', I.invoice],
      ['/angebote', 'Angebote', I.quote, !f.quotes && 'PRO'],
      ['/kunden', 'Kunden', I.users],
      ['/wiederkehrend', 'Wiederkehrend', I.repeat, !f.recurring && 'BUSINESS'],
      null,
      ['/einstellungen', 'Einstellungen', I.settings],
      ['/abo', 'Abo & Zahlung', I.card],
    ];
    const isActive = (p) => (p === '/' ? path === '/' : path.startsWith(p) || (p === '/rechnungen' && path.startsWith('/dokument')));
    $('#sideNav').innerHTML = items
      .map((it) =>
        it
          ? `<a href="#${it[0]}" class="${isActive(it[0]) ? 'active' : ''}">${it[2]}<span>${it[1]}</span>${it[3] ? `<span class="lock">${it[3]}</span>` : ''}</a>`
          : '<div class="side-sep"></div>'
      )
      .join('');

    const box = $('#planBox');
    if (me.plan === 'free') {
      const used = me.usage.invoicesThisMonth;
      const lim = me.limits.invoicesPerMonth;
      box.innerHTML = `<div class="plan-name">Starter-Plan <span class="badge b-draft">Kostenlos</span></div>
        <div class="meter${used >= lim ? ' full' : ''}"><span style="width:${Math.min(100, (used / lim) * 100)}%"></span></div>
        <div class="muted">${used} von ${lim} Rechnungen diesen Monat</div>
        <a href="#/abo" class="btn btn-primary btn-block">Auf Pro upgraden</a>`;
    } else {
      const sub = me.subscription;
      const end = sub.currentPeriodEnd ? dateDe(new Date(sub.currentPeriodEnd * 1000).toISOString().slice(0, 10)) : '';
      const line =
        sub.status === 'trialing' ? `Testphase bis ${end}` : sub.cancelAtPeriodEnd ? `Endet am ${end}` : sub.status === 'past_due' ? 'Zahlung ausstehend' : end ? `Verlängert sich am ${end}` : 'Aktiv';
      box.innerHTML = `<div class="plan-name">${esc(me.planName)}-Plan <span class="badge b-paid">Aktiv</span></div>
        <div class="muted">${esc(line)}</div>
        <a href="#/abo" class="btn btn-secondary btn-block">Abo verwalten</a>`;
    }
    $('#userRow').innerHTML = `<div class="avatar">${esc(initials(me.name || me.email))}</div>
      <div class="who"><b>${esc(me.name || 'Mein Konto')}</b><span>${esc(me.email)}</span></div>
      <button class="icon-btn" id="logoutBtn" title="Abmelden" aria-label="Abmelden">${I.logout}</button>`;
    $('#logoutBtn').onclick = async () => {
      await api('/api/auth/logout', { body: {} }).catch(() => {});
      location.href = '/';
    };
  }

  $('#menuBtn').addEventListener('click', () => $('#shell').classList.toggle('menu-open'));

  // ---------- Router ----------
  const routes = [
    [/^\/$/, viewDashboard],
    [/^\/willkommen$/, viewWelcome],
    [/^\/rechnungen$/, (m, q, t) => viewList('invoice', t)],
    [/^\/angebote$/, (m, q, t) => viewList('quote', t)],
    [/^\/dokument\/neu$/, (m, q, t) => viewEditor(null, q, t)],
    [/^\/dokument\/(\d+)$/, (m, q, t) => viewEditor(Number(m[1]), q, t)],
    [/^\/kunden$/, viewCustomers],
    [/^\/wiederkehrend$/, viewRecurring],
    [/^\/einstellungen$/, viewSettings],
    [/^\/abo$/, viewBilling],
  ];
  let routeToken = 0;
  const view = $('#view');

  async function route() {
    const token = ++routeToken;
    const [path, qs] = (location.hash.replace(/^#/, '') || '/').split('?');
    const q = new URLSearchParams(qs || '');
    $('#shell').classList.remove('menu-open');
    closeModal();
    renderChrome();
    const match = routes.find(([re]) => re.test(path));
    if (!match) {
      location.hash = '#/';
      return;
    }
    view.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const html = await match[1](path.match(match[0]), q, token);
      if (token !== routeToken) return;
      if (typeof html === 'string') view.innerHTML = html;
      window.scrollTo(0, 0);
    } catch (err) {
      if (token !== routeToken) return;
      if (!err.handled) view.innerHTML = `<div class="card empty"><h3>Das hat nicht geklappt</h3><p>${esc(err.message)}</p><a class="btn btn-secondary" href="#/">Zur Übersicht</a></div>`;
    }
  }
  const stale = (token) => token !== routeToken;
  window.addEventListener('hashchange', route);

  // ---------- Übersicht ----------
  async function viewDashboard(m, q, token) {
    const [stats, customers] = await Promise.all([api('/api/stats'), api('/api/customers')]);
    S.profile = await api('/api/profile');
    if (stale(token)) return;
    const me = S.me;
    const p = S.profile;
    const steps = [
      { done: Boolean((p.company || p.owner) && p.street && p.city), label: 'Firmendaten eintragen', href: '#/einstellungen' },
      { done: Boolean(p.iban), label: 'Bankverbindung hinterlegen', href: '#/einstellungen' },
      { done: customers.length > 0, label: 'Ersten Kunden anlegen', href: '#/kunden?neu=1' },
      { done: stats.recent.some((d) => d.type === 'invoice'), label: 'Erste Rechnung schreiben', href: '#/dokument/neu' },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const max = Math.max(...stats.months.map((x) => x.revenue), 1);
    const year = todayIso().slice(0, 4);
    const nearLimit = me.plan === 'free' && me.usage.invoicesThisMonth >= me.limits.invoicesPerMonth - 1;
    const hello = (me.name || '').split(' ')[0];

    view.innerHTML = `
      <div class="page-head">
        <div><h1>${hello ? `Hallo ${esc(hello)}` : 'Übersicht'}</h1><p>Hier ist der aktuelle Stand deiner Finanzen.</p></div>
        <div class="page-actions">
          ${me.features.quotes ? `<a href="#/dokument/neu?type=quote" class="btn btn-secondary">${I.quote}Neues Angebot</a>` : ''}
          <a href="#/dokument/neu" class="btn btn-primary">${I.plus}Neue Rechnung</a>
        </div>
      </div>
      ${
        nearLimit
          ? `<div class="banner warn"><span><b>${me.usage.invoicesThisMonth} von ${me.limits.invoicesPerMonth}</b> kostenlosen Rechnungen in diesem Monat genutzt. Mit Pro schreibst du unbegrenzt Rechnungen.</span><a href="#/abo" class="btn btn-sm btn-primary">Pro ${S.trialDays} Tage testen</a></div>`
          : ''
      }
      <div class="grid grid-4">
        <div class="card kpi"><div class="label"><span class="dot" style="background:var(--primary)"></span>Offen</div><div class="value">${eur(stats.open.s)}</div><div class="sub">${stats.open.n} Rechnung${stats.open.n === 1 ? '' : 'en'}</div></div>
        <div class="card kpi"><div class="label"><span class="dot" style="background:var(--red)"></span>Überfällig</div><div class="value" style="${stats.overdue.n ? 'color:var(--red)' : ''}">${eur(stats.overdue.s)}</div><div class="sub">${stats.overdue.n ? `${stats.overdue.n} Rechnung${stats.overdue.n === 1 ? '' : 'en'} – <a href="#/rechnungen?f=overdue">ansehen</a>` : 'Alles im grünen Bereich'}</div></div>
        <div class="card kpi"><div class="label"><span class="dot" style="background:var(--green)"></span>Bezahlt ${year}</div><div class="value">${eur(stats.paidYear.s)}</div><div class="sub">${eur(stats.paidYear.net)} netto</div></div>
        <div class="card kpi"><div class="label"><span class="dot" style="background:var(--amber)"></span>Offene Angebote</div><div class="value">${eur(stats.quotes.s)}</div><div class="sub">${stats.quotes.n} Angebot${stats.quotes.n === 1 ? '' : 'e'}</div></div>
      </div>
      <div class="grid grid-main mt">
        <div class="card card-pad">
          <h2>Umsatz (netto, bezahlt)</h2><p class="card-sub">Die letzten 6 Monate</p>
          <div class="bars">${stats.months
            .map(
              (x) => `<div class="bar"><div class="col${x.revenue ? '' : ' zero'}" data-v="${esc(eur(x.revenue))}" style="height:${Math.max(2, (x.revenue / max) * 150)}px"></div><span>${esc(monthName(x.month))}</span></div>`
            )
            .join('')}</div>
        </div>
        ${
          doneCount < steps.length
            ? `<div class="card card-pad">
            <h2>Los geht's</h2>
            <div class="progress-label"><span>Einrichtung</span><span>${doneCount} von ${steps.length}</span></div>
            <div class="meter"><span style="width:${(doneCount / steps.length) * 100}%"></span></div>
            <div class="checklist mt">${steps
              .map((s) => `<a href="${s.href}" class="${s.done ? 'done' : ''}"><span class="tick">${s.done ? I.check : ''}</span><span>${esc(s.label)}</span></a>`)
              .join('')}</div>
          </div>`
            : `<div class="card card-pad">
            <h2>Schnellzugriff</h2><p class="card-sub">Häufige Aufgaben</p>
            <div class="checklist">
              <a href="#/dokument/neu"><span class="tick" style="border:0;color:var(--primary)">${I.plus}</span><span>Rechnung schreiben</span></a>
              <a href="#/kunden?neu=1"><span class="tick" style="border:0;color:var(--primary)">${I.users}</span><span>Kunden anlegen</span></a>
              <a href="#/rechnungen?f=overdue"><span class="tick" style="border:0;color:var(--primary)">${I.bell}</span><span>Überfällige prüfen</span></a>
              <a href="#" data-export><span class="tick" style="border:0;color:var(--primary)">${I.download}</span><span>CSV-Export ${year}</span></a>
            </div>
          </div>`
        }
      </div>
      <div class="card table-card mt">
        <div class="card-pad" style="padding-bottom:12px"><h2>Zuletzt bearbeitet</h2></div>
        ${
          stats.recent.length
            ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Nummer</th><th>Kunde</th><th class="hide-sm">Datum</th><th class="right">Betrag</th><th>Status</th></tr></thead><tbody>
          ${stats.recent
            .map(
              (d) => `<tr class="link" data-href="#/dokument/${d.id}"><td class="strong">${esc(d.number)}<div class="small muted">${d.type === 'quote' ? 'Angebot' : 'Rechnung'}</div></td><td>${esc(d.customer.name)}</td><td class="hide-sm">${dateDe(d.issue_date)}</td><td class="right num strong">${eur(d.total)}</td><td>${badge(d.status)}</td></tr>`
            )
            .join('')}</tbody></table></div>`
            : `<div class="empty"><div class="ico">${I.invoice}</div><h3>Noch keine Dokumente</h3><p>Schreib deine erste Rechnung – das dauert nur zwei Minuten.</p><a href="#/dokument/neu" class="btn btn-primary">${I.plus}Erste Rechnung schreiben</a></div>`
        }
      </div>`;
    bindRowLinks();
    $('[data-export]', view)?.addEventListener('click', (e) => {
      e.preventDefault();
      exportCsv(year);
    });
  }

  function bindRowLinks() {
    $$('tr[data-href]', view).forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        location.hash = tr.dataset.href;
      })
    );
  }

  function exportCsv(year) {
    if (!S.me.features.csvExport) return showUpsell('csvExport');
    location.href = `/api/export.csv?year=${encodeURIComponent(year)}`;
  }

  // ---------- Willkommen / Onboarding ----------
  async function viewWelcome() {
    S.profile = await api('/api/profile');
    const p = S.profile;
    view.innerHTML = `
      <div style="max-width:640px;margin:0 auto">
        <div class="page-head"><div><h1>Willkommen bei Fakturo 👋</h1><p>Zwei Minuten Einrichtung – dann ist deine erste Rechnung fertig.</p></div></div>
        <form class="card card-pad" id="welcomeForm">
          <div class="section-title">Deine Firmendaten</div>
          <div class="form-grid">
            <div class="field s3"><label>Firmenname</label><input name="company" value="${esc(p.company)}" placeholder="z. B. Weber Design"></div>
            <div class="field s3"><label>Inhaber/in</label><input name="owner" value="${esc(p.owner)}" placeholder="Vor- und Nachname"></div>
            <div class="field"><label>Straße und Hausnummer</label><input name="street" value="${esc(p.street)}"></div>
            <div class="field s2"><label>PLZ</label><input name="zip" value="${esc(p.zip)}"></div>
            <div class="field s4"><label>Ort</label><input name="city" value="${esc(p.city)}"></div>
            <div class="field s3"><label>Steuernummer</label><input name="tax_number" value="${esc(p.tax_number)}" placeholder="12/345/67890"></div>
            <div class="field s3"><label>IBAN</label><input name="iban" value="${esc(p.iban)}" placeholder="DE00 0000 0000 0000 0000 00"></div>
          </div>
          <label class="switch"><input type="checkbox" name="small_business" ${p.small_business ? 'checked' : ''}><div><b>Ich bin Kleinunternehmer/in (§ 19 UStG)</b><span>Es wird keine Umsatzsteuer ausgewiesen, der Pflichthinweis kommt automatisch auf die Rechnung.</span></div></label>
          <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
            <a href="#/" class="btn btn-ghost">Später erledigen</a>
            <button class="btn btn-primary" type="submit">Speichern &amp; erste Rechnung schreiben ${I.arrow}</button>
          </div>
        </form>
      </div>`;
    $('#welcomeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.small_business = e.target.small_business.checked;
      try {
        S.profile = await api('/api/profile', { method: 'PUT', body: data });
        await refreshMe();
        location.hash = '#/dokument/neu';
      } catch (err) {
        fail(err);
      }
    });
  }

  // ---------- Listen ----------
  async function viewList(type, token) {
    const me = S.me;
    const isQuote = type === 'quote';
    if (isQuote && !me.features.quotes) {
      view.innerHTML = lockedView('Angebote', 'quotes', I.quote, [
        'Angebote im gleichen Design wie deine Rechnungen',
        'Nach Zusage mit einem Klick zur Rechnung',
        'Status: offen, angenommen, abgelehnt',
      ]);
      bindLocked();
      return;
    }
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const docs = await api(`/api/documents?type=${type}`);
    if (stale(token)) return;
    let filter = q.get('f') || 'all';
    let search = '';
    const filters = isQuote
      ? [['all', 'Alle'], ['open', 'Offen'], ['accepted', 'Angenommen'], ['declined', 'Abgelehnt']]
      : [['all', 'Alle'], ['draft', 'Entwürfe'], ['sent', 'Offen'], ['overdue', 'Überfällig'], ['paid', 'Bezahlt']];

    view.innerHTML = `
      <div class="page-head">
        <div><h1>${isQuote ? 'Angebote' : 'Rechnungen'}</h1><p>${docs.length} ${isQuote ? 'Angebot' : 'Rechnung'}${docs.length === 1 ? '' : isQuote ? 'e' : 'en'} insgesamt</p></div>
        <div class="page-actions">
          ${isQuote ? '' : `<button class="btn btn-secondary" id="exportBtn">${I.download}CSV-Export</button>`}
          <a href="#/dokument/neu${isQuote ? '?type=quote' : ''}" class="btn btn-primary">${I.plus}${isQuote ? 'Neues Angebot' : 'Neue Rechnung'}</a>
        </div>
      </div>
      ${docs.length ? `<div class="toolbar"><div class="tabs" id="tabs">${filters.map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'active' : ''}">${l}</button>`).join('')}</div>
        <div class="search">${I.search}<input class="input" id="search" placeholder="Nummer oder Kunde suchen…"></div></div>` : ''}
      <div class="card table-card" id="listBox"></div>`;

    const box = $('#listBox');
    const draw = () => {
      const rows = docs.filter(
        (d) =>
          (filter === 'all' || d.status === filter) &&
          (!search || `${d.number} ${d.customer.name} ${d.title}`.toLowerCase().includes(search))
      );
      if (!docs.length) {
        box.innerHTML = `<div class="empty"><div class="ico">${isQuote ? I.quote : I.invoice}</div><h3>Noch keine ${isQuote ? 'Angebote' : 'Rechnungen'}</h3><p>${isQuote ? 'Erstelle dein erstes Angebot und wandle es später in eine Rechnung um.' : 'Deine Rechnungen erscheinen hier – mit Status, Fälligkeit und Betrag.'}</p><a href="#/dokument/neu${isQuote ? '?type=quote' : ''}" class="btn btn-primary">${I.plus}${isQuote ? 'Angebot erstellen' : 'Rechnung schreiben'}</a></div>`;
        return;
      }
      if (!rows.length) {
        box.innerHTML = `<div class="empty"><h3>Keine Treffer</h3><p>Für diesen Filter gibt es keine Einträge.</p></div>`;
        return;
      }
      const sum = rows.reduce((s, d) => s + d.total, 0);
      box.innerHTML = `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Nummer</th><th>Kunde</th><th class="hide-sm">Datum</th><th class="hide-sm">${isQuote ? 'Gültig bis' : 'Fällig'}</th><th class="right">Betrag</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows
          .map(
            (d) => `<tr class="link" data-href="#/dokument/${d.id}">
            <td class="strong">${esc(d.number)}${d.title ? `<div class="small muted">${esc(d.title)}</div>` : ''}</td>
            <td>${esc(d.customer.name)}</td>
            <td class="hide-sm">${dateDe(d.issue_date)}</td>
            <td class="hide-sm" style="${d.status === 'overdue' ? 'color:var(--red);font-weight:600' : ''}">${dateDe(d.due_date)}</td>
            <td class="right num strong">${eur(d.total)}</td>
            <td>${badge(d.status)}${d.reminder_level ? `<div class="small muted">${d.reminder_level}× erinnert</div>` : ''}</td>
            <td class="right">${['sent', 'overdue'].includes(d.status) ? `<button class="btn btn-sm btn-secondary" data-paid="${d.id}" title="Als bezahlt markieren">${I.check}Bezahlt</button>` : ''}</td>
          </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td colspan="4" class="muted small hide-sm" style="padding:12px 18px">${rows.length} Einträge</td><td class="right num strong" style="padding:12px 18px">${eur(sum)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
      bindRowLinks();
      $$('[data-paid]', box).forEach((b) =>
        b.addEventListener('click', async () => {
          try {
            const updated = await api(`/api/documents/${b.dataset.paid}/status`, { body: { status: 'paid' } });
            Object.assign(docs.find((d) => d.id === updated.id), updated);
            toast(`${updated.number} als bezahlt markiert 🎉`);
            draw();
          } catch (err) {
            fail(err);
          }
        })
      );
    };
    draw();
    $('#tabs')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      draw();
    });
    $('#search')?.addEventListener('input', (e) => {
      search = e.target.value.trim().toLowerCase();
      draw();
    });
    $('#exportBtn')?.addEventListener('click', () => exportCsv(todayIso().slice(0, 4)));
  }

  function lockedView(title, feature, icon, perks) {
    const u = UPSELL[feature];
    return `<div class="page-head"><div><h1>${esc(title)}</h1></div></div>
      <div class="card"><div class="upsell" style="max-width:520px;margin:0 auto;padding:56px 24px">
        <div class="ico">${icon}</div><h2>${esc(u.title)}</h2><p>${esc(u.text)}</p>
        <ul>${perks.map((p) => `<li>${checkIcon}<span>${esc(p)}</span></li>`).join('')}</ul>
        <button class="btn btn-primary btn-lg" data-checkout="${u.plan}">${u.plan === 'pro' ? 'Pro' : 'Business'} ${S.trialDays} Tage gratis testen</button>
        <p class="small muted" style="margin-top:12px">Danach ${u.plan === 'pro' ? '9 €' : '19 €'}/Monat · monatlich kündbar · <a href="#/abo">Pläne vergleichen</a></p>
      </div></div>`;
  }
  function bindLocked() {
    $$('[data-checkout]', view).forEach((b) => b.addEventListener('click', () => startCheckout(b.dataset.checkout, 'monthly', b)));
  }

  // ---------- Rechnungspapier ----------
  function computeTotals(items, smallBusiness) {
    let subtotal = 0;
    const byRate = {};
    for (const it of items) {
      const net = round(parseNum(it.quantity) * parseNum(it.price));
      subtotal += net;
      if (!smallBusiness) byRate[it.taxRate] = (byRate[it.taxRate] || 0) + net;
    }
    const taxes = Object.entries(byRate)
      .filter(([rate]) => Number(rate) > 0)
      .sort((a, b) => b[0] - a[0])
      .map(([rate, net]) => ({ rate: Number(rate), net: round(net), tax: round((net * Number(rate)) / 100) }));
    const tax = round(taxes.reduce((s, t) => s + t.tax, 0));
    subtotal = round(subtotal);
    return { subtotal, taxes, tax, total: round(subtotal + tax) };
  }

  function paperHtml(d, profile, customer) {
    const f = S.me.features;
    const p = profile;
    const isQuote = d.type === 'quote';
    const sb = d.small_business;
    const c = customer || {};
    const t = computeTotals(d.items, sb);
    const sender = [p.company || p.owner, p.street, [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const nameLine = p.company || p.owner || 'Dein Firmenname';
    const lines = d.items.filter((it) => it.description || parseNum(it.price));
    const service = d.service_date ? esc(d.service_date) : 'entspricht Rechnungsdatum';
    const stamp =
      d.status === 'paid' ? `<div class="p-stamp" style="color:#0f9d58">Bezahlt${d.paid_at ? ` am ${dateDe(d.paid_at)}` : ''}</div>` : d.status === 'cancelled' ? '<div class="p-stamp" style="color:#c53030">Storniert</div>' : '';
    const showTaxCol = !sb && new Set(lines.map((l) => l.taxRate)).size > 1;

    return `<div class="paper" style="--accent:${esc(p.accent || '#1f4fd8')}">
      <div class="p-top">
        <div class="p-logo">${f.logo && p.logo ? `<img src="${esc(p.logo)}" alt="">` : `<div style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:${esc(p.accent)}">${esc(nameLine)}</div>`}</div>
        <div class="p-company"><b>${esc(nameLine)}</b>${p.company && p.owner ? `${esc(p.owner)}<br>` : ''}${esc(p.street)}${p.street ? '<br>' : ''}${esc([p.zip, p.city].filter(Boolean).join(' '))}${p.email ? `<br>${esc(p.email)}` : ''}${p.phone ? `<br>${esc(p.phone)}` : ''}</div>
      </div>
      <div class="p-mid">
        <div>
          ${sender ? `<div class="p-sender">${esc(sender)}</div>` : ''}
          <div class="p-recipient">${c.name ? `<b>${esc(c.name)}</b><br>` : '<span style="color:#9aa1af">Kunde auswählen</span><br>'}${c.contact ? `z. Hd. ${esc(c.contact)}<br>` : ''}${esc(c.street)}${c.street ? '<br>' : ''}${esc([c.zip, c.city].filter(Boolean).join(' '))}${c.country && c.country !== 'Deutschland' ? `<br>${esc(c.country)}` : ''}</div>
        </div>
        <div class="p-meta">
          <div><span>${isQuote ? 'Angebotsnr.' : 'Rechnungsnr.'}</span><b>${esc(d.number || 'wird vergeben')}</b></div>
          <div><span>Datum</span><span>${dateDe(d.issue_date)}</span></div>
          ${isQuote ? `<div><span>Gültig bis</span><span>${dateDe(d.due_date)}</span></div>` : `<div><span>Leistungsdatum</span><span>${service}</span></div><div><span>Fällig am</span><span>${dateDe(d.due_date)}</span></div>`}
          ${c.vat_id ? `<div><span>USt-IdNr. Kunde</span><span>${esc(c.vat_id)}</span></div>` : ''}
          ${stamp}
        </div>
      </div>
      <h1 class="p-title">${isQuote ? 'Angebot' : 'Rechnung'}${d.title ? ` – ${esc(d.title)}` : ''}</h1>
      ${d.intro ? `<div class="p-intro">${esc(d.intro)}</div>` : ''}
      <table>
        <thead><tr><th style="width:36px">Pos.</th><th>Beschreibung</th><th class="r">Menge</th><th class="r">Einzelpreis</th>${showTaxCol ? '<th class="r">USt.</th>' : ''}<th class="r">Gesamt</th></tr></thead>
        <tbody>${
          lines.length
            ? lines
                .map(
                  (it, i) => `<tr><td>${i + 1}</td><td>${esc(it.description)}</td><td class="r">${numDe(parseNum(it.quantity))}${it.unit ? ` ${esc(it.unit)}` : ''}</td><td class="r">${eur(parseNum(it.price))}</td>${showTaxCol ? `<td class="r">${it.taxRate} %</td>` : ''}<td class="r">${eur(round(parseNum(it.quantity) * parseNum(it.price)))}</td></tr>`
                )
                .join('')
            : `<tr><td colspan="${showTaxCol ? 6 : 5}" style="color:#9aa1af;text-align:center;padding:18px">Noch keine Positionen</td></tr>`
        }</tbody>
      </table>
      <div class="p-sum">
        ${sb ? '' : `<div><span>Nettobetrag</span><span>${eur(t.subtotal)}</span></div>`}
        ${t.taxes.map((x) => `<div><span>zzgl. ${x.rate} % USt.${t.taxes.length > 1 ? ` auf ${eur(x.net)}` : ''}</span><span>${eur(x.tax)}</span></div>`).join('')}
        ${!sb && !t.taxes.length && lines.length ? `<div><span>USt. 0 %</span><span>${eur(0)}</span></div>` : ''}
        <div class="grand"><span>${isQuote ? 'Angebotssumme' : 'Gesamtbetrag'}</span><span>${eur(t.total)}</span></div>
      </div>
      ${sb ? '<div class="p-legal">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</div>' : ''}
      <div class="p-note">${
        isQuote
          ? `Dieses Angebot ist gültig bis zum ${dateDe(d.due_date)}.`
          : d.status === 'cancelled'
            ? 'Diese Rechnung wurde storniert.'
            : `Bitte überweisen Sie den Gesamtbetrag bis zum ${dateDe(d.due_date)} unter Angabe der Rechnungsnummer ${esc(d.number || '')} auf das unten genannte Konto.`
      }${d.notes ? `\n\n${esc(d.notes)}` : ''}${p.footer_note ? `\n\n${esc(p.footer_note)}` : ''}</div>
      <div class="p-foot">
        <div><b>${esc(nameLine)}</b><br>${p.company && p.owner ? `Inhaber/in: ${esc(p.owner)}<br>` : ''}${esc(p.street)}<br>${esc([p.zip, p.city].filter(Boolean).join(' '))}</div>
        <div>${p.email ? `${esc(p.email)}<br>` : ''}${p.website ? `${esc(p.website)}<br>` : ''}${p.tax_number ? `Steuernr.: ${esc(p.tax_number)}<br>` : ''}${p.vat_id ? `USt-IdNr.: ${esc(p.vat_id)}` : ''}</div>
        <div>${p.bank ? `<b>${esc(p.bank)}</b><br>` : ''}${p.iban ? `IBAN: ${esc(p.iban)}<br>` : '<span style="color:#c08a2b">IBAN in den Einstellungen ergänzen</span><br>'}${p.bic ? `BIC: ${esc(p.bic)}` : ''}</div>
      </div>
      ${f.removeBranding ? '' : '<div class="p-brand">Erstellt mit Fakturo</div>'}
    </div>`;
  }

  function printPaper(html, filename) {
    $('#print').innerHTML = html;
    const old = document.title;
    document.title = filename;
    const done = () => {
      document.title = old;
      $('#print').innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    // Bilder (Logo) laden lassen, bevor gedruckt wird
    setTimeout(() => window.print(), 50);
  }

  // ---------- Editor ----------
  const DEFAULTS = {
    invoice: { intro: 'Vielen Dank für Ihren Auftrag. Für die erbrachten Leistungen erlaube ich mir, Folgendes in Rechnung zu stellen:' },
    quote: { intro: 'Vielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen folgendes Angebot:' },
  };

  async function viewEditor(id, q, token) {
    const [profile, customers, existing] = await Promise.all([
      api('/api/profile'),
      api('/api/customers'),
      id ? api(`/api/documents/${id}`) : null,
    ]);
    if (stale(token)) return;
    S.profile = profile;
    const type = existing ? existing.type : q.get('type') === 'quote' ? 'quote' : 'invoice';
    if (!existing && type === 'quote' && !S.me.features.quotes) {
      showUpsell('quotes');
      view.innerHTML = lockedView('Angebote', 'quotes', I.quote, ['Angebote im Rechnungs-Design', 'Mit einem Klick zur Rechnung', 'Status-Verfolgung']);
      bindLocked();
      return;
    }
    if (!existing && type === 'invoice' && S.me.limits.invoicesPerMonth !== null && S.me.usage.invoicesThisMonth >= S.me.limits.invoicesPerMonth) {
      showUpsell('invoices');
    }
    const isQuote = type === 'quote';
    const today = todayIso();
    const d = existing
      ? structuredClone(existing)
      : {
          type,
          number: '',
          status: isQuote ? 'open' : 'draft',
          customer_id: Number(q.get('customer')) || (customers.length === 1 ? customers[0].id : ''),
          issue_date: today,
          due_date: addDays(today, isQuote ? 30 : profile.payment_days),
          service_date: '',
          title: '',
          intro: DEFAULTS[type].intro,
          notes: '',
          small_business: Boolean(profile.small_business),
          items: [{ description: '', quantity: 1, unit: 'Std.', price: '', taxRate: profile.default_tax_rate }],
        };
    const editable = !existing || isQuote || existing.status === 'draft';
    const sb = d.small_business;
    const customerOf = () => (existing && Number(d.customer_id) === existing.customer_id ? existing.customer : customers.find((c) => c.id === Number(d.customer_id)));

    const title = existing ? `${isQuote ? 'Angebot' : 'Rechnung'} ${existing.number}` : isQuote ? 'Neues Angebot' : 'Neue Rechnung';
    view.innerHTML = `
      <div class="page-head">
        <div>
          <a href="#/${isQuote ? 'angebote' : 'rechnungen'}" class="small muted" style="display:inline-flex;gap:6px;align-items:center">${svg('<path d="M19 12H5M11 18l-6-6 6-6"/>', 'width="15" height="15"')}Zurück</a>
          <h1 style="margin-top:6px">${esc(title)}</h1>
          ${existing ? `<div class="status-line mt" style="margin-top:8px">${badge(existing.status)}${existing.reminder_level ? `<span>${existing.reminder_level}× erinnert</span>` : ''}${existing.paid_at ? `<span>Bezahlt am ${dateDe(existing.paid_at)}</span>` : ''}</div>` : ''}
        </div>
        <div class="page-actions" id="docActions"></div>
      </div>
      ${!editable ? `<div class="banner info"><span>Diese Rechnung wurde bereits versendet und kann nicht mehr geändert werden. Für Korrekturen: stornieren und neu erstellen.</span></div>` : ''}
      <div class="editor">
        <form class="card card-pad" id="docForm" autocomplete="off">
          <fieldset ${editable ? '' : 'disabled'} style="border:0;padding:0;margin:0;min-width:0">
          <div class="section-title">Empfänger</div>
          <div class="field">
            <label for="f_customer">Kunde</label>
            <div style="display:flex;gap:8px">
              <select id="f_customer" name="customer_id" style="flex:1"><option value="">– Kunde auswählen –</option>${customers
                .map((c) => `<option value="${c.id}" ${c.id === Number(d.customer_id) ? 'selected' : ''}>${esc(c.name)}</option>`)
                .join('')}</select>
              <button type="button" class="btn btn-secondary" id="newCustomerBtn" title="Neuen Kunden anlegen">${I.plus}Neu</button>
            </div>
          </div>
          <div class="section-title mt">Details</div>
          <div class="form-grid">
            <div class="field"><label for="f_title">Betreff <span class="muted" style="font-weight:400">(optional)</span></label><input id="f_title" name="title" value="${esc(d.title)}" placeholder="z. B. Website-Relaunch"></div>
            <div class="field s3"><label for="f_issue">${isQuote ? 'Angebotsdatum' : 'Rechnungsdatum'}</label><input type="date" id="f_issue" name="issue_date" value="${esc(d.issue_date)}"></div>
            <div class="field s3"><label for="f_due">${isQuote ? 'Gültig bis' : 'Fällig am'}</label><input type="date" id="f_due" name="due_date" value="${esc(d.due_date)}"></div>
            ${isQuote ? '' : `<div class="field"><label for="f_service">Leistungszeitraum</label><input id="f_service" name="service_date" value="${esc(d.service_date)}" placeholder="z. B. Oktober 2026 – leer = Rechnungsdatum"></div>`}
            <div class="field"><label for="f_intro">Einleitungstext</label><textarea id="f_intro" name="intro" rows="2">${esc(d.intro)}</textarea></div>
          </div>
          <div class="section-title mt">Positionen</div>
          <div class="items" id="items"></div>
          <button type="button" class="btn btn-secondary btn-sm mt" id="addItem">${I.plus}Position hinzufügen</button>
          <div class="totals-box" id="totals"></div>
          <div class="field mt-lg"><label for="f_notes">Anmerkungen <span class="muted" style="font-weight:400">(optional)</span></label><textarea id="f_notes" name="notes" rows="2" placeholder="z. B. Vielen Dank für die gute Zusammenarbeit!">${esc(d.notes)}</textarea></div>
          ${sb ? `<p class="small muted">${I.check.replace('<svg', '<svg width="14" height="14" style="display:inline;vertical-align:-2px;color:var(--green)"')} Kleinunternehmerregelung aktiv – es wird keine USt. berechnet.</p>` : ''}
          ${editable ? `<button type="submit" class="btn btn-primary btn-block btn-lg mt">${existing ? 'Änderungen speichern' : isQuote ? 'Angebot speichern' : 'Rechnung speichern'}</button>` : ''}
          </fieldset>
        </form>
        <div class="preview-wrap">
          <div class="preview-frame" id="previewFrame"><div class="preview-scale" id="previewScale"></div></div>
          <p class="small muted" style="text-align:center;margin-top:10px">Live-Vorschau · So sieht dein ${isQuote ? 'Angebot' : 'PDF'} aus</p>
        </div>
      </div>`;

    const form = $('#docForm');
    const F = form.elements;
    const itemsEl = $('#items');
    let dirty = false;

    function drawItems() {
      itemsEl.innerHTML =
        `<div class="item-row${sb ? ' no-tax' : ''} item-head"><span>Beschreibung</span><span>Menge</span><span>Einheit</span><span>Preis (netto)</span>${sb ? '' : '<span>USt.</span>'}<span></span></div>` +
        d.items
          .map(
            (it, i) => `<div class="item-row${sb ? ' no-tax' : ''}" data-i="${i}">
            <textarea data-k="description" rows="1" placeholder="Leistung oder Produkt" aria-label="Beschreibung">${esc(it.description)}</textarea>
            <input data-k="quantity" inputmode="decimal" value="${esc(it.quantity)}" aria-label="Menge">
            <input data-k="unit" value="${esc(it.unit)}" placeholder="Stk." aria-label="Einheit" list="units">
            <input data-k="price" inputmode="decimal" value="${esc(it.price)}" placeholder="0,00" aria-label="Einzelpreis">
            ${sb ? '' : `<select data-k="taxRate" aria-label="Steuersatz">${[19, 7, 0].map((r) => `<option value="${r}" ${Number(it.taxRate) === r ? 'selected' : ''}>${r} %</option>`).join('')}</select>`}
            <button type="button" class="icon-btn" data-remove="${i}" aria-label="Position entfernen" ${d.items.length === 1 ? 'style="visibility:hidden"' : ''}>${I.trash}</button>
          </div>`
          )
          .join('') +
        '<datalist id="units"><option value="Std."><option value="Tag"><option value="Stk."><option value="Pauschal"><option value="Monat"><option value="km"></datalist>';
    }

    function drawTotals() {
      const t = computeTotals(d.items, sb);
      $('#totals').innerHTML = `${sb ? '' : `<div><span class="muted">Netto</span><span class="num">${eur(t.subtotal)}</span></div>`}
        ${t.taxes.map((x) => `<div><span class="muted">USt. ${x.rate} %</span><span class="num">${eur(x.tax)}</span></div>`).join('')}
        <div class="grand"><span>Gesamt</span><span class="num">${eur(t.total)}</span></div>`;
    }

    const scaleEl = $('#previewScale');
    const frame = $('#previewFrame');
    function fitPreview() {
      const w = frame.clientWidth - 36;
      const s = Math.min(1, w / 794);
      scaleEl.style.transform = `scale(${s})`;
      scaleEl.style.height = `${1123 * s}px`;
      scaleEl.style.width = `${794}px`;
      const paper = scaleEl.firstElementChild;
      if (paper) frame.style.height = `${paper.offsetHeight * s + 36}px`;
    }
    function drawPreview() {
      scaleEl.innerHTML = paperHtml(d, profile, customerOf());
      fitPreview();
    }
    new ResizeObserver(fitPreview).observe(frame);

    const sync = () => {
      d.customer_id = F.customer_id.value;
      d.title = F.title.value;
      d.issue_date = F.issue_date.value;
      d.due_date = F.due_date.value;
      if (F.service_date) d.service_date = F.service_date.value;
      d.intro = F.intro.value;
      d.notes = F.notes.value;
      dirty = true;
      drawTotals();
      drawPreview();
    };
    form.addEventListener('input', (e) => {
      const row = e.target.closest('[data-i]');
      if (row) d.items[Number(row.dataset.i)][e.target.dataset.k] = e.target.dataset.k === 'taxRate' ? Number(e.target.value) : e.target.value;
      if (e.target.name === 'issue_date' && !existing && F.issue_date.value) {
        F.due_date.value = addDays(F.issue_date.value, isQuote ? 30 : profile.payment_days);
      }
      sync();
    });
    form.addEventListener('change', sync);
    itemsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      d.items.splice(Number(b.dataset.remove), 1);
      drawItems();
      sync();
    });
    $('#addItem').addEventListener('click', () => {
      const last = d.items[d.items.length - 1];
      d.items.push({ description: '', quantity: 1, unit: last?.unit || 'Std.', price: '', taxRate: last?.taxRate ?? profile.default_tax_rate });
      drawItems();
      sync();
      $$('#items textarea').pop()?.focus();
    });
    $('#newCustomerBtn').addEventListener('click', () =>
      customerModal(null, (c) => {
        customers.push(c);
        const opt = new Option(c.name, c.id, true, true);
        F.customer_id.add(opt);
        sync();
      })
    );

    const payload = () => ({
      type,
      customer_id: Number(d.customer_id),
      title: d.title,
      issue_date: d.issue_date,
      due_date: d.due_date,
      service_date: d.service_date,
      intro: d.intro,
      notes: d.notes,
      items: d.items.map((it) => ({ ...it, quantity: parseNum(it.quantity), price: parseNum(it.price) })),
    });

    async function save() {
      if (!d.customer_id) {
        toast('Bitte wähle einen Kunden aus.', true);
        F.customer_id.focus();
        return null;
      }
      const btn = $('button[type=submit]', form);
      if (btn) btn.disabled = true;
      try {
        const saved = existing
          ? await api(`/api/documents/${existing.id}`, { method: 'PUT', body: payload() })
          : await api('/api/documents', { body: payload() });
        dirty = false;
        if (!existing) {
          await refreshMe();
          toast(`${isQuote ? 'Angebot' : 'Rechnung'} ${saved.number} erstellt`);
          history.replaceState(null, '', `#/dokument/${saved.id}`);
          route();
        } else {
          Object.assign(existing, saved);
          toast('Gespeichert');
        }
        return saved;
      } catch (err) {
        fail(err);
        return null;
      } finally {
        if (btn) btn.disabled = false;
      }
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });

    // Aktionen
    const actions = [];
    const btn = (key, label, icon, cls = 'btn-secondary') => actions.push(`<button class="btn ${cls}" data-a="${key}">${icon}${label}</button>`);
    if (existing) {
      const s = existing.status;
      if (!isQuote) {
        if (s === 'draft') btn('send', 'Versenden', I.mail, 'btn-primary');
        if (['sent', 'overdue'].includes(s)) {
          btn('paid', 'Als bezahlt markieren', I.check, 'btn-success');
          btn('remind', 'Zahlungserinnerung', I.bell);
        }
        if (s === 'paid') btn('unpaid', 'Wieder auf offen', I.back);
      } else {
        if (s !== 'declined') btn('convert', 'In Rechnung umwandeln', I.convert, 'btn-primary');
        btn('send', 'Per E-Mail', I.mail);
        if (s === 'open') btn('decline', 'Abgelehnt', I.ban);
      }
      btn('pdf', 'PDF', I.download);
      btn('dup', 'Duplizieren', I.copy);
      if (!isQuote && ['sent', 'overdue'].includes(s)) btn('cancel', 'Stornieren', I.ban, 'btn-danger');
      if (isQuote || s === 'draft') btn('delete', '', I.trash, 'btn-danger');
    } else {
      btn('pdf', 'Vorschau als PDF', I.download);
    }
    $('#docActions').innerHTML = actions.join('');
    $('#docActions').addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      try {
        if (a === 'pdf') {
          if (dirty && editable && existing) await save();
          printPaper(paperHtml(d, profile, customerOf()), d.number || (isQuote ? 'Angebot' : 'Rechnung'));
        } else if (a === 'send') {
          if (dirty && editable) if (!(await save())) return;
          sendModal(existing, customerOf(), profile, d);
        } else if (a === 'paid' || a === 'unpaid' || a === 'decline') {
          const status = { paid: 'paid', unpaid: 'sent', decline: 'declined' }[a];
          await api(`/api/documents/${existing.id}/status`, { body: { status } });
          toast(a === 'paid' ? 'Als bezahlt markiert 🎉' : 'Status aktualisiert');
          route();
        } else if (a === 'remind') {
          if (!S.me.features.reminders) return showUpsell('reminders');
          reminderModal(existing, profile);
        } else if (a === 'convert') {
          const inv = await api(`/api/documents/${existing.id}/duplicate`, { body: { type: 'invoice' } });
          await refreshMe();
          toast(`Rechnung ${inv.number} aus Angebot erstellt`);
          location.hash = `#/dokument/${inv.id}`;
        } else if (a === 'dup') {
          const copy = await api(`/api/documents/${existing.id}/duplicate`, { body: {} });
          await refreshMe();
          toast(`Kopie ${copy.number} erstellt`);
          location.hash = `#/dokument/${copy.id}`;
        } else if (a === 'cancel') {
          if (!(await confirmDialog('Rechnung stornieren?', 'Die Rechnung wird als storniert markiert und bleibt zur Dokumentation erhalten.', 'Stornieren', true))) return;
          await api(`/api/documents/${existing.id}/status`, { body: { status: 'cancelled' } });
          toast('Rechnung storniert');
          route();
        } else if (a === 'delete') {
          if (!(await confirmDialog(`${isQuote ? 'Angebot' : 'Entwurf'} löschen?`, 'Das kann nicht rückgängig gemacht werden.', 'Löschen', true))) return;
          await api(`/api/documents/${existing.id}`, { method: 'DELETE' });
          await refreshMe();
          toast('Gelöscht');
          location.hash = isQuote ? '#/angebote' : '#/rechnungen';
        }
      } catch (err) {
        fail(err);
      }
    });

    drawItems();
    drawTotals();
    drawPreview();
  }

  function sendModal(doc, customer, profile, d) {
    const isQuote = doc.type === 'quote';
    const from = profile.company || profile.owner || '';
    const greeting = customer?.contact ? `Guten Tag ${customer.contact},` : 'Guten Tag,';
    const subject = `${isQuote ? 'Angebot' : 'Rechnung'} ${doc.number}${from ? ` – ${from}` : ''}`;
    const body = isQuote
      ? `${greeting}\n\nvielen Dank für Ihre Anfrage. Anbei erhalten Sie mein Angebot ${doc.number} über ${eur(doc.total)}.\n\nDas Angebot ist gültig bis zum ${dateDe(doc.due_date)}. Bei Fragen melden Sie sich gerne.\n\nViele Grüße\n${profile.owner || from}`
      : `${greeting}\n\nanbei erhalten Sie meine Rechnung ${doc.number} über ${eur(doc.total)}.\n\nBitte überweisen Sie den Betrag bis zum ${dateDe(doc.due_date)}${profile.iban ? ` auf folgendes Konto:\nIBAN: ${profile.iban}${profile.bank ? ` (${profile.bank})` : ''}` : '.'}\n\nVielen Dank für die gute Zusammenarbeit!\n\nViele Grüße\n${profile.owner || from}`;
    const m = openModal(
      `${modalHead(isQuote ? 'Angebot versenden' : 'Rechnung versenden', 'Speichere das PDF und hänge es an deine E-Mail an.')}
      <div class="modal-body">
        <div class="field"><label>An</label><input id="m_to" value="${esc(customer?.email || '')}" placeholder="E-Mail des Kunden"></div>
        <div class="field"><label>Betreff</label><input id="m_subject" value="${esc(subject)}"></div>
        <div class="field"><label>Nachricht</label><textarea id="m_body" rows="10">${esc(body)}</textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-m="pdf">${I.download}1. PDF speichern</button>
        <button class="btn btn-primary" data-m="mail">${I.mail}2. E-Mail öffnen</button>
      </div>`,
      { wide: true }
    );
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-m]')?.dataset.m;
      if (act === 'pdf') printPaper(paperHtml(d, profile, customer), doc.number);
      if (act === 'mail') {
        const href = `mailto:${encodeURIComponent($('#m_to').value.trim())}?subject=${encodeURIComponent($('#m_subject').value)}&body=${encodeURIComponent($('#m_body').value)}`;
        window.location.href = href;
        if (!isQuote && doc.status === 'draft') {
          try {
            await api(`/api/documents/${doc.id}/status`, { body: { status: 'sent' } });
            closeModal();
            toast('Rechnung als versendet markiert');
            route();
          } catch (err) {
            fail(err);
          }
        }
      }
    });
  }

  function reminderModal(doc, profile) {
    const level = Math.min(doc.reminder_level, 2);
    const names = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'];
    const from = profile.owner || profile.company || '';
    const newDue = addDays(todayIso(), level === 0 ? 7 : 10);
    const texts = [
      `Guten Tag,\n\nsicher ist es Ihnen im Alltag durchgerutscht: Für meine Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} über ${eur(doc.total)} konnte ich bisher noch keinen Zahlungseingang feststellen.\n\nIch bitte Sie freundlich, den Betrag bis zum ${dateDe(newDue)} zu überweisen. Sollte sich Ihre Zahlung mit dieser E-Mail überschnitten haben, betrachten Sie diese Nachricht bitte als gegenstandslos.\n\nViele Grüße\n${from}`,
      `Guten Tag,\n\nleider ist meine Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} über ${eur(doc.total)} trotz Zahlungserinnerung weiterhin offen.\n\nBitte überweisen Sie den offenen Betrag bis spätestens ${dateDe(newDue)}${profile.iban ? ` auf das Konto IBAN ${profile.iban}` : ''}.\n\nViele Grüße\n${from}`,
      `Guten Tag,\n\ntrotz Zahlungserinnerung und erster Mahnung ist meine Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} über ${eur(doc.total)} weiterhin unbezahlt.\n\nIch fordere Sie hiermit letztmalig auf, den Betrag bis zum ${dateDe(newDue)} zu begleichen. Andernfalls sehe ich mich gezwungen, weitere Schritte einzuleiten.\n\nMit freundlichen Grüßen\n${from}`,
    ];
    const m = openModal(
      `${modalHead(names[level], `Rechnung ${doc.number} · ${eur(doc.total)} · fällig seit ${dateDe(doc.due_date)}`)}
      <div class="modal-body">
        <div class="field"><label>An</label><input id="r_to" value="${esc(doc.customer.email || '')}"></div>
        <div class="field"><label>Betreff</label><input id="r_subject" value="${esc(`${names[level]}: Rechnung ${doc.number}`)}"></div>
        <div class="field"><label>Nachricht</label><textarea id="r_body" rows="11">${esc(texts[level])}</textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-r="copy">${I.copy}Text kopieren</button>
        <button class="btn btn-primary" data-r="mail">${I.mail}E-Mail öffnen</button>
      </div>`,
      { wide: true }
    );
    const mark = async () => {
      await api(`/api/documents/${doc.id}/reminder`, { body: {} });
      closeModal();
      toast(`${names[level]} vermerkt`);
      route();
    };
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-r]')?.dataset.r;
      try {
        if (act === 'copy') {
          await navigator.clipboard.writeText(`${$('#r_subject').value}\n\n${$('#r_body').value}`);
          toast('Text kopiert');
          await mark();
        }
        if (act === 'mail') {
          window.location.href = `mailto:${encodeURIComponent($('#r_to').value.trim())}?subject=${encodeURIComponent($('#r_subject').value)}&body=${encodeURIComponent($('#r_body').value)}`;
          await mark();
        }
      } catch (err) {
        fail(err);
      }
    });
  }

  // ---------- Kunden ----------
  function customerModal(c, onSaved) {
    const v = c || { country: 'Deutschland' };
    const m = openModal(
      `${modalHead(c ? 'Kunde bearbeiten' : 'Neuer Kunde')}
      <form id="custForm">
        <div class="modal-body"><div class="form-grid">
          <div class="field"><label>Firma oder Name *</label><input name="name" value="${esc(v.name)}" required></div>
          <div class="field s3"><label>Ansprechpartner/in</label><input name="contact" value="${esc(v.contact)}"></div>
          <div class="field s3"><label>E-Mail</label><input name="email" type="email" value="${esc(v.email)}"></div>
          <div class="field"><label>Straße und Hausnummer</label><input name="street" value="${esc(v.street)}"></div>
          <div class="field s2"><label>PLZ</label><input name="zip" value="${esc(v.zip)}"></div>
          <div class="field s4"><label>Ort</label><input name="city" value="${esc(v.city)}"></div>
          <div class="field s3"><label>Land</label><input name="country" value="${esc(v.country)}"></div>
          <div class="field s3"><label>USt-IdNr. <span class="muted" style="font-weight:400">(optional)</span></label><input name="vat_id" value="${esc(v.vat_id)}"></div>
        </div></div>
        <div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" type="submit">${c ? 'Speichern' : 'Kunde anlegen'}</button></div>
      </form>`
    );
    $('[data-close]', m).addEventListener('click', closeModal);
    $('#custForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        const saved = c ? await api(`/api/customers/${c.id}`, { method: 'PUT', body: data }) : await api('/api/customers', { body: data });
        closeModal();
        toast(c ? 'Kunde gespeichert' : `${saved.name} angelegt`);
        if (!c) refreshMe();
        onSaved(saved);
      } catch (err) {
        fail(err);
      }
    });
  }

  async function viewCustomers(m, q, token) {
    const customers = await api('/api/customers');
    if (stale(token)) return;
    const me = S.me;
    const lim = me.limits.customers;
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Kunden</h1><p>${customers.length}${lim ? ` von ${lim}` : ''} Kunden</p></div>
        <div class="page-actions"><button class="btn btn-primary" id="addCust">${I.plus}Neuer Kunde</button></div>
      </div>
      <div class="card table-card">${
        customers.length
          ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Name</th><th class="hide-sm">Kontakt</th><th class="hide-sm">Ort</th><th class="right">Rechnungen</th><th class="right">Umsatz</th><th></th></tr></thead><tbody>
        ${customers
          .map(
            (c) => `<tr>
          <td class="strong">${esc(c.name)}${c.contact ? `<div class="small muted">${esc(c.contact)}</div>` : ''}</td>
          <td class="hide-sm">${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="muted">–</span>'}</td>
          <td class="hide-sm">${esc([c.zip, c.city].filter(Boolean).join(' ')) || '<span class="muted">–</span>'}</td>
          <td class="right num">${c.invoice_count}</td>
          <td class="right num strong">${eur(c.revenue)}</td>
          <td class="right" style="white-space:nowrap">
            <a class="btn btn-sm btn-secondary" href="#/dokument/neu?customer=${c.id}">${I.plus}Rechnung</a>
            <button class="icon-btn" data-edit="${c.id}" aria-label="Bearbeiten">${I.edit}</button>
            <button class="icon-btn" data-del="${c.id}" aria-label="Löschen">${I.trash}</button>
          </td></tr>`
          )
          .join('')}</tbody></table></div>`
          : `<div class="empty"><div class="ico">${I.users}</div><h3>Noch keine Kunden</h3><p>Lege deine Kunden einmal an – danach wählst du sie bei jeder Rechnung mit einem Klick aus.</p><button class="btn btn-primary" data-first>${I.plus}Ersten Kunden anlegen</button></div>`
      }</div>`;
    const add = () => {
      if (lim !== null && customers.length >= lim) return showUpsell('customers');
      customerModal(null, () => route());
    };
    $('#addCust').addEventListener('click', add);
    $('[data-first]', view)?.addEventListener('click', add);
    view.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (edit) customerModal(customers.find((c) => c.id === Number(edit.dataset.edit)), () => route());
      if (del) {
        const c = customers.find((x) => x.id === Number(del.dataset.del));
        if (!(await confirmDialog(`${c.name} löschen?`, 'Bestehende Rechnungen bleiben unverändert erhalten.', 'Löschen', true))) return;
        try {
          await api(`/api/customers/${c.id}`, { method: 'DELETE' });
          await refreshMe();
          toast('Kunde gelöscht');
          route();
        } catch (err) {
          fail(err);
        }
      }
    });
    if (q.get('neu')) add();
  }

  // ---------- Wiederkehrende Rechnungen ----------
  async function viewRecurring(m, q, token) {
    if (!S.me.features.recurring) {
      view.innerHTML = lockedView('Wiederkehrende Rechnungen', 'recurring', I.repeat, [
        'Ideal für Retainer, Wartung, Hosting und Mieten',
        'Monatlich, vierteljährlich oder jährlich',
        'Rechnungen werden automatisch als Entwurf erstellt',
      ]);
      bindLocked();
      return;
    }
    const [list, customers] = await Promise.all([api('/api/recurring'), api('/api/customers')]);
    if (stale(token)) return;
    const net = (items) => items.reduce((s, it) => s + it.quantity * it.price, 0);
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Wiederkehrende Rechnungen</h1><p>Fakturo erstellt diese Rechnungen automatisch als Entwurf – du musst sie nur noch versenden.</p></div>
        <div class="page-actions"><button class="btn btn-primary" id="addRec">${I.plus}Neue Vorlage</button></div>
      </div>
      <div class="card table-card">${
        list.length
          ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Kunde</th><th>Intervall</th><th>Nächste Rechnung</th><th class="right">Netto</th><th>Status</th><th></th></tr></thead><tbody>
        ${list
          .map(
            (r) => `<tr><td class="strong">${esc(r.customer_name)}${r.title ? `<div class="small muted">${esc(r.title)}</div>` : ''}</td><td>${INTERVALS[r.interval]}</td><td>${dateDe(r.next_date)}</td><td class="right num strong">${eur(net(r.items))}</td>
          <td>${r.active ? '<span class="badge b-paid">Aktiv</span>' : '<span class="badge b-draft">Pausiert</span>'}</td>
          <td class="right" style="white-space:nowrap"><button class="btn btn-sm btn-secondary" data-toggle="${r.id}">${r.active ? 'Pausieren' : 'Fortsetzen'}</button><button class="icon-btn" data-del="${r.id}" aria-label="Löschen">${I.trash}</button></td></tr>`
          )
          .join('')}</tbody></table></div>`
          : `<div class="empty"><div class="ico">${I.repeat}</div><h3>Noch keine Vorlagen</h3><p>Lege eine Vorlage an, z. B. für einen monatlichen Wartungsvertrag.</p></div>`
      }</div>`;
    $('#addRec').addEventListener('click', () => {
      if (!customers.length) {
        toast('Lege zuerst einen Kunden an.', true);
        location.hash = '#/kunden?neu=1';
        return;
      }
      const md = openModal(
        `${modalHead('Neue wiederkehrende Rechnung')}
        <form id="recForm"><div class="modal-body"><div class="form-grid">
          <div class="field"><label>Kunde</label><select name="customer_id">${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Betreff</label><input name="title" placeholder="z. B. Wartungsvertrag Website"></div>
          <div class="field s4"><label>Leistung</label><input name="description" required placeholder="z. B. Monatliche Wartung & Updates"></div>
          <div class="field s2"><label>Betrag netto</label><input name="price" inputmode="decimal" required placeholder="0,00"></div>
          <div class="field s3"><label>Intervall</label><select name="interval">${Object.entries(INTERVALS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field s3"><label>Erste Rechnung am</label><input type="date" name="next_date" value="${todayIso()}" min="${todayIso()}"></div>
        </div></div>
        <div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" type="submit">Vorlage anlegen</button></div></form>`
      );
      $('[data-close]', md).addEventListener('click', closeModal);
      $('#recForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        try {
          await api('/api/recurring', {
            body: {
              customer_id: Number(f.customer_id),
              title: f.title,
              interval: f.interval,
              next_date: f.next_date,
              items: [{ description: f.description, quantity: 1, unit: 'Pauschal', price: parseNum(f.price), taxRate: S.profile?.default_tax_rate ?? 19 }],
            },
          });
          toast('Vorlage angelegt');
          await refreshMe();
          route();
        } catch (err) {
          fail(err);
        }
      });
    });
    view.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-toggle]');
      const d = e.target.closest('[data-del]');
      try {
        if (t) {
          await api(`/api/recurring/${t.dataset.toggle}/toggle`, { body: {} });
          route();
        }
        if (d && (await confirmDialog('Vorlage löschen?', 'Bereits erstellte Rechnungen bleiben erhalten.', 'Löschen', true))) {
          await api(`/api/recurring/${d.dataset.del}`, { method: 'DELETE' });
          route();
        }
      } catch (err) {
        fail(err);
      }
    });
  }

  // ---------- Einstellungen ----------
  async function viewSettings(m, q, token) {
    const p = await api('/api/profile');
    if (stale(token)) return;
    S.profile = p;
    const f = S.me.features;
    const input = (name, label, cls = '', extra = '') =>
      `<div class="field ${cls}"><label for="s_${name}">${label}</label><input id="s_${name}" name="${name}" value="${esc(p[name])}" ${extra}></div>`;
    view.innerHTML = `
      <div class="page-head"><div><h1>Einstellungen</h1><p>Diese Angaben erscheinen auf deinen Rechnungen.</p></div></div>
      <form id="profileForm" class="grid">
        <div class="card card-pad"><h2>Firmendaten</h2><p class="card-sub">Absender auf jeder Rechnung</p>
          <div class="form-grid">
            ${input('company', 'Firmenname', 's3')}${input('owner', 'Inhaber/in', 's3')}
            ${input('street', 'Straße und Hausnummer')}
            ${input('zip', 'PLZ', 's2')}${input('city', 'Ort', 's4')}
            ${input('email', 'E-Mail', 's3', 'type="email"')}${input('phone', 'Telefon', 's3')}
            ${input('website', 'Website')}
          </div>
        </div>
        <div class="grid grid-2">
          <div class="card card-pad"><h2>Steuern</h2><p class="card-sub">Pflichtangaben nach § 14 UStG</p>
            <div class="form-grid">${input('tax_number', 'Steuernummer', 's3')}${input('vat_id', 'USt-IdNr.', 's3')}</div>
            <label class="switch"><input type="checkbox" name="small_business" ${p.small_business ? 'checked' : ''}><div><b>Kleinunternehmerregelung (§ 19 UStG)</b><span>Gilt für neue Dokumente. Keine USt., Hinweis wird automatisch gedruckt.</span></div></label>
            <div class="field"><label for="s_rate">Standard-Steuersatz</label><select id="s_rate" name="default_tax_rate">${[19, 7, 0].map((r) => `<option value="${r}" ${p.default_tax_rate === r ? 'selected' : ''}>${r} %</option>`).join('')}</select></div>
          </div>
          <div class="card card-pad"><h2>Bankverbindung</h2><p class="card-sub">Damit deine Kunden wissen, wohin sie zahlen</p>
            <div class="form-grid">${input('bank', 'Bank')}${input('iban', 'IBAN', 's4')}${input('bic', 'BIC', 's2')}</div>
          </div>
        </div>
        <div class="grid grid-2">
          <div class="card card-pad"><h2>Nummern &amp; Zahlungsziel</h2><p class="card-sub">Rechnungsnummern werden fortlaufend vergeben</p>
            <div class="form-grid">
              ${input('invoice_prefix', 'Präfix Rechnungen', 's2')}${input('quote_prefix', 'Präfix Angebote', 's2')}
              <div class="field s2"><label for="s_next">Nächste Nr.</label><input id="s_next" name="next_invoice_number" type="number" min="1" value="${p.next_invoice_number}"></div>
              <div class="field"><label for="s_days">Zahlungsziel in Tagen</label><input id="s_days" name="payment_days" type="number" min="0" max="120" value="${p.payment_days}"></div>
            </div>
            <p class="small muted" style="margin:0">Vorschau: <b>${esc(p.invoice_prefix)}-${todayIso().slice(0, 4)}-${String(p.next_invoice_number).padStart(4, '0')}</b></p>
          </div>
          <div class="card card-pad"><h2>Erscheinungsbild ${f.logo ? '' : '<span class="badge b-open" style="margin-left:6px">Pro</span>'}</h2><p class="card-sub">Logo und Akzentfarbe deiner Rechnungen</p>
            <div class="field"><label>Logo</label>
              <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                <div id="logoPrev" style="width:120px;height:56px;border:1px dashed #cfd4df;border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fafbfd">${p.logo ? `<img src="${esc(p.logo)}" alt="" style="max-height:48px;max-width:110px">` : '<span class="small muted">Kein Logo</span>'}</div>
                <label class="btn btn-secondary btn-sm" style="cursor:pointer">Hochladen<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
                ${p.logo ? '<button type="button" class="btn btn-ghost btn-sm" id="logoRemove">Entfernen</button>' : ''}
              </div>
              <span class="hint">PNG, JPG, WebP oder SVG · max. 500 KB</span>
            </div>
            <div class="field"><label for="s_accent">Akzentfarbe</label><input id="s_accent" name="accent" type="color" value="${esc(p.accent)}" style="height:44px;padding:4px;width:100px"></div>
            <div class="field"><label for="s_footer">Zusatztext unter jeder Rechnung</label><textarea id="s_footer" name="footer_note" rows="2" placeholder="z. B. Vielen Dank für Ihr Vertrauen!">${esc(p.footer_note)}</textarea></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-lg" type="submit">Einstellungen speichern</button></div>
      </form>

      <div class="grid grid-2 mt-lg">
        <form class="card card-pad" id="pwForm"><h2>Passwort ändern</h2><p class="card-sub">Für dein Konto ${esc(S.me.email)}</p>
          <div class="field"><label>Aktuelles Passwort</label><input type="password" name="current" autocomplete="current-password" required></div>
          <div class="field"><label>Neues Passwort</label><input type="password" name="next" autocomplete="new-password" minlength="8" required></div>
          <button class="btn btn-secondary" type="submit">Passwort ändern</button>
        </form>
        <div class="card card-pad"><h2>Konto löschen</h2><p class="card-sub">Löscht dein Konto und alle Daten dauerhaft.</p>
          <p class="small muted">Tipp: Exportiere vorher deine Rechnungen als CSV und speichere die PDFs – Rechnungen musst du in Deutschland in der Regel 8 Jahre aufbewahren.</p>
          <button class="btn btn-danger" id="deleteAcc">Konto endgültig löschen</button>
        </div>
      </div>`;

    $('#logoFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!f.logo) {
        e.target.value = '';
        return showUpsell('logo');
      }
      if (file.size > 500 * 1024) return toast('Das Logo ist zu groß (max. 500 KB).', true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          S.profile = await api('/api/profile', { method: 'PUT', body: { logo: reader.result } });
          toast('Logo gespeichert');
          route();
        } catch (err) {
          fail(err);
        }
      };
      reader.readAsDataURL(file);
    });
    $('#logoRemove')?.addEventListener('click', async () => {
      try {
        await api('/api/profile', { method: 'PUT', body: { logo: '' } });
        route();
      } catch (err) {
        fail(err);
      }
    });
    $('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.small_business = e.target.small_business.checked;
      try {
        S.profile = await api('/api/profile', { method: 'PUT', body: data });
        await refreshMe();
        toast('Einstellungen gespeichert');
      } catch (err) {
        fail(err);
      }
    });
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/me/password', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
        e.target.reset();
        toast('Passwort geändert');
      } catch (err) {
        fail(err);
      }
    });
    $('#deleteAcc').addEventListener('click', async () => {
      if (!(await confirmDialog('Konto wirklich löschen?', 'Alle Rechnungen, Angebote und Kunden werden unwiderruflich gelöscht.', 'Endgültig löschen', true))) return;
      try {
        await api('/api/me', { method: 'DELETE' });
        location.href = '/';
      } catch (err) {
        fail(err);
      }
    });
  }

  // ---------- Abo ----------
  async function viewBilling(m, q, token) {
    await refreshMe();
    if (stale(token)) return;
    const me = S.me;
    const sub = me.subscription;
    const demo = me.billingMode === 'demo';
    let interval = me.subscription.interval || 'monthly';
    const end = sub.currentPeriodEnd ? dateDe(new Date(sub.currentPeriodEnd * 1000).toISOString().slice(0, 10)) : null;
    const checkout = q.get('checkout');
    const plans = S.plans;
    const perks = {
      free: ['3 Rechnungen pro Monat', 'Bis zu 5 Kunden', 'PDF-Export & Dashboard'],
      pro: ['Unbegrenzt Rechnungen & Kunden', 'Angebote → Rechnung', 'Eigenes Logo, ohne Branding', 'Zahlungserinnerungen', 'CSV-Export'],
      business: ['Alles aus Pro', 'Wiederkehrende Rechnungen', 'Bevorzugter Support', 'Neue Funktionen zuerst'],
    };
    const order = { free: 0, pro: 1, business: 2 };

    const draw = () => {
      view.innerHTML = `
        <div class="page-head"><div><h1>Abo &amp; Zahlung</h1><p>Wähle den Plan, der zu deinem Business passt. Monatlich kündbar.</p></div></div>
        ${checkout === 'success' ? `<div class="banner ok"><span><b>Willkommen im ${esc(me.planName)}-Plan! 🎉</b> Alle Funktionen sind jetzt freigeschaltet.</span><a class="btn btn-sm btn-success" href="#/dokument/neu">Rechnung schreiben</a></div>` : ''}
        ${checkout === 'cancel' ? `<div class="banner info"><span>Der Bezahlvorgang wurde abgebrochen. Kein Problem – du kannst jederzeit später upgraden.</span></div>` : ''}
        ${demo ? `<div class="banner warn"><span><b>Demo-Modus:</b> Stripe ist noch nicht verbunden. Upgrades werden ohne Zahlung sofort aktiviert. Trage deine Stripe-Schlüssel in der <code>.env</code> ein, um echte Abos zu verkaufen.</span></div>` : ''}
        <div class="card card-pad">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
            <div>
              <div class="muted small">Dein aktueller Plan</div>
              <div style="font-size:1.5rem;font-weight:750;color:var(--ink)">${esc(me.planName)} ${me.plan !== 'free' ? `<span class="badge ${sub.status === 'past_due' ? 'b-overdue' : 'b-paid'}" style="vertical-align:middle">${sub.status === 'trialing' ? 'Testphase' : sub.status === 'past_due' ? 'Zahlung offen' : 'Aktiv'}</span>` : ''}</div>
              <div class="muted small">${
                me.plan === 'free'
                  ? `${me.usage.invoicesThisMonth} von ${me.limits.invoicesPerMonth} Rechnungen diesen Monat genutzt`
                  : `${sub.interval === 'yearly' ? 'Jährliche' : 'Monatliche'} Abrechnung${end ? ` · ${sub.status === 'trialing' ? 'Testphase endet' : sub.cancelAtPeriodEnd ? 'Endet' : 'Nächste Verlängerung'} am ${end}` : ''}`
              }</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${me.plan !== 'free' || (!demo && sub.status) ? `<button class="btn btn-secondary" id="portalBtn">${I.card}${demo ? 'Kundenportal (Demo)' : 'Zahlung & Rechnungen verwalten'}</button>` : ''}
              ${demo && me.plan !== 'free' ? '<button class="btn btn-danger" id="demoCancel">Abo kündigen (Demo)</button>' : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;margin:28px 0 22px">
          <div class="billing-toggle" role="group" aria-label="Abrechnungszeitraum">
            <button type="button" data-int="monthly" class="${interval === 'monthly' ? 'active' : ''}">Monatlich</button>
            <button type="button" data-int="yearly" class="${interval === 'yearly' ? 'active' : ''}">Jährlich <span class="save-badge">2 Monate gratis</span></button>
          </div>
        </div>
        <div class="plans">${plans
          .map((p) => {
            const current = p.id === me.plan;
            const price = interval === 'yearly' ? p.price.yearly / 12 : p.price.monthly;
            let action;
            if (current && (p.id === 'free' || sub.interval === interval || demo === false)) action = '<button class="btn btn-secondary btn-block" disabled>Aktueller Plan</button>';
            else if (p.id === 'free') action = me.plan === 'free' ? '' : `<button class="btn btn-secondary btn-block" data-down>${demo ? 'Zu Starter wechseln' : 'Im Kundenportal kündigen'}</button>`;
            else if (me.plan !== 'free' && !demo) action = `<button class="btn ${order[p.id] > order[me.plan] ? 'btn-primary' : 'btn-secondary'} btn-block" data-portal>${order[p.id] > order[me.plan] ? 'Upgraden' : 'Wechseln'}</button>`;
            else action = `<button class="btn ${p.id === 'pro' ? 'btn-primary' : 'btn-secondary'} btn-block" data-plan="${p.id}">${me.plan === 'free' && S.trialDays && !sub.status ? `${S.trialDays} Tage gratis testen` : order[p.id] > order[me.plan] ? 'Upgraden' : current ? 'Intervall wechseln' : 'Wechseln'}</button>`;
            return `<div class="card plan-card${current ? ' current' : ''}">
              ${current ? '<span class="ribbon">Dein Plan</span>' : p.id === 'pro' && me.plan === 'free' ? '<span class="ribbon">Empfohlen</span>' : ''}
              <h3>${esc(p.name)}</h3>
              <div class="price"><span class="amount">${numDe(price)} €</span><span class="per">/ Monat</span></div>
              <div class="muted small">${p.id === 'free' ? 'Für immer kostenlos' : interval === 'yearly' ? `${p.price.yearly} € jährlich abgerechnet` : 'Monatlich kündbar'}</div>
              <ul>${perks[p.id].map((x) => `<li>${checkIcon}<span>${esc(x)}</span></li>`).join('')}</ul>
              <div style="margin-top:auto">${action}</div>
            </div>`;
          })
          .join('')}</div>
        <p class="small muted" style="text-align:center;margin-top:20px">Alle Preise zzgl. gesetzlicher USt. · Sichere Zahlung über Stripe · Kündigung jederzeit zum Ende des Abrechnungszeitraums</p>`;

      $$('[data-int]', view).forEach((b) =>
        b.addEventListener('click', () => {
          interval = b.dataset.int;
          draw();
        })
      );
      $$('[data-plan]', view).forEach((b) => b.addEventListener('click', () => startCheckout(b.dataset.plan, interval, b)));
      const portal = async (b) => {
        b.disabled = true;
        try {
          const r = await api('/api/billing/portal', { body: {} });
          if (r.demo) {
            toast('Im Demo-Modus gibt es kein Kundenportal.');
            b.disabled = false;
          } else location.href = r.url;
        } catch (err) {
          fail(err);
          b.disabled = false;
        }
      };
      $('#portalBtn')?.addEventListener('click', (e) => portal(e.currentTarget));
      $$('[data-portal]', view).forEach((b) => b.addEventListener('click', () => portal(b)));
      const demoCancel = async () => {
        if (!(await confirmDialog('Abo kündigen?', 'Du wechselst zurück in den kostenlosen Starter-Plan. Deine Daten bleiben erhalten.', 'Kündigen', true))) return;
        try {
          await api('/api/billing/demo-cancel', { body: {} });
          await refreshMe();
          toast('Abo gekündigt');
          viewBilling(m, new URLSearchParams(), routeToken);
        } catch (err) {
          fail(err);
        }
      };
      $('#demoCancel')?.addEventListener('click', demoCancel);
      $('[data-down]', view)?.addEventListener('click', (e) => (demo ? demoCancel() : portal(e.currentTarget)));
    };
    draw();
  }

  // ---------- Start ----------
  async function init() {
    try {
      const [me, plans] = await Promise.all([api('/api/me'), fetch('/api/plans').then((r) => r.json())]);
      S.me = me;
      S.plans = plans.plans;
      S.trialDays = plans.trialDays;
      S.profile = await api('/api/profile');
      route();
    } catch (err) {
      if (!err.handled) view.innerHTML = `<div class="card empty"><h3>Verbindung fehlgeschlagen</h3><p>${esc(err.message)}</p></div>`;
    }
  }
  init();
})();
