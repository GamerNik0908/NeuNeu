(() => {
  'use strict';

  // =====================================================================
  // Hilfsfunktionen
  // =====================================================================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const eur = (n) => eurFmt.format(Number(n) || 0);
  const eurShort = (n) => (Math.abs(n) >= 10000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T€` : eur(n).replace(',00', ''));
  const numDe = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 3 });
  const dateDe = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
  // Kaufmännisch runden – identisch zur Server-Logik
  const round = (n) => {
    const a = Math.abs(Number(n) || 0);
    if (a === 0) return 0;
    let r = Math.round(Number(`${a.toPrecision(15)}e2`)) / 100;
    if (!Number.isFinite(r)) r = Math.round(a * 100) / 100;
    return n < 0 ? -r : r;
  };
  const parseNum = (v) => {
    if (typeof v === 'number') return v;
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
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(days));
    return d.toISOString().slice(0, 10);
  };
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
  const monthShort = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
  const monthLong = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const initials = (s) => String(s || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const timeAgo = (ms) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString('de-DE')} · ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
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
    send: svg('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
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
    lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>', 'fill="currentColor"'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    xml: svg('<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>'),
    shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
    alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  };
  const checkIcon = `<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

  const STATUS = {
    draft: 'Entwurf', sent: 'Offen', overdue: 'Überfällig', paid: 'Bezahlt', cancelled: 'Storniert', issued: 'Stornorechnung',
    open: 'Offen', accepted: 'Angenommen', declined: 'Abgelehnt',
  };
  const badge = (s) => `<span class="badge b-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const INTERVALS = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich' };
  const EVENT_TEXT = {
    created: (d) => (d ? `Erstellt (${d})` : 'Erstellt'),
    finalized: (d) => `Abgeschlossen – Nummer ${d} vergeben`,
    sent_email: (d) => `Per E-Mail gesendet an ${d}`,
    status_paid: () => 'Als bezahlt markiert',
    status_sent: () => 'Wieder auf „offen“ gesetzt',
    status_accepted: () => 'Als angenommen markiert',
    status_declined: () => 'Als abgelehnt markiert',
    status_open: () => 'Wieder auf „offen“ gesetzt',
    cancelled: (d) => `Storniert durch Stornorechnung ${d}`,
    cancellation_created: (d) => `Stornorechnung zu ${d} erstellt`,
    reminder: (d) => `${d} vermerkt`,
    converted: () => 'In eine Rechnung umgewandelt',
    xrechnung: () => 'XRechnung heruntergeladen',
  };

  // =====================================================================
  // Zustand & API
  // =====================================================================
  const S = { me: null, profile: null, plans: [], trialDays: 14, meta: { countries: { DE: 'Deutschland' }, taxModes: {}, eu: [] }, dirty: null, pending: null };

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch(path, {
        method: opts.method || (opts.body ? 'POST' : 'GET'),
        headers: opts.body ? { 'Content-Type': 'application/json' } : {},
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new Error('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.');
    }
    if (res.status === 401) {
      location.href = '/login';
      throw Object.assign(new Error('Nicht angemeldet'), { handled: true });
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 402) {
      showUpsell(data.feature || 'generic', data.error);
      throw Object.assign(new Error(data.error), { handled: true });
    }
    if (res.status === 422 && Array.isArray(data.missing) && typeof data.missing[0] === 'object') {
      showMissing(data.missing);
      throw Object.assign(new Error(data.error), { handled: true });
    }
    if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
    return data;
  }
  const fail = (err) => !err.handled && toast(err.message, true);

  async function refreshMe() {
    S.me = await api('/api/me');
    renderChrome();
  }

  // =====================================================================
  // UI-Bausteine
  // =====================================================================
  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' err' : ''}`;
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.textContent = msg;
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstElementChild.remove();
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4000);
  }

  let lastFocus = null;
  function openModal(html, { wide = false, onClose } = {}) {
    closeModal(true);
    lastFocus = document.activeElement;
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const backdrop = root.firstElementChild;
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && closeModal());
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', () => closeModal()));
    root._onClose = onClose;
    $('input:not([type=checkbox]):not([type=hidden]), select, textarea, .btn-primary', root)?.focus({ preventScroll: true });
    return $('.modal', root);
  }
  function closeModal(silent) {
    const root = $('#modalRoot');
    if (!root.innerHTML) return;
    const cb = root._onClose;
    root._onClose = null;
    root.innerHTML = '';
    if (!silent && cb) cb();
    lastFocus?.focus?.();
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenus();
      closeModal();
    }
  });

  const modalHead = (title, sub = '') =>
    `<div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted small" style="margin:4px 0 0">${sub}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Schließen">${I.x}</button></div>`;

  function confirmDialog(title, text, okLabel = 'Bestätigen', danger = false) {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v) => {
        if (answered) return;
        answered = true;
        resolve(v);
      };
      const m = openModal(
        `${modalHead(title)}<div class="modal-body"><p class="muted" style="margin:0">${esc(text)}</p></div>
        <div class="modal-foot"><button class="btn btn-secondary" data-act="no">Abbrechen</button><button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-act="yes">${esc(okLabel)}</button></div>`,
        { onClose: () => done(false) }
      );
      m.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        done(act === 'yes');
        closeModal(true);
      });
    });
  }

  // Aufklapp-Menü für seltene Aktionen
  function closeMenus() {
    $$('.menu.open').forEach((m) => m.classList.remove('open'));
  }
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-menu]');
    if (trigger) {
      const menu = trigger.nextElementSibling;
      const wasOpen = menu.classList.contains('open');
      closeMenus();
      if (!wasOpen) menu.classList.add('open');
      e.stopPropagation();
      return;
    }
    if (!e.target.closest('.menu')) closeMenus();
  });

  function showMissing(missing) {
    const link = (m) => (m.where === 'settings' ? '#/einstellungen' : '#/kunden');
    openModal(
      `${modalHead('Es fehlen noch Pflichtangaben', 'Damit deine Rechnung gültig ist (§ 14 UStG), ergänze bitte:')}
      <div class="modal-body"><ul class="missing-list">${missing
        .map((m) => `<li>${I.alert}<span>${esc(m.label)}</span><a href="${link(m)}" class="small">${m.where === 'settings' ? 'Einstellungen' : 'Kunden'} →</a></li>`)
        .join('')}</ul></div>
      <div class="modal-foot"><button class="btn btn-primary" data-close>Verstanden</button></div>`
    );
  }

  const UPSELL = {
    invoices: { title: 'Dein Monatslimit ist erreicht', text: 'Im Starter-Plan kannst du 3 Rechnungen pro Monat abschließen. Mit Pro schreibst du so viele, wie du möchtest – dein Entwurf bleibt gespeichert.', plan: 'pro' },
    customers: { title: 'Mehr Kunden mit Pro', text: 'Im Starter-Plan kannst du bis zu 5 Kunden anlegen. Mit Pro gibt es kein Limit.', plan: 'pro' },
    quotes: { title: 'Angebote gibt es ab Pro', text: 'Schreibe Angebote im gleichen Design und wandle sie nach der Zusage mit einem Klick in eine Rechnung um.', plan: 'pro' },
    logo: { title: 'Dein Logo auf jeder Rechnung', text: 'Mit Pro erscheinen deine Rechnungen mit eigenem Logo und ohne Fakturo-Hinweis.', plan: 'pro' },
    reminders: { title: 'Schneller bezahlt werden', text: 'Mit Pro verschickst du höfliche Zahlungserinnerungen und Mahnungen mit einem Klick – die Texte sind schon fertig.', plan: 'pro' },
    csvExport: { title: 'Export für die Steuer', text: 'Mit Pro exportierst du alle Rechnungen eines Jahres als CSV – für Steuerberatung, EÜR und Excel.', plan: 'pro' },
    recurring: { title: 'Rechnungen, die sich selbst schreiben', text: 'Mit Business erstellt Fakturo wiederkehrende Rechnungen für Retainer, Wartung und Abos automatisch.', plan: 'business' },
    generic: { title: 'Upgrade auf Pro', text: 'Schalte alle Funktionen frei.', plan: 'pro' },
  };
  const PERKS = {
    pro: ['Unbegrenzt Rechnungen & Kunden', 'Angebote mit 1-Klick-Umwandlung', 'Eigenes Logo, ohne Fakturo-Hinweis', 'Zahlungserinnerungen & CSV-Export'],
    business: ['Alles aus Pro', 'Wiederkehrende Rechnungen automatisch', 'Monatlich, vierteljährlich, jährlich', 'Bevorzugter Support'],
  };

  function showUpsell(feature, message) {
    const u = UPSELL[feature] || UPSELL.generic;
    if (S.me?.isDemo) {
      return openModal(`<div class="upsell"><div class="ico">${I.star}</div><h2>Gefällt dir Fakturo?</h2>
        <p>${esc(message || u.text)}</p><p>Erstelle jetzt dein kostenloses Konto – in 30 Sekunden.</p>
        <button class="btn btn-primary btn-lg btn-block" data-register>Kostenloses Konto erstellen</button>
        <button class="btn btn-ghost btn-sm mt" data-close>Weiter umsehen</button></div>`).querySelector('[data-register]').addEventListener('click', leaveDemo);
    }
    const price = u.plan === 'pro' ? '9 €' : '19 €';
    const fresh = S.trialDays && !S.me?.subscription?.status;
    const m = openModal(
      `<div class="upsell">
        <div class="ico">${I.star}</div>
        <h2>${esc(u.title)}</h2>
        <p>${esc(feature === 'generic' && message ? message : u.text)}</p>
        <ul>${PERKS[u.plan].map((p) => `<li>${checkIcon}<span>${esc(p)}</span></li>`).join('')}</ul>
        <button class="btn btn-primary btn-lg btn-block" data-checkout="${u.plan}">${fresh ? `${S.trialDays} Tage kostenlos testen` : `Jetzt auf ${u.plan === 'pro' ? 'Pro' : 'Business'} upgraden`}</button>
        <p class="small muted" style="margin:12px 0 0">${fresh ? `Danach ${price}/Monat · ` : `${price}/Monat · `}monatlich kündbar · <a href="#/abo" data-close>Pläne vergleichen</a></p>
        <button class="btn btn-ghost btn-sm mt" data-close>Vielleicht später</button>
      </div>`
    );
    $('[data-checkout]', m).addEventListener('click', (e) => startCheckout(u.plan, 'monthly', e.currentTarget));
  }

  async function startCheckout(plan, interval, button) {
    if (S.me.isDemo) return showUpsell('generic');
    if (button) button.disabled = true;
    try {
      const r = await api('/api/billing/checkout', { body: { plan, interval } });
      if (r.demo) {
        closeModal(true);
        await refreshMe();
        location.hash = '#/abo?checkout=success';
      } else location.href = r.url;
    } catch (err) {
      fail(err);
      if (button) button.disabled = false;
    }
  }

  async function leaveDemo() {
    await api('/api/auth/logout', { body: {} }).catch(() => {});
    location.href = '/register';
  }

  function countryOptions(selected) {
    const entries = Object.entries(S.meta.countries);
    return entries.map(([code, name]) => `<option value="${code}" ${code === selected ? 'selected' : ''}>${esc(name)}</option>`).join('');
  }

  // =====================================================================
  // Rahmen
  // =====================================================================
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
    const active = (p) => (p === '/' ? path === '/' : path.startsWith(p) || (p === '/rechnungen' && path.startsWith('/dokument') && S.docType !== 'quote') || (p === '/angebote' && path.startsWith('/dokument') && S.docType === 'quote'));
    $('#sideNav').innerHTML = items
      .map((it) =>
        it
          ? `<a href="#${it[0]}" class="${active(it[0]) ? 'active' : ''}" ${active(it[0]) ? 'aria-current="page"' : ''}>${it[2]}<span>${it[1]}</span>${it[3] ? `<span class="lock">${it[3]}</span>` : ''}</a>`
          : '<div class="side-sep"></div>'
      )
      .join('');

    const box = $('#planBox');
    if (me.isDemo) {
      box.innerHTML = `<div class="plan-name">Demo-Konto</div><div class="muted">Alle Funktionen freigeschaltet. Beispieldaten werden nach 24 Std. gelöscht.</div>
        <button class="btn btn-primary btn-block" data-leave-demo>Eigenes Konto erstellen</button>`;
    } else if (me.plan === 'free') {
      const used = me.usage.invoicesThisMonth;
      const lim = me.limits.invoicesPerMonth;
      box.innerHTML = `<div class="plan-name">Starter-Plan <span class="badge b-draft">Kostenlos</span></div>
        <div class="meter${used >= lim ? ' full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${lim}" aria-valuenow="${used}"><span style="width:${Math.min(100, (used / lim) * 100)}%"></span></div>
        <div class="muted">${used} von ${lim} Rechnungen in ${esc(monthLong(todayIso().slice(0, 7)).split(' ')[0])}</div>
        <a href="#/abo" class="btn btn-primary btn-block">Auf Pro upgraden</a>`;
    } else {
      const sub = me.subscription;
      const end = sub.currentPeriodEnd ? dateDe(new Date(sub.currentPeriodEnd * 1000).toISOString().slice(0, 10)) : '';
      const line = sub.status === 'trialing' ? `Testphase bis ${end}` : sub.cancelAtPeriodEnd ? `Endet am ${end}` : sub.status === 'past_due' ? 'Zahlung ausstehend' : end ? `Verlängert sich am ${end}` : 'Aktiv';
      box.innerHTML = `<div class="plan-name">${esc(me.planName)}-Plan <span class="badge ${sub.status === 'past_due' ? 'b-overdue' : 'b-paid'}">${sub.status === 'past_due' ? 'Offen' : 'Aktiv'}</span></div>
        <div class="muted">${esc(line)}</div>
        <a href="#/abo" class="btn btn-secondary btn-block">Abo verwalten</a>`;
    }
    $('[data-leave-demo]', box)?.addEventListener('click', leaveDemo);

    $('#userRow').innerHTML = `<div class="avatar" aria-hidden="true">${esc(initials(me.name || me.email))}</div>
      <div class="who"><b>${esc(me.name || 'Mein Konto')}</b><span>${esc(me.isDemo ? 'Demo-Konto' : me.email)}</span></div>
      <button class="icon-btn" id="logoutBtn" title="Abmelden" aria-label="Abmelden">${I.logout}</button>`;
    $('#logoutBtn').onclick = async () => {
      await api('/api/auth/logout', { body: {} }).catch(() => {});
      location.href = '/';
    };

    $('#topBanner').innerHTML = me.isDemo
      ? `<div class="demo-banner"><span>${I.eye}<span><b>Demo-Modus:</b> Du siehst Beispieldaten. Probier alles aus – E-Mails werden nicht versendet.</span></span><button class="btn btn-sm btn-primary" data-leave-demo>Kostenloses Konto erstellen</button></div>`
      : me.subscription.status === 'past_due'
        ? `<div class="demo-banner warn"><span>${I.alert}<span>Deine letzte Abo-Zahlung ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode, damit dein Plan aktiv bleibt.</span></span><a class="btn btn-sm btn-secondary" href="#/abo">Zahlung aktualisieren</a></div>`
        : '';
    $('[data-leave-demo]', $('#topBanner'))?.addEventListener('click', leaveDemo);
  }

  $('#menuBtn').addEventListener('click', () => $('#shell').classList.toggle('menu-open'));
  $('#menuScrim').addEventListener('click', () => $('#shell').classList.remove('menu-open'));

  // =====================================================================
  // Router (mit Schutz vor ungespeicherten Änderungen)
  // =====================================================================
  const routes = [
    [/^\/$/, viewDashboard],
    [/^\/willkommen$/, viewWelcome],
    [/^\/rechnungen$/, (m, q, t) => viewList('invoice', q, t)],
    [/^\/angebote$/, (m, q, t) => viewList('quote', q, t)],
    [/^\/dokument\/neu$/, (m, q, t) => viewEditor(null, q, t)],
    [/^\/dokument\/(\d+)$/, (m, q, t) => viewEditor(Number(m[1]), q, t)],
    [/^\/kunden$/, viewCustomers],
    [/^\/wiederkehrend$/, viewRecurring],
    [/^\/einstellungen$/, viewSettings],
    [/^\/abo$/, viewBilling],
  ];
  let routeToken = 0;
  let currentHash = location.hash;
  const view = $('#view');
  const stale = (token) => token !== routeToken;

  async function route() {
    const token = ++routeToken;
    const [path, qs] = (location.hash.replace(/^#/, '') || '/').split('?');
    const q = new URLSearchParams(qs || '');
    S.dirty = null;
    S.docType = null;
    $('#shell').classList.remove('menu-open');
    closeModal(true);
    closeMenus();
    const match = routes.find(([re]) => re.test(path));
    if (!match) {
      location.replace('#/');
      return;
    }
    renderChrome();
    view.innerHTML = '<div class="loading" aria-label="Wird geladen"><div class="spinner"></div></div>';
    try {
      await match[1](path.match(match[0]), q, token);
      if (stale(token)) return;
      renderChrome();
      view.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } catch (err) {
      if (stale(token) || err.handled) return;
      view.innerHTML = `<div class="card empty"><h3>Das hat nicht geklappt</h3><p>${esc(err.message)}</p><a class="btn btn-secondary" href="#/">Zur Übersicht</a></div>`;
    }
  }

  window.addEventListener('hashchange', async () => {
    if (S.dirty && S.dirty() && location.hash !== currentHash) {
      const target = location.hash;
      history.replaceState(null, '', currentHash);
      if (!(await confirmDialog('Ungespeicherte Änderungen', 'Du hast Änderungen, die noch nicht gespeichert sind. Wenn du die Seite verlässt, gehen sie verloren.', 'Verwerfen & verlassen', true))) return;
      S.dirty = null;
      history.replaceState(null, '', target);
    }
    currentHash = location.hash;
    route();
  });
  window.addEventListener('beforeunload', (e) => {
    if (S.dirty && S.dirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const go = (hash) => {
    if (location.hash === hash) route();
    else location.hash = hash;
  };

  // =====================================================================
  // Übersicht
  // =====================================================================
  function niceMax(v) {
    if (v <= 0) return 1000;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function revenueChart(months) {
    const max = niceMax(Math.max(...months.map((m) => m.paid)));
    const ticks = [max, max / 2, 0];
    return `<div class="chart" role="img" aria-label="Bezahlter Umsatz netto der letzten 12 Monate">
      <div class="chart-grid">${ticks.map((t) => `<div class="tick"><span>${eurShort(t)}</span></div>`).join('')}</div>
      <div class="chart-bars">${months
        .map(
          (m) => `<div class="cbar" tabindex="0" data-tip="${esc(monthLong(m.month))}: ${esc(eur(m.paid))} bezahlt · ${esc(eur(m.invoiced))} berechnet">
            <div class="cbar-fill${m.paid ? '' : ' zero'}" style="height:${m.paid ? Math.max(2, (m.paid / max) * 100) : 0}%"></div>
            <span>${esc(monthShort(m.month))}</span></div>`
        )
        .join('')}</div>
      <div class="chart-tip" hidden></div>
    </div>
    <details class="table-toggle"><summary>Als Tabelle anzeigen</summary>
      <table class="tbl small"><thead><tr><th>Monat</th><th class="right">Berechnet (netto)</th><th class="right">Bezahlt (netto)</th></tr></thead>
      <tbody>${months.map((m) => `<tr><td>${esc(monthLong(m.month))}</td><td class="right num">${eur(m.invoiced)}</td><td class="right num">${eur(m.paid)}</td></tr>`).join('')}</tbody></table>
    </details>`;
  }

  function bindChart(root) {
    const chart = $('.chart', root);
    if (!chart) return;
    const tip = $('.chart-tip', chart);
    const show = (bar) => {
      tip.textContent = bar.dataset.tip;
      tip.hidden = false;
      const cr = chart.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const x = Math.min(Math.max(br.left - cr.left + br.width / 2, 90), cr.width - 90);
      tip.style.left = `${x}px`;
    };
    $$('.cbar', chart).forEach((bar) => {
      bar.addEventListener('mouseenter', () => show(bar));
      bar.addEventListener('focus', () => show(bar));
      bar.addEventListener('mouseleave', () => (tip.hidden = true));
      bar.addEventListener('blur', () => (tip.hidden = true));
    });
  }

  async function viewDashboard(m, q, token) {
    const [stats, customers, profile] = await Promise.all([api('/api/stats'), api('/api/customers'), api('/api/profile')]);
    if (stale(token)) return;
    S.profile = profile;
    const me = S.me;
    const p = profile;
    const steps = [
      { done: Boolean((p.company || p.owner) && p.street && p.city), label: 'Firmenname & Anschrift eintragen', href: '#/einstellungen' },
      { done: Boolean(p.tax_number || p.vat_id), label: 'Steuernummer oder USt-IdNr. hinterlegen', href: '#/einstellungen' },
      { done: Boolean(p.iban), label: 'Bankverbindung hinterlegen', href: '#/einstellungen' },
      { done: customers.length > 0, label: 'Ersten Kunden anlegen', href: '#/kunden?neu=1' },
      { done: stats.invoiceCount > 0, label: 'Erste Rechnung schreiben', href: '#/dokument/neu' },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const year = todayIso().slice(0, 4);
    const nearLimit = !me.isDemo && me.plan === 'free' && me.usage.invoicesThisMonth >= me.limits.invoicesPerMonth - 1;
    const hello = (me.name || '').split(' ')[0];
    const hour = new Date().getHours();
    const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
    const kpi = (dot, label, value, sub, extra = '') =>
      `<div class="card kpi"><div class="label"><span class="dot" style="background:${dot}"></span>${label}</div><div class="value" ${extra}>${value}</div><div class="sub">${sub}</div></div>`;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    view.innerHTML = `
      <div class="page-head">
        <div><h1>${hello ? `${greet}, ${esc(hello)}` : 'Übersicht'}</h1><p>Hier ist der aktuelle Stand deiner Rechnungen.</p></div>
        <div class="page-actions">
          ${me.features.quotes ? `<a href="#/dokument/neu?type=quote" class="btn btn-secondary">${I.quote}Neues Angebot</a>` : ''}
          <a href="#/dokument/neu" class="btn btn-primary">${I.plus}Neue Rechnung</a>
        </div>
      </div>
      ${nearLimit ? `<div class="banner warn"><span>${I.alert}<span><b>${me.usage.invoicesThisMonth} von ${me.limits.invoicesPerMonth}</b> kostenlosen Rechnungen in diesem Monat genutzt. Mit Pro schreibst du unbegrenzt Rechnungen.</span></span><button class="btn btn-sm btn-primary" data-up>Pro ${S.trialDays} Tage testen</button></div>` : ''}
      ${stats.drafts.n ? `<div class="banner info"><span>${I.file}<span>Du hast <b>${plural(stats.drafts.n, 'Rechnungsentwurf', 'Rechnungsentwürfe')}</b>, ${stats.drafts.n === 1 ? 'der noch nicht abgeschlossen ist' : 'die noch nicht abgeschlossen sind'}.</span></span><a class="btn btn-sm btn-secondary" href="#/rechnungen?f=draft">Ansehen</a></div>` : ''}
      <div class="grid grid-4">
        ${kpi('var(--primary)', 'Offen', eur(stats.open.s), plural(stats.open.n, 'Rechnung', 'Rechnungen'))}
        ${kpi('var(--red)', 'Überfällig', eur(stats.overdue.s), stats.overdue.n ? `${plural(stats.overdue.n, 'Rechnung', 'Rechnungen')} – <a href="#/rechnungen?f=overdue">ansehen</a>` : 'Alles im grünen Bereich', stats.overdue.n ? 'style="color:var(--red)"' : '')}
        ${kpi('var(--green)', `Bezahlt ${year}`, eur(stats.paidYear.s), `${eur(stats.paidYear.net)} netto`)}
        ${stats.avgDays !== null ? kpi('var(--amber)', 'Ø Zahlungsdauer', `${stats.avgDays} Tage`, 'von Rechnung bis Zahlungseingang') : kpi('var(--amber)', 'Offene Angebote', eur(stats.quotes.s), plural(stats.quotes.n, 'Angebot', 'Angebote'))}
      </div>
      <div class="grid grid-main mt">
        <div class="card card-pad">
          <div class="card-title-row"><div><h2>Umsatz</h2><p class="card-sub">Bezahlte Rechnungen (netto), letzte 12 Monate</p></div></div>
          ${revenueChart(stats.months)}
        </div>
        ${
          doneCount < steps.length
            ? `<div class="card card-pad">
            <h2>Einrichtung</h2><p class="card-sub">Damit deine Rechnungen alle Pflichtangaben enthalten</p>
            <div class="progress-label"><span>Fortschritt</span><span>${doneCount} von ${steps.length}</span></div>
            <div class="meter"><span style="width:${(doneCount / steps.length) * 100}%"></span></div>
            <div class="checklist mt">${steps.map((s) => `<a href="${s.href}" class="${s.done ? 'done' : ''}"><span class="tick">${s.done ? I.check : ''}</span><span>${esc(s.label)}</span></a>`).join('')}</div>
          </div>`
            : stats.overdueList.length
              ? `<div class="card card-pad"><h2>Überfällig</h2><p class="card-sub">Diese Kunden haben noch nicht bezahlt</p>
              <div class="mini-list">${stats.overdueList
                .map((d) => `<a href="#/dokument/${d.id}"><div><b>${esc(d.customer.name)}</b><span class="muted small">${esc(d.number)} · seit ${daysBetween(d.due_date, todayIso())} Tagen fällig</span></div><b class="num">${eur(d.total)}</b></a>`)
                .join('')}</div></div>`
              : `<div class="card card-pad"><h2>Top-Kunden ${year}</h2><p class="card-sub">Nach berechnetem Umsatz (netto)</p>
              ${
                stats.top.length
                  ? `<div class="mini-list">${stats.top.map((c) => `<div class="row"><span>${esc(c.name)}</span><b class="num">${eur(c.net)}</b></div>`).join('')}</div>`
                  : '<p class="muted small">Sobald du Rechnungen abschließt, siehst du hier deine wichtigsten Kunden.</p>'
              }</div>`
        }
      </div>
      <div class="card table-card mt">
        <div class="card-pad" style="padding-bottom:12px"><h2>Zuletzt bearbeitet</h2></div>
        ${
          stats.recent.length
            ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Dokument</th><th>Kunde</th><th class="hide-sm">Datum</th><th class="right">Betrag</th><th>Status</th></tr></thead><tbody>
          ${stats.recent.map((d) => `<tr class="link" data-href="#/dokument/${d.id}"><td class="strong">${d.number ? esc(d.number) : '<span class="muted">Entwurf</span>'}<div class="small muted">${d.kind === 'cancellation' ? 'Stornorechnung' : d.type === 'quote' ? 'Angebot' : 'Rechnung'}</div></td><td>${esc(d.customer.name)}</td><td class="hide-sm">${dateDe(d.issue_date)}</td><td class="right num strong">${eur(d.total)}</td><td>${badge(d.status)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="empty"><div class="ico">${I.invoice}</div><h3>Noch keine Dokumente</h3><p>Schreib deine erste Rechnung – das dauert nur zwei Minuten.</p><a href="#/dokument/neu" class="btn btn-primary">${I.plus}Erste Rechnung schreiben</a></div>`
        }
      </div>`;
    bindRowLinks();
    bindChart(view);
    $('[data-up]', view)?.addEventListener('click', (e) => startCheckout('pro', 'monthly', e.currentTarget));
  }

  function bindRowLinks() {
    $$('tr[data-href]', view).forEach((tr) => {
      tr.tabIndex = 0;
      const open = (e) => {
        if (e.target.closest('button, a')) return;
        location.hash = tr.dataset.href;
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => e.key === 'Enter' && open(e));
    });
  }

  function exportCsv(year) {
    if (!S.me.features.csvExport) return showUpsell('csvExport');
    location.href = `/api/export.csv?year=${encodeURIComponent(year)}`;
  }

  // =====================================================================
  // Willkommen / Onboarding
  // =====================================================================
  async function viewWelcome(m, q, token) {
    const p = await api('/api/profile');
    if (stale(token)) return;
    S.profile = p;
    view.innerHTML = `
      <div class="narrow">
        <div class="page-head"><div><h1>Willkommen bei Fakturo 👋</h1><p>Zwei Minuten Einrichtung – dann ist deine erste Rechnung fertig. Diese Angaben stehen auf jeder Rechnung.</p></div></div>
        <form class="card card-pad" id="welcomeForm" novalidate>
          <div class="section-title">Absender</div>
          <div class="form-grid">
            <div class="field s3"><label for="w_company">Firmenname <span class="opt">(optional)</span></label><input id="w_company" name="company" value="${esc(p.company)}" placeholder="z. B. Weber Design"></div>
            <div class="field s3"><label for="w_owner">Vor- und Nachname</label><input id="w_owner" name="owner" value="${esc(p.owner)}" required></div>
            <div class="field"><label for="w_street">Straße und Hausnummer</label><input id="w_street" name="street" value="${esc(p.street)}" autocomplete="street-address" required></div>
            <div class="field s2"><label for="w_zip">PLZ</label><input id="w_zip" name="zip" value="${esc(p.zip)}" inputmode="numeric" autocomplete="postal-code" required></div>
            <div class="field s4"><label for="w_city">Ort</label><input id="w_city" name="city" value="${esc(p.city)}" autocomplete="address-level2" required></div>
          </div>
          <div class="section-title mt">Steuer & Bank</div>
          <div class="form-grid">
            <div class="field s3"><label for="w_tax">Steuernummer</label><input id="w_tax" name="tax_number" value="${esc(p.tax_number)}" placeholder="12/345/67890"><span class="hint">Steht auf deinem Steuerbescheid. Alternativ USt-IdNr. in den Einstellungen.</span></div>
            <div class="field s3"><label for="w_iban">IBAN</label><input id="w_iban" name="iban" value="${esc(p.iban)}" placeholder="DE00 0000 0000 0000 0000 00" autocomplete="off"></div>
          </div>
          <label class="switch"><input type="checkbox" name="small_business" ${p.small_business ? 'checked' : ''}><div><b>Ich bin Kleinunternehmer/in (§ 19 UStG)</b><span>Keine Umsatzsteuer auf Rechnungen, der Pflichthinweis wird automatisch eingefügt. Unsicher? Steht in deinem Fragebogen zur steuerlichen Erfassung.</span></div></label>
          <div class="form-actions">
            <a href="#/" class="btn btn-ghost">Später erledigen</a>
            <button class="btn btn-primary" type="submit">Speichern & erste Rechnung schreiben ${I.arrow}</button>
          </div>
        </form>
      </div>`;
    $('#welcomeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.small_business = e.target.elements.small_business.checked;
      try {
        S.profile = await api('/api/profile', { method: 'PUT', body: data });
        await refreshMe();
        location.hash = '#/dokument/neu';
      } catch (err) {
        fail(err);
      }
    });
  }

  // =====================================================================
  // Listen
  // =====================================================================
  async function viewList(type, q, token) {
    const me = S.me;
    const isQuote = type === 'quote';
    if (isQuote && !me.features.quotes) {
      view.innerHTML = lockedView('Angebote', 'quotes', I.quote, ['Angebote im gleichen Design wie deine Rechnungen', 'Nach Zusage mit einem Klick zur Rechnung', 'Status: offen, angenommen, abgelehnt']);
      bindLocked();
      return;
    }
    const docs = await api(`/api/documents?type=${type}`);
    if (stale(token)) return;
    let filter = q.get('f') || 'all';
    let search = '';
    const filters = isQuote
      ? [['all', 'Alle'], ['open', 'Offen'], ['accepted', 'Angenommen'], ['declined', 'Abgelehnt']]
      : [['all', 'Alle'], ['draft', 'Entwürfe'], ['sent', 'Offen'], ['overdue', 'Überfällig'], ['paid', 'Bezahlt'], ['cancelled', 'Storniert']];
    const count = (f) => (f === 'all' ? docs.length : docs.filter((d) => d.status === f || (f === 'cancelled' && d.status === 'issued')).length);

    view.innerHTML = `
      <div class="page-head">
        <div><h1>${isQuote ? 'Angebote' : 'Rechnungen'}</h1><p>${isQuote ? 'Angebote schreiben und nach Zusage in Rechnungen umwandeln.' : 'Alle Rechnungen mit Status, Fälligkeit und Betrag.'}</p></div>
        <div class="page-actions">
          ${isQuote ? '' : `<button class="btn btn-secondary" id="exportBtn">${I.download}CSV-Export</button>`}
          <a href="#/dokument/neu${isQuote ? '?type=quote' : ''}" class="btn btn-primary">${I.plus}${isQuote ? 'Neues Angebot' : 'Neue Rechnung'}</a>
        </div>
      </div>
      ${docs.length ? `<div class="toolbar"><div class="tabs" id="tabs" role="tablist">${filters.map(([k, l]) => `<button role="tab" data-f="${k}" class="${k === filter ? 'active' : ''}" aria-selected="${k === filter}">${l}<span class="count">${count(k)}</span></button>`).join('')}</div>
        <div class="search">${I.search}<input class="input" id="search" type="search" placeholder="Nummer, Kunde oder Betreff …" aria-label="Suchen"></div></div>` : ''}
      <div class="card table-card" id="listBox"></div>`;

    const box = $('#listBox');
    const draw = () => {
      const rows = docs.filter(
        (d) =>
          (filter === 'all' || d.status === filter || (filter === 'cancelled' && d.status === 'issued')) &&
          (!search || `${d.number} ${d.customer.name} ${d.title} ${d.reference} ${d.customer.number}`.toLowerCase().includes(search))
      );
      if (!docs.length) {
        box.innerHTML = `<div class="empty"><div class="ico">${isQuote ? I.quote : I.invoice}</div><h3>Noch keine ${isQuote ? 'Angebote' : 'Rechnungen'}</h3><p>${isQuote ? 'Erstelle dein erstes Angebot und wandle es nach der Zusage in eine Rechnung um.' : 'Deine Rechnungen erscheinen hier – mit Status, Fälligkeit und Betrag.'}</p><a href="#/dokument/neu${isQuote ? '?type=quote' : ''}" class="btn btn-primary">${I.plus}${isQuote ? 'Angebot erstellen' : 'Rechnung schreiben'}</a></div>`;
        return;
      }
      if (!rows.length) {
        box.innerHTML = `<div class="empty"><h3>Keine Treffer</h3><p>Für diese Auswahl gibt es keine Einträge.</p></div>`;
        return;
      }
      const sum = rows.filter((d) => d.status !== 'cancelled').reduce((s, d) => s + d.total, 0);
      box.innerHTML = `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Nummer</th><th>Kunde</th><th class="hide-sm">Datum</th><th class="hide-sm">${isQuote ? 'Gültig bis' : 'Fällig'}</th><th class="right">Betrag</th><th>Status</th><th><span class="sr-only">Aktionen</span></th></tr></thead><tbody>
        ${rows
          .map((d) => {
            const overdueDays = d.status === 'overdue' ? daysBetween(d.due_date, todayIso()) : 0;
            return `<tr class="link" data-href="#/dokument/${d.id}">
            <td class="strong">${d.number ? esc(d.number) : '<span class="muted">Entwurf</span>'}${d.title ? `<div class="small muted">${esc(d.title)}</div>` : d.kind === 'cancellation' ? '<div class="small muted">Stornorechnung</div>' : ''}</td>
            <td>${esc(d.customer.name)}</td>
            <td class="hide-sm">${dateDe(d.issue_date)}</td>
            <td class="hide-sm" style="${overdueDays ? 'color:var(--red);font-weight:600' : ''}">${d.kind === 'cancellation' ? '–' : dateDe(d.due_date)}${overdueDays ? `<div class="small">seit ${overdueDays} ${overdueDays === 1 ? 'Tag' : 'Tagen'}</div>` : ''}</td>
            <td class="right num strong">${eur(d.total)}</td>
            <td>${badge(d.status)}${d.reminder_level ? `<div class="small muted">${d.reminder_level}× erinnert</div>` : ''}</td>
            <td class="right">${['sent', 'overdue'].includes(d.status) ? `<button class="btn btn-sm btn-secondary" data-paid="${d.id}" title="Als bezahlt markieren">${I.check}<span class="hide-sm">Bezahlt</span></button>` : ''}</td>
          </tr>`;
          })
          .join('')}</tbody>
        <tfoot><tr><td colspan="4" class="muted small hide-sm">${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'}</td><td class="right num strong">${eur(sum)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
      bindRowLinks();
      $$('[data-paid]', box).forEach((b) =>
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const updated = await api(`/api/documents/${b.dataset.paid}/status`, { body: { status: 'paid' } });
            Object.assign(docs.find((d) => d.id === updated.id), { status: 'paid', paid_at: updated.paid_at });
            toast(`${updated.number} als bezahlt markiert 🎉`);
            draw();
          } catch (err) {
            fail(err);
            b.disabled = false;
          }
        })
      );
    };
    draw();
    $('#tabs')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      $$('#tabs button').forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-selected', x === b);
      });
      history.replaceState(null, '', `#/${isQuote ? 'angebote' : 'rechnungen'}${filter === 'all' ? '' : `?f=${filter}`}`);
      currentHash = location.hash;
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
        <button class="btn btn-primary btn-lg" data-checkout="${u.plan}">${u.plan === 'pro' ? 'Pro' : 'Business'} ${S.trialDays} Tage kostenlos testen</button>
        <p class="small muted" style="margin-top:12px">Danach ${u.plan === 'pro' ? '9 €' : '19 €'}/Monat · monatlich kündbar · <a href="#/abo">Pläne vergleichen</a></p>
      </div></div>`;
  }
  function bindLocked() {
    $$('[data-checkout]', view).forEach((b) => b.addEventListener('click', () => startCheckout(b.dataset.checkout, 'monthly', b)));
  }

  // =====================================================================
  // Rechnungspapier (HTML-Vorschau, entspricht dem PDF)
  // =====================================================================
  function computeTotals(items, mode) {
    const groups = {};
    let subtotal = 0;
    for (const it of items) {
      const net = round(parseNum(it.quantity) * parseNum(it.price));
      subtotal += net;
      const rate = mode === 'standard' ? Number(it.taxRate) : 0;
      groups[rate] = round((groups[rate] || 0) + net);
    }
    const list = Object.entries(groups)
      .map(([rate, net]) => ({ rate: Number(rate), net, tax: round((net * Number(rate)) / 100) }))
      .sort((a, b) => b.rate - a.rate);
    subtotal = round(subtotal);
    const tax = round(list.reduce((s, g) => s + g.tax, 0));
    return { subtotal, groups: list, tax, total: round(subtotal + tax) };
  }

  function serviceText(d) {
    if (d.service_from && d.service_to && d.service_from !== d.service_to) return ['Leistungszeitraum', `${dateDe(d.service_from)} – ${dateDe(d.service_to)}`];
    if (d.service_from) return ['Leistungsdatum', dateDe(d.service_from)];
    if (d.service_date) return ['Leistungszeitraum', esc(d.service_date)];
    return ['Leistungsdatum', dateDe(d.issue_date)];
  }

  function paperHtml(d, seller, c = {}) {
    const isQuote = d.type === 'quote';
    const isStorno = d.kind === 'cancellation';
    const isDraft = d.type === 'invoice' && (d.status === 'draft' || !d.status);
    const mode = d.tax_mode || 'standard';
    const t = computeTotals(d.items, mode);
    const name = seller.company || seller.owner || 'Dein Firmenname';
    const heading = isStorno ? 'Stornorechnung' : isQuote ? 'Angebot' : 'Rechnung';
    const lines = d.items.filter((it) => it.description || parseNum(it.price));
    const showTax = mode === 'standard' && new Set(lines.map((l) => Number(l.taxRate))).size > 1;
    const countryName = (code) => S.meta.countries[code] || code;
    const sender = [name, seller.street, [seller.zip, seller.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const meta = [[isQuote ? 'Angebotsnr.' : isStorno ? 'Stornonr.' : 'Rechnungsnr.', `<b>${esc(d.number || 'Entwurf')}</b>`], [isQuote ? 'Angebotsdatum' : 'Datum', dateDe(d.issue_date)]];
    if (c.number) meta.push(['Kundennr.', esc(c.number)]);
    if (!isQuote) meta.push(serviceText(d));
    if (isStorno && d.source) meta.push(['Bezug', `${esc(d.source.number)} vom ${dateDe(d.source.issue_date)}`]);
    if (!isQuote && !isStorno && d.due_date) meta.push(['Fällig am', `<b>${dateDe(d.due_date)}</b>`]);
    if (isQuote && d.due_date) meta.push(['Gültig bis', dateDe(d.due_date)]);
    if (d.reference) meta.push(['Ihre Referenz', esc(d.reference)]);
    if (c.vat_id) meta.push(['USt-IdNr. Kunde', esc(c.vat_id)]);
    const note = S.meta.taxModes[mode]?.note;
    let payment = '';
    if (isQuote) payment = `Dieses Angebot ist gültig bis zum ${dateDe(d.due_date)}. Wir freuen uns auf Ihre Zusage.`;
    else if (isStorno) payment = `Der Betrag von ${eur(Math.abs(t.total))} wird Ihnen erstattet bzw. mit offenen Forderungen verrechnet.`;
    else if (t.total > 0) payment = `Bitte überweisen Sie den Gesamtbetrag von ${eur(t.total)} bis zum ${dateDe(d.due_date)}${d.number ? ` unter Angabe der Rechnungsnummer ${esc(d.number)}` : ''}${seller.iban ? ' auf das unten genannte Konto' : ''}.`;

    return `<div class="paper" style="--accent:${esc(seller.accent || '#1f4fd8')}">
      ${isDraft ? '<div class="p-watermark" aria-hidden="true">ENTWURF</div>' : ''}
      <div class="p-top">
        <div class="p-logo">${S.me.features.logo && seller.logo ? `<img src="${esc(seller.logo)}" alt="">` : `<div class="p-name">${esc(name)}</div>`}</div>
        <div class="p-company"><b>${esc(name)}</b>${[seller.company && seller.owner ? seller.owner : '', seller.street, [seller.zip, seller.city].filter(Boolean).join(' '), seller.country && seller.country !== 'DE' ? countryName(seller.country) : '', seller.phone ? `Tel. ${seller.phone}` : '', seller.email, seller.website]
          .filter(Boolean)
          .map(esc)
          .join('<br>')}</div>
      </div>
      <div class="p-mid">
        <div>
          ${sender ? `<div class="p-sender">${esc(sender)}</div>` : ''}
          <div class="p-recipient">${c.name ? `<b>${esc(c.name)}</b>` : '<span class="p-placeholder">Kunde auswählen</span>'}${[c.contact ? `z. Hd. ${c.contact}` : '', c.street, [c.zip, c.city].filter(Boolean).join(' '), c.country && c.country !== 'DE' ? countryName(c.country).toUpperCase() : '']
            .filter(Boolean)
            .map((l) => `<br>${esc(l)}`)
            .join('')}</div>
        </div>
        <div class="p-meta">${meta.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')}</div>
      </div>
      <h1 class="p-title">${heading}${d.title ? ` – ${esc(d.title)}` : ''}</h1>
      ${d.intro ? `<div class="p-intro">${esc(d.intro)}</div>` : ''}
      <table>
        <thead><tr><th style="width:34px">Pos.</th><th>Beschreibung</th><th class="r">Menge</th><th class="r">Einzelpreis</th>${showTax ? '<th class="r">USt.</th>' : ''}<th class="r">Gesamt</th></tr></thead>
        <tbody>${
          lines.length
            ? lines
                .map(
                  (it, i) => `<tr><td class="p-muted">${i + 1}</td><td>${esc(it.description)}</td><td class="r">${numDe(parseNum(it.quantity))}${it.unit ? ` ${esc(it.unit)}` : ''}</td><td class="r">${eur(parseNum(it.price))}</td>${showTax ? `<td class="r">${it.taxRate} %</td>` : ''}<td class="r"><b>${eur(round(parseNum(it.quantity) * parseNum(it.price)))}</b></td></tr>`
                )
                .join('')
            : `<tr><td colspan="${showTax ? 6 : 5}" class="p-placeholder" style="text-align:center;padding:18px">Noch keine Positionen</td></tr>`
        }</tbody>
      </table>
      <div class="p-sum">
        ${mode !== 'small_business' ? `<div><span>Nettobetrag</span><span>${eur(t.subtotal)}</span></div>` : ''}
        ${mode === 'standard' ? t.groups.map((g) => `<div><span>zzgl. ${g.rate} % USt.${t.groups.length > 1 ? ` auf ${eur(g.net)}` : ''}</span><span>${eur(g.tax)}</span></div>`).join('') : ''}
        <div class="grand"><span>${isQuote ? 'Angebotssumme' : isStorno ? 'Gutschriftsbetrag' : 'Gesamtbetrag'}</span><span>${eur(t.total)}</span></div>
      </div>
      ${note ? `<p class="p-note"><b>${esc(note)}</b></p>` : ''}
      ${payment ? `<p class="p-note">${payment}</p>` : ''}
      ${d.notes ? `<p class="p-note">${esc(d.notes)}</p>` : ''}
      ${seller.footer_note ? `<p class="p-note">${esc(seller.footer_note)}</p>` : ''}
      <p class="p-note">Mit freundlichen Grüßen<br>${esc(seller.owner || name)}</p>
      <div class="p-foot">
        <div>${[name, seller.company && seller.owner ? `Inhaber/in: ${seller.owner}` : '', seller.street, [seller.zip, seller.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>')}</div>
        <div>${[seller.phone ? `Tel. ${seller.phone}` : '', seller.email, seller.website, seller.tax_number ? `Steuernr.: ${seller.tax_number}` : '', seller.vat_id ? `USt-IdNr.: ${seller.vat_id}` : ''].filter(Boolean).map(esc).join('<br>')}</div>
        <div>${[seller.bank, seller.iban ? `IBAN: ${seller.iban}` : '', seller.bic ? `BIC: ${seller.bic}` : ''].filter(Boolean).map(esc).join('<br>') || '<span class="p-warn">Bankverbindung in den Einstellungen ergänzen</span>'}</div>
      </div>
      ${S.me.features.removeBranding ? '' : '<div class="p-brand">Erstellt mit Fakturo</div>'}
    </div>`;
  }

  // =====================================================================
  // Editor
  // =====================================================================
  const DEFAULT_INTRO = {
    invoice: 'Vielen Dank für Ihren Auftrag. Für die erbrachten Leistungen erlaube ich mir, Folgendes in Rechnung zu stellen:',
    quote: 'Vielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen folgendes Angebot:',
  };

  function suggestTaxMode(profile, customer) {
    if (profile.small_business) return 'small_business';
    const country = customer?.country || 'DE';
    if (country === 'DE') return 'standard';
    if (S.meta.eu.includes(country)) return customer.vat_id ? 'reverse_charge' : 'standard';
    return 'non_taxable';
  }

  const pdfUrl = (id, download) => `/api/documents/${id}/pdf${download ? '?download=1' : ''}`;

  async function viewEditor(id, q, token) {
    const [profile, customers, existing, suggestions] = await Promise.all([
      api('/api/profile'),
      api('/api/customers'),
      id ? api(`/api/documents/${id}`) : null,
      api('/api/items/suggestions').catch(() => []),
    ]);
    if (stale(token)) return;
    S.profile = profile;
    const type = existing ? existing.type : q.get('type') === 'quote' ? 'quote' : 'invoice';
    S.docType = type;
    renderChrome();
    if (!existing && type === 'quote' && !S.me.features.quotes) {
      view.innerHTML = lockedView('Angebote', 'quotes', I.quote, ['Angebote im Rechnungs-Design', 'Mit einem Klick zur Rechnung', 'Status-Verfolgung']);
      bindLocked();
      return;
    }
    const isQuote = type === 'quote';
    const isStorno = existing?.kind === 'cancellation';
    const today = todayIso();
    const presetCustomer = customers.find((c) => c.id === Number(q.get('customer'))) || (customers.length === 1 ? customers[0] : null);
    const d = existing
      ? structuredClone(existing)
      : {
          type,
          number: '',
          status: isQuote ? 'open' : 'draft',
          customer_id: presetCustomer?.id || '',
          issue_date: today,
          due_date: addDays(today, isQuote ? 30 : profile.payment_days),
          service_from: '',
          service_to: '',
          reference: '',
          title: '',
          intro: DEFAULT_INTRO[type],
          notes: '',
          tax_mode: suggestTaxMode(profile, presetCustomer),
          items: [{ description: '', quantity: 1, unit: 'Std.', price: '', taxRate: profile.default_tax_rate }],
        };
    d.service_from = d.service_from || '';
    d.service_to = d.service_to || '';
    let taxTouched = Boolean(existing);
    const editable = !existing || isQuote || existing.status === 'draft';
    const seller = existing?.seller ? { ...existing.seller, logo: profile.logo } : profile;
    const customerOf = () => {
      if (!editable) return existing.customer;
      const c = customers.find((x) => x.id === Number(d.customer_id));
      return c || (existing && Number(d.customer_id) === existing.customer_id ? existing.customer : {});
    };
    const docName = isStorno ? 'Stornorechnung' : isQuote ? 'Angebot' : 'Rechnung';
    const title = existing ? (existing.number ? `${docName} ${existing.number}` : `${docName} (Entwurf)`) : isQuote ? 'Neues Angebot' : 'Neue Rechnung';
    const taxModeOptions = Object.entries(S.meta.taxModes)
      .map(([k, m]) => `<option value="${k}" ${k === d.tax_mode ? 'selected' : ''}>${esc(m.label)}</option>`)
      .join('');

    // Hinweise über dem Editor
    const notices = [];
    if (existing?.status === 'draft' && existing.missing?.length) {
      notices.push(`<div class="banner warn"><span>${I.alert}<span>Vor dem Abschließen fehlt noch: <b>${existing.missing.map((m) => esc(m.label)).join(', ')}</b>.</span></span><a class="btn btn-sm btn-secondary" href="${existing.missing[0].where === 'settings' ? '#/einstellungen' : '#/kunden'}">Ergänzen</a></div>`);
    }
    if (existing && !editable && !isStorno && existing.status !== 'cancelled') {
      notices.push(`<div class="banner info"><span>${I.lock}<span>Diese Rechnung ist abgeschlossen und kann nicht mehr geändert werden. Für Korrekturen: <b>stornieren</b> und neu erstellen.</span></span></div>`);
    }
    if (existing?.status === 'cancelled' && existing.cancelled_by_doc) {
      notices.push(`<div class="banner info"><span>${I.ban}<span>Storniert durch Stornorechnung <a href="#/dokument/${existing.cancelled_by_doc.id}">${esc(existing.cancelled_by_doc.number)}</a>.</span></span></div>`);
    }
    if (isStorno && existing.source) {
      notices.push(`<div class="banner info"><span>${I.ban}<span>Stornorechnung zu <a href="#/dokument/${existing.source.id}">${esc(existing.source.number)}</a> vom ${dateDe(existing.source.issue_date)}.</span></span></div>`);
    }

    view.innerHTML = `
      <div class="page-head">
        <div>
          <a href="#/${isQuote ? 'angebote' : 'rechnungen'}" class="back-link">${I.back}${isQuote ? 'Angebote' : 'Rechnungen'}</a>
          <h1>${esc(title)}</h1>
          ${existing ? `<div class="status-line">${badge(existing.status)}${existing.customer?.name ? `<span>${esc(existing.customer.name)}</span>` : ''}<span class="num">${eur(existing.total)}</span>${existing.reminder_level ? `<span>${existing.reminder_level}× erinnert</span>` : ''}</div>` : ''}
        </div>
        <div class="page-actions" id="docActions"></div>
      </div>
      ${notices.join('')}
      <div class="editor">
        <div>
        ${
          editable
            ? `<form class="card card-pad" id="docForm" autocomplete="off" novalidate>
          <div class="section-title">Empfänger</div>
          <div class="field">
            <label for="f_customer">Kunde</label>
            <div class="input-row">
              <select id="f_customer" name="customer_id"><option value="">– Kunde auswählen –</option>${customers.map((c) => `<option value="${c.id}" ${c.id === Number(d.customer_id) ? 'selected' : ''}>${esc(c.name)}${c.number ? ` (${esc(c.number)})` : ''}</option>`).join('')}</select>
              <button type="button" class="btn btn-secondary" id="newCustomerBtn">${I.plus}Neu</button>
            </div>
          </div>
          <div class="section-title mt">Details</div>
          <div class="form-grid">
            <div class="field s3"><label for="f_issue">${isQuote ? 'Angebotsdatum' : 'Rechnungsdatum'}</label><input type="date" id="f_issue" name="issue_date" value="${esc(d.issue_date)}" required></div>
            <div class="field s3"><label for="f_due">${isQuote ? 'Gültig bis' : 'Zahlungsziel'}</label><input type="date" id="f_due" name="due_date" value="${esc(d.due_date)}"><span class="hint" id="dueHint"></span></div>
            ${
              isQuote
                ? ''
                : `<div class="field s3"><label for="f_sfrom">Leistungsdatum / von</label><input type="date" id="f_sfrom" name="service_from" value="${esc(d.service_from)}"><span class="hint">Leer = Rechnungsdatum</span></div>
            <div class="field s3"><label for="f_sto">bis <span class="opt">(bei Zeitraum)</span></label><input type="date" id="f_sto" name="service_to" value="${esc(d.service_to)}"></div>`
            }
            <div class="field s3"><label for="f_title">Betreff <span class="opt">(optional)</span></label><input id="f_title" name="title" value="${esc(d.title)}" placeholder="z. B. Website-Relaunch" maxlength="200"></div>
            <div class="field s3"><label for="f_ref">Bestellnr. / Referenz <span class="opt">(optional)</span></label><input id="f_ref" name="reference" value="${esc(d.reference)}" maxlength="100"></div>
            <div class="field"><label for="f_tax">Umsatzsteuer</label><select id="f_tax" name="tax_mode">${taxModeOptions}</select><span class="hint" id="taxHint"></span></div>
            <div class="field"><label for="f_intro">Einleitungstext</label><textarea id="f_intro" name="intro" rows="2">${esc(d.intro)}</textarea></div>
          </div>
          <div class="section-title mt">Positionen</div>
          <div class="items" id="items"></div>
          <button type="button" class="btn btn-secondary btn-sm mt" id="addItem">${I.plus}Position hinzufügen</button>
          <div class="totals-box" id="totals" aria-live="polite"></div>
          <div class="field mt-lg"><label for="f_notes">Anmerkungen <span class="opt">(optional)</span></label><textarea id="f_notes" name="notes" rows="2" placeholder="z. B. Vielen Dank für die gute Zusammenarbeit!">${esc(d.notes)}</textarea></div>
          <div class="form-actions sticky-save">
            <span class="muted small" id="saveState">${existing ? 'Alle Änderungen gespeichert' : 'Noch nicht gespeichert'}</span>
            <button type="submit" class="btn btn-primary">${existing ? 'Änderungen speichern' : 'Entwurf speichern'}</button>
          </div>
        </form>`
            : `<div class="card card-pad doc-summary">
          <div class="section-title">Zusammenfassung</div>
          <dl class="kv">
            <div><dt>Kunde</dt><dd>${esc(existing.customer.name)}${existing.customer.number ? ` <span class="muted">(${esc(existing.customer.number)})</span>` : ''}</dd></div>
            <div><dt>${isStorno ? 'Datum' : 'Rechnungsdatum'}</dt><dd>${dateDe(existing.issue_date)}</dd></div>
            ${isStorno ? '' : `<div><dt>Fällig am</dt><dd>${dateDe(existing.due_date)}</dd></div>`}
            ${existing.paid_at ? `<div><dt>Bezahlt am</dt><dd>${dateDe(existing.paid_at)}</dd></div>` : ''}
            ${existing.sent_at ? `<div><dt>Versendet am</dt><dd>${dateDe(existing.sent_at)}</dd></div>` : ''}
            <div><dt>Umsatzsteuer</dt><dd>${esc(S.meta.taxModes[existing.tax_mode]?.label || '')}</dd></div>
            <div><dt>Gesamtbetrag</dt><dd class="strong num">${eur(existing.total)}</dd></div>
          </dl>
        </div>`
        }
        ${existing ? einvoiceCard(existing) + historyCard(existing) : ''}
        </div>
        <div class="preview-wrap">
          <div class="preview-head"><span class="muted small">Vorschau</span>${existing?.id ? `<a class="small" href="${pdfUrl(existing.id)}" target="_blank" rel="noopener">${I.eye}PDF in neuem Tab öffnen</a>` : ''}</div>
          <div class="preview-frame" id="previewFrame"><div class="preview-scale" id="previewScale"></div></div>
        </div>
      </div>`;

    const scaleEl = $('#previewScale');
    const frame = $('#previewFrame');
    function fitPreview() {
      const s = Math.min(1, (frame.clientWidth - 32) / 794);
      scaleEl.style.transform = `scale(${s})`;
      const paper = scaleEl.firstElementChild;
      if (paper) frame.style.height = `${paper.offsetHeight * s + 32}px`;
    }
    function drawPreview() {
      scaleEl.innerHTML = paperHtml(d, seller, customerOf());
      fitPreview();
    }
    new ResizeObserver(fitPreview).observe(frame);

    // ---------- Formular ----------
    const form = $('#docForm');
    let savedSnapshot = JSON.stringify(d);
    const isDirty = () => editable && JSON.stringify(d) !== savedSnapshot;
    S.dirty = isDirty;

    if (form) {
      const F = form.elements;
      const itemsEl = $('#items');
      const lineTotal = (it) => eur(round(parseNum(it.quantity) * parseNum(it.price)));
      const updateSaveState = () => {
        const st = $('#saveState');
        if (st) st.textContent = isDirty() ? 'Ungespeicherte Änderungen' : existing ? 'Alle Änderungen gespeichert' : 'Noch nicht gespeichert';
        st?.classList.toggle('unsaved', isDirty());
      };
      const updateHints = () => {
        const days = d.issue_date && d.due_date ? daysBetween(d.issue_date, d.due_date) : null;
        $('#dueHint').textContent = days === null ? '' : days < 0 ? 'Liegt vor dem Rechnungsdatum' : isQuote ? `${days} Tage gültig` : days === 0 ? 'Sofort fällig' : `${days} Tage Zahlungsziel`;
        const c = customerOf();
        const hint =
          d.tax_mode === 'reverse_charge' && !c.vat_id
            ? '⚠ Für Reverse-Charge braucht der Kunde eine USt-IdNr.'
            : d.tax_mode === 'reverse_charge'
              ? 'Keine USt. – der Kunde führt die Steuer in seinem Land ab.'
              : d.tax_mode === 'non_taxable'
                ? 'Für Leistungen an Unternehmen außerhalb der EU.'
                : d.tax_mode === 'small_business'
                  ? 'Keine USt., Hinweis nach § 19 UStG wird gedruckt.'
                  : '';
        $('#taxHint').textContent = hint;
      };

      function drawItems() {
        const std = d.tax_mode === 'standard';
        itemsEl.innerHTML = d.items
          .map(
            (it, i) => `<div class="item" data-i="${i}">
            <div class="item-top">
              <span class="item-pos" aria-hidden="true">${i + 1}</span>
              <div class="item-desc">
                <textarea data-k="description" rows="1" placeholder="Leistung oder Produkt – tippe für Vorschläge" aria-label="Beschreibung Position ${i + 1}">${esc(it.description)}</textarea>
                <div class="suggest" role="listbox" hidden></div>
              </div>
              <div class="item-tools">
                <button type="button" class="icon-btn" data-up="${i}" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>${svg('<path d="m18 15-6-6-6 6"/>')}</button>
                <button type="button" class="icon-btn" data-remove="${i}" aria-label="Position entfernen" ${d.items.length === 1 ? 'disabled' : ''}>${I.trash}</button>
              </div>
            </div>
            <div class="item-grid${std ? '' : ' no-tax'}">
              <label><span>Menge</span><input data-k="quantity" inputmode="decimal" value="${esc(String(it.quantity).replace('.', ','))}"></label>
              <label><span>Einheit</span><input data-k="unit" value="${esc(it.unit)}" placeholder="Stk." list="units"></label>
              <label><span>Preis netto (€)</span><input data-k="price" inputmode="decimal" value="${esc(it.price === '' ? '' : String(it.price).replace('.', ','))}" placeholder="0,00"></label>
              ${std ? `<label><span>USt.</span><select data-k="taxRate">${[19, 7, 0].map((r) => `<option value="${r}" ${Number(it.taxRate) === r ? 'selected' : ''}>${r} %</option>`).join('')}</select></label>` : ''}
              <div class="item-sum"><span>Summe</span><b data-sum>${lineTotal(it)}</b></div>
            </div>
          </div>`
          )
          .join('') + '<datalist id="units"><option value="Std."><option value="Tag"><option value="Stk."><option value="Pauschal"><option value="Monat"><option value="km"><option value="m²"></datalist>';
        $$('textarea[data-k=description]', itemsEl).forEach(autoGrow);
      }
      function autoGrow(ta) {
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight + 2, 240)}px`;
      }
      function drawTotals() {
        const t = computeTotals(d.items, d.tax_mode);
        $('#totals').innerHTML = `${d.tax_mode !== 'small_business' ? `<div><span class="muted">Netto</span><span class="num">${eur(t.subtotal)}</span></div>` : ''}
          ${d.tax_mode === 'standard' ? t.groups.map((g) => `<div><span class="muted">USt. ${g.rate} %</span><span class="num">${eur(g.tax)}</span></div>`).join('') : ''}
          <div class="grand"><span>Gesamt</span><span class="num">${eur(t.total)}</span></div>`;
      }
      const refresh = () => {
        drawTotals();
        drawPreview();
        updateHints();
        updateSaveState();
      };

      // Vorschläge aus früheren Positionen
      function showSuggestions(ta) {
        const box = ta.parentElement.querySelector('.suggest');
        const term = ta.value.trim().toLowerCase();
        const hits = term.length < 2 ? [] : suggestions.filter((s) => s.description.toLowerCase().includes(term) && s.description.toLowerCase() !== term).slice(0, 6);
        if (!hits.length) {
          box.hidden = true;
          return;
        }
        box.innerHTML = hits.map((s, i) => `<button type="button" role="option" data-s="${i}"><span>${esc(s.description.split('\n')[0])}</span><span class="muted">${eur(s.price)}${s.unit ? ` / ${esc(s.unit)}` : ''}</span></button>`).join('');
        box.hidden = false;
        box._hits = hits;
      }
      itemsEl.addEventListener('mousedown', (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        e.preventDefault();
        const row = b.closest('[data-i]');
        const s = b.parentElement._hits[Number(b.dataset.s)];
        Object.assign(d.items[Number(row.dataset.i)], { description: s.description, unit: s.unit, price: s.price, taxRate: s.taxRate });
        drawItems();
        refresh();
        $(`[data-i="${row.dataset.i}"] [data-k=quantity]`, itemsEl)?.focus();
      });
      itemsEl.addEventListener('focusout', (e) => {
        if (e.target.matches('textarea[data-k=description]')) setTimeout(() => (e.target.parentElement.querySelector('.suggest').hidden = true), 120);
      });

      form.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.dataset.k) {
          const it = d.items[Number(row.dataset.i)];
          const k = e.target.dataset.k;
          it[k] = k === 'taxRate' ? Number(e.target.value) : e.target.value;
          $('[data-sum]', row).textContent = lineTotal(it);
          if (k === 'description') {
            autoGrow(e.target);
            showSuggestions(e.target);
          }
        } else if (e.target.name) {
          if (e.target.name === 'tax_mode') taxTouched = true;
          if (e.target.name === 'issue_date' && F.issue_date.value && !existing) {
            F.due_date.value = addDays(F.issue_date.value, isQuote ? 30 : profile.payment_days);
            d.due_date = F.due_date.value;
          }
          d[e.target.name] = e.target.value;
          if (e.target.name === 'customer_id' && !taxTouched) {
            d.tax_mode = suggestTaxMode(profile, customerOf());
            F.tax_mode.value = d.tax_mode;
          }
          if (['tax_mode', 'customer_id'].includes(e.target.name)) drawItems();
        }
        refresh();
      });
      form.addEventListener('change', (e) => {
        if (e.target.matches('[data-k=quantity], [data-k=price]')) {
          // Eingaben wie "1.200,50" normalisieren
          const row = e.target.closest('[data-i]');
          const it = d.items[Number(row.dataset.i)];
          const n = parseNum(e.target.value);
          if (e.target.value.trim() !== '') e.target.value = String(n).replace('.', ',');
          it[e.target.dataset.k] = e.target.value;
        }
      });
      itemsEl.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove]');
        const up = e.target.closest('[data-up]');
        if (rm) d.items.splice(Number(rm.dataset.remove), 1);
        else if (up) {
          const i = Number(up.dataset.up);
          [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]];
        } else return;
        drawItems();
        refresh();
      });
      $('#addItem').addEventListener('click', () => {
        const last = d.items[d.items.length - 1];
        d.items.push({ description: '', quantity: 1, unit: last?.unit || 'Std.', price: '', taxRate: last?.taxRate ?? profile.default_tax_rate });
        drawItems();
        refresh();
        $$('#items textarea').pop()?.focus();
      });
      $('#newCustomerBtn').addEventListener('click', () =>
        customerModal(null, (c) => {
          customers.push(c);
          F.customer_id.add(new Option(`${c.name} (${c.number})`, c.id, true, true));
          d.customer_id = String(c.id);
          if (!taxTouched) {
            d.tax_mode = suggestTaxMode(profile, c);
            F.tax_mode.value = d.tax_mode;
            drawItems();
          }
          refresh();
        })
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        save();
      });
      // Strg/Cmd + S speichert
      form.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          save();
        }
      });
      drawItems();
      drawTotals();
      updateHints();
    }

    const payload = () => ({
      type,
      customer_id: Number(d.customer_id),
      title: d.title,
      reference: d.reference,
      issue_date: d.issue_date,
      due_date: d.due_date,
      service_from: d.service_from || null,
      service_to: d.service_from ? d.service_to || null : null,
      tax_mode: d.tax_mode,
      intro: d.intro,
      notes: d.notes,
      items: d.items.map((it) => ({ ...it, quantity: parseNum(it.quantity), price: parseNum(it.price) })),
    });

    async function save({ quiet = false } = {}) {
      if (!d.customer_id) {
        toast('Bitte wähle einen Kunden aus.', true);
        $('#f_customer')?.focus();
        return null;
      }
      if (!d.items.some((it) => it.description || parseNum(it.price))) {
        toast('Bitte füge mindestens eine Position hinzu.', true);
        return null;
      }
      const btn = $('#docForm button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const saved = existing ? await api(`/api/documents/${existing.id}`, { method: 'PUT', body: payload() }) : await api('/api/documents', { body: payload() });
        savedSnapshot = JSON.stringify(d);
        if (!existing) {
          S.dirty = null;
          toast(isQuote ? `Angebot ${saved.number} gespeichert` : 'Entwurf gespeichert');
          history.replaceState(null, '', `#/dokument/${saved.id}`);
          currentHash = location.hash;
          await route();
          return saved;
        }
        if (!quiet) toast('Gespeichert');
        Object.assign(existing, saved);
        const st = $('#saveState');
        if (st) {
          st.textContent = 'Alle Änderungen gespeichert';
          st.classList.remove('unsaved');
        }
        return saved;
      } catch (err) {
        fail(err);
        return null;
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ---------- Aktionen ----------
    const A = [];
    const more = [];
    const btn = (key, label, icon, cls = 'btn-secondary') => A.push(`<button class="btn ${cls}" data-a="${key}">${icon}<span>${label}</span></button>`);
    const item = (key, label, icon, danger) => more.push(`<button class="menu-item${danger ? ' danger' : ''}" data-a="${key}" role="menuitem">${icon}${label}</button>`);
    if (!existing) {
      btn('preview', 'PDF-Vorschau', I.eye);
    } else if (isQuote) {
      if (existing.status !== 'declined') btn('convert', 'In Rechnung umwandeln', I.convert, 'btn-primary');
      btn('send', 'Senden', I.send);
      btn('download', 'PDF', I.download);
      if (existing.status !== 'accepted') item('accept', 'Als angenommen markieren', I.check);
      if (existing.status !== 'declined') item('decline', 'Als abgelehnt markieren', I.ban);
      if (existing.status !== 'open') item('reopen', 'Wieder auf „offen“ setzen', I.repeat);
      item('dup', 'Duplizieren', I.copy);
      item('delete', 'Löschen', I.trash, true);
    } else if (existing.status === 'draft') {
      btn('finalize-send', 'Abschließen & senden', I.send, 'btn-primary');
      btn('preview', 'PDF-Vorschau', I.eye);
      item('finalize', 'Abschließen ohne Versand', I.lock);
      item('dup', 'Duplizieren', I.copy);
      item('delete', 'Entwurf löschen', I.trash, true);
    } else if (isStorno) {
      btn('send', 'Senden', I.send);
      btn('download', 'PDF', I.download);
      item('xrechnung', 'XRechnung (XML) herunterladen', I.xml);
    } else {
      if (['sent', 'overdue'].includes(existing.status)) btn('paid', 'Als bezahlt markieren', I.check, 'btn-success');
      if (existing.status === 'overdue') btn('remind', 'Zahlungserinnerung', I.bell);
      btn('download', 'PDF', I.download);
      if (existing.status !== 'cancelled') item('send', 'Erneut per E-Mail senden', I.send);
      if (existing.status === 'sent') item('remind', 'Zahlungserinnerung senden', I.bell);
      item('xrechnung', 'XRechnung (XML) herunterladen', I.xml);
      if (existing.status === 'paid') item('unpaid', 'Wieder auf „offen“ setzen', I.repeat);
      item('dup', 'Duplizieren', I.copy);
      if (existing.status !== 'cancelled') item('cancel', 'Stornieren …', I.ban, true);
    }
    $('#docActions').innerHTML =
      A.join('') +
      (more.length
        ? `<div class="menu-wrap"><button class="btn btn-secondary btn-icon" data-menu aria-haspopup="menu" aria-label="Weitere Aktionen">${I.more}</button><div class="menu" role="menu">${more.join('')}</div></div>`
        : '');

    $('#docActions').addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      closeMenus();
      try {
        await runAction(a);
      } catch (err) {
        fail(err);
      }
    });

    async function ensureSaved() {
      if (!existing) return save();
      if (isDirty()) return save({ quiet: true });
      return existing;
    }

    async function runAction(a) {
      if (a === 'preview') {
        const doc = await ensureSaved();
        if (doc) window.open(pdfUrl(doc.id), '_blank', 'noopener');
      } else if (a === 'download') {
        if (isDirty()) await save({ quiet: true });
        location.href = pdfUrl(existing.id, true);
      } else if (a === 'finalize' || a === 'finalize-send') {
        if (!(await ensureSaved())) return;
        const ok = await confirmDialog(
          'Rechnung abschließen?',
          'Die Rechnung erhält ihre endgültige, fortlaufende Rechnungsnummer und kann danach nicht mehr geändert werden. Korrekturen sind dann nur noch über eine Stornorechnung möglich.',
          a === 'finalize-send' ? 'Abschließen & weiter zum Versand' : 'Abschließen'
        );
        if (!ok) return;
        const doc = await api(`/api/documents/${existing.id}/finalize`, { body: {} });
        S.dirty = null;
        await refreshMe();
        toast(`Rechnung ${doc.number} abgeschlossen`);
        S.pending = a === 'finalize-send' ? 'send' : null;
        await route();
      } else if (a === 'send') {
        if (isQuote && isDirty() && !(await save({ quiet: true }))) return;
        sendModal(await api(`/api/documents/${existing.id}`), profile);
      } else if (a === 'paid' || a === 'unpaid' || a === 'decline' || a === 'accept' || a === 'reopen') {
        const status = { paid: 'paid', unpaid: 'sent', decline: 'declined', accept: 'accepted', reopen: 'open' }[a];
        await api(`/api/documents/${existing.id}/status`, { body: { status } });
        toast(a === 'paid' ? 'Als bezahlt markiert 🎉' : 'Status aktualisiert');
        await route();
      } else if (a === 'remind') {
        if (!S.me.features.reminders) return showUpsell('reminders');
        reminderModal(existing, profile);
      } else if (a === 'convert') {
        if (isDirty() && !(await save({ quiet: true }))) return;
        const inv = await api(`/api/documents/${existing.id}/duplicate`, { body: { type: 'invoice' } });
        toast('Rechnungsentwurf aus Angebot erstellt');
        S.dirty = null;
        location.hash = `#/dokument/${inv.id}`;
      } else if (a === 'dup') {
        const copy = await api(`/api/documents/${existing.id}/duplicate`, { body: {} });
        toast(copy.number ? `Kopie ${copy.number} erstellt` : 'Kopie als Entwurf erstellt');
        S.dirty = null;
        location.hash = `#/dokument/${copy.id}`;
      } else if (a === 'cancel') {
        const ok = await confirmDialog(
          `Rechnung ${existing.number} stornieren?`,
          'Es wird eine Stornorechnung mit eigener Nummer erstellt, die den Betrag vollständig ausgleicht. Die ursprüngliche Rechnung bleibt zur Dokumentation erhalten. Schicke die Stornorechnung anschließend an deinen Kunden.',
          'Stornorechnung erstellen',
          true
        );
        if (!ok) return;
        const storno = await api(`/api/documents/${existing.id}/cancel`, { body: {} });
        toast(`Stornorechnung ${storno.number} erstellt`);
        location.hash = `#/dokument/${storno.id}`;
      } else if (a === 'delete') {
        const ok = await confirmDialog(`${isQuote ? 'Angebot' : 'Entwurf'} löschen?`, 'Das kann nicht rückgängig gemacht werden.', 'Löschen', true);
        if (!ok) return;
        await api(`/api/documents/${existing.id}`, { method: 'DELETE' });
        S.dirty = null;
        toast('Gelöscht');
        location.hash = isQuote ? '#/angebote' : '#/rechnungen';
      } else if (a === 'xrechnung') {
        const issues = existing.einvoice?.xrechnung || [];
        if (issues.length) return einvoiceIssuesModal(issues);
        location.href = `/api/documents/${existing.id}/xrechnung.xml`;
      }
    }

    view.addEventListener('click', (e) => {
      const b = e.target.closest('[data-einv-x]');
      if (b) runAction('xrechnung').catch(fail);
    });

    drawPreview();
    if (S.pending === 'send' && existing) {
      S.pending = null;
      sendModal(existing, profile);
    }
  }

  function einvoiceCard(doc) {
    if (!doc.einvoice) return '';
    const z = doc.einvoice.zugferd;
    const x = doc.einvoice.xrechnung;
    return `<div class="card card-pad mt einv-card">
      <div class="section-title">${I.shield}E-Rechnung</div>
      <div class="einv-row ${z.length ? 'warn' : 'ok'}">${z.length ? I.alert : I.check}<div><b>ZUGFeRD ${z.length ? 'nicht möglich' : 'im PDF enthalten'}</b><span>${z.length ? `Es fehlt: ${esc(z.join(', '))}` : 'PDF und maschinenlesbare Rechnung (EN 16931) in einer Datei.'}</span></div></div>
      <div class="einv-row ${x.length ? 'warn' : 'ok'}">${x.length ? I.alert : I.check}<div><b>XRechnung ${x.length ? 'unvollständig' : 'verfügbar'}</b><span>${x.length ? `Für Behörden & Großkunden fehlt noch: ${esc(x.join(', '))}` : 'Für Behörden und Unternehmen, die reines XML verlangen.'}</span>${x.length ? '' : '<button class="btn btn-sm btn-secondary mt-sm" data-einv-x>XML herunterladen</button>'}</div></div>
    </div>`;
  }

  function historyCard(doc) {
    if (!doc.events?.length) return '';
    return `<div class="card card-pad mt"><div class="section-title">${I.clock}Verlauf</div>
      <ol class="timeline">${doc.events
        .slice()
        .reverse()
        .map((ev) => `<li><b>${esc((EVENT_TEXT[ev.type] || (() => ev.type))(ev.detail))}</b><span>${timeAgo(ev.created_at)}</span></li>`)
        .join('')}</ol></div>`;
  }

  function einvoiceIssuesModal(issues) {
    openModal(`${modalHead('XRechnung noch nicht möglich', 'Für eine gültige XRechnung fehlen noch Angaben. Ergänze sie in den Einstellungen bzw. beim Kunden – bei bereits abgeschlossenen Rechnungen gelten die damaligen Daten.')}
      <div class="modal-body"><ul class="missing-list">${issues.map((i) => `<li>${I.alert}<span>${esc(i)}</span></li>`).join('')}</ul></div>
      <div class="modal-foot"><a class="btn btn-secondary" href="#/einstellungen">Zu den Einstellungen</a><button class="btn btn-primary" data-close>Verstanden</button></div>`);
  }

  // ---------- Versand ----------
  function mailText(doc, profile) {
    const name = profile.owner || profile.company || '';
    const c = doc.customer || {};
    const greeting = c.contact ? `Guten Tag ${c.contact},` : 'Guten Tag,';
    if (doc.type === 'quote') {
      return {
        subject: `Angebot ${doc.number}${doc.title ? ` – ${doc.title}` : ''}`,
        message: `${greeting}\n\nvielen Dank für Ihre Anfrage. Im Anhang finden Sie mein Angebot ${doc.number} über ${eur(doc.total)}.\n\nDas Angebot ist gültig bis zum ${dateDe(doc.due_date)}. Bei Fragen melden Sie sich jederzeit gern.\n\nViele Grüße\n${name}`,
      };
    }
    if (doc.kind === 'cancellation') {
      return {
        subject: `Stornorechnung ${doc.number}${doc.source ? ` zu Rechnung ${doc.source.number}` : ''}`,
        message: `${greeting}\n\nim Anhang erhalten Sie die Stornorechnung ${doc.number}${doc.source ? `, mit der die Rechnung ${doc.source.number} vollständig storniert wird` : ''}.\n\nViele Grüße\n${name}`,
      };
    }
    return {
      subject: `Rechnung ${doc.number}${doc.title ? ` – ${doc.title}` : ''}`,
      message: `${greeting}\n\nim Anhang erhalten Sie meine Rechnung ${doc.number} über ${eur(doc.total)}.\n\nBitte überweisen Sie den Betrag bis zum ${dateDe(doc.due_date)}${profile.iban ? ` auf folgendes Konto:\n${profile.iban}${profile.bank ? ` (${profile.bank})` : ''}` : '.'}\n\nVielen Dank für die gute Zusammenarbeit!\n\nViele Grüße\n${name}`,
    };
  }

  function sendModal(doc, profile) {
    const { subject, message } = mailText(doc, profile);
    const to = doc.customer?.email || '';
    const zugferd = doc.einvoice && !doc.einvoice.zugferd.length;
    const xIssues = doc.einvoice?.xrechnung || [];
    const label = doc.type === 'quote' ? 'Angebot' : doc.kind === 'cancellation' ? 'Stornorechnung' : 'Rechnung';
    const file = `${doc.kind === 'cancellation' ? 'Storno' : label}_${doc.number}.pdf`;

    if (!S.me.emailEnabled) {
      const m = openModal(
        `${modalHead(`${label} versenden`, S.me.isDemo ? 'Im Demo-Konto werden keine E-Mails verschickt.' : 'Lade das PDF herunter und hänge es in deinem E-Mail-Programm an.')}
        <div class="modal-body">
          <ol class="steps-list">
            <li><b>PDF herunterladen</b>${zugferd ? '<span class="muted small">Enthält die E-Rechnung (ZUGFeRD) automatisch.</span>' : ''}<a class="btn btn-secondary btn-sm" href="${pdfUrl(doc.id, true)}">${I.download}${esc(file)}</a></li>
            <li><b>E-Mail vorbereiten</b><span class="muted small">Text anpassen und dein E-Mail-Programm öffnen.</span></li>
          </ol>
          <div class="field"><label for="m_to">An</label><input id="m_to" value="${esc(to)}" placeholder="E-Mail des Kunden"></div>
          <div class="field"><label for="m_subject">Betreff</label><input id="m_subject" value="${esc(subject)}"></div>
          <div class="field"><label for="m_body">Nachricht</label><textarea id="m_body" rows="9">${esc(message)}</textarea></div>
        </div>
        <div class="modal-foot"><button class="btn btn-secondary" data-copy>${I.copy}Text kopieren</button><button class="btn btn-primary" data-mailto>${I.mail}E-Mail-Programm öffnen</button></div>`,
        { wide: true }
      );
      $('[data-copy]', m).addEventListener('click', async () => {
        await navigator.clipboard?.writeText(`${$('#m_subject').value}\n\n${$('#m_body').value}`).catch(() => {});
        toast('Text kopiert');
      });
      $('[data-mailto]', m).addEventListener('click', () => {
        window.location.href = `mailto:${encodeURIComponent($('#m_to').value.trim())}?subject=${encodeURIComponent($('#m_subject').value)}&body=${encodeURIComponent($('#m_body').value)}`;
      });
      return;
    }

    const m = openModal(
      `${modalHead(`${label} per E-Mail senden`, `Antworten deines Kunden landen direkt in deinem Postfach (${esc(profile.email || S.me.email)}).`)}
      <form id="sendForm" novalidate>
        <div class="modal-body">
          <div class="field"><label for="s_to">An</label><input id="s_to" name="to" value="${esc(to)}" placeholder="kunde@beispiel.de" required><span class="hint">Mehrere Adressen mit Komma trennen.</span></div>
          <div class="field"><label for="s_subject">Betreff</label><input id="s_subject" name="subject" value="${esc(subject)}" required></div>
          <div class="field"><label for="s_msg">Nachricht</label><textarea id="s_msg" name="message" rows="9" required>${esc(message)}</textarea></div>
          <div class="attach">${I.file}<div><b>${esc(file)}</b><span class="muted small">${zugferd ? 'PDF mit eingebetteter E-Rechnung (ZUGFeRD)' : 'PDF'}</span></div></div>
          ${doc.type === 'invoice' ? `<label class="check-row ${xIssues.length ? 'disabled' : ''}"><input type="checkbox" name="attachXRechnung" ${xIssues.length ? 'disabled' : ''}><span>Zusätzlich XRechnung (XML) anhängen <span class="muted small">${xIssues.length ? `– fehlt: ${esc(xIssues.join(', '))}` : '– für Behörden & Großkunden'}</span></span></label>` : ''}
          <label class="check-row"><input type="checkbox" name="copyToMe" checked><span>Kopie an mich senden</span></label>
        </div>
        <div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" type="submit">${I.send}Jetzt senden</button></div>
      </form>`,
      { wide: true }
    );
    $('#sendForm', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const b = $('button[type=submit]', e.target);
      b.disabled = true;
      b.innerHTML = '<span class="spinner sm"></span>Wird gesendet …';
      try {
        await api(`/api/documents/${doc.id}/send`, {
          body: { to: f.to.value, subject: f.subject.value, message: f.message.value, copyToMe: f.copyToMe.checked, attachXRechnung: f.attachXRechnung?.checked },
        });
        closeModal(true);
        toast(`${label} ${doc.number} wurde versendet ✉️`);
        await refreshMe();
        route();
      } catch (err) {
        fail(err);
        b.disabled = false;
        b.innerHTML = `${I.send}Jetzt senden`;
      }
    });
  }

  function reminderModal(doc, profile) {
    const level = Math.min(doc.reminder_level, 2);
    const names = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'];
    const from = profile.owner || profile.company || '';
    const newDue = addDays(todayIso(), level === 0 ? 7 : 10);
    const c = doc.customer || {};
    const greeting = c.contact ? `Guten Tag ${c.contact},` : 'Guten Tag,';
    const texts = [
      `${greeting}\n\nsicher ist es im Alltag untergegangen: Für meine Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} über ${eur(doc.total)} konnte ich bisher noch keinen Zahlungseingang feststellen. Die Rechnung finden Sie zur Sicherheit noch einmal im Anhang.\n\nIch bitte Sie freundlich, den Betrag bis zum ${dateDe(newDue)} zu überweisen. Sollte sich Ihre Zahlung mit dieser Nachricht überschnitten haben, betrachten Sie sie bitte als gegenstandslos.\n\nViele Grüße\n${from}`,
      `${greeting}\n\nleider ist meine Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} über ${eur(doc.total)} trotz Zahlungserinnerung weiterhin offen.\n\nBitte überweisen Sie den offenen Betrag bis spätestens ${dateDe(newDue)}${profile.iban ? ` auf das Konto ${profile.iban}` : ''}. Die Rechnung liegt dieser E-Mail erneut bei.\n\nViele Grüße\n${from}`,
      `${greeting}\n\ntrotz Zahlungserinnerung und erster Mahnung ist meine Rechnung ${doc.number} vom ${dateDe(doc.issue_date)} über ${eur(doc.total)} weiterhin unbezahlt.\n\nIch fordere Sie hiermit letztmalig auf, den Betrag bis zum ${dateDe(newDue)} zu begleichen. Andernfalls sehe ich mich gezwungen, ohne weitere Ankündigung rechtliche Schritte einzuleiten. Hierdurch entstehen Ihnen zusätzliche Kosten.\n\nMit freundlichen Grüßen\n${from}`,
    ];
    const subject = `${names[level]}: Rechnung ${doc.number}`;
    const overdueDays = daysBetween(doc.due_date, todayIso());
    const m = openModal(
      `${modalHead(names[level], `Rechnung ${esc(doc.number)} · ${eur(doc.total)} · ${overdueDays > 0 ? `seit ${overdueDays} Tagen überfällig` : `fällig am ${dateDe(doc.due_date)}`}`)}
      <form id="remForm" novalidate>
        <div class="modal-body">
          <div class="field"><label for="r_to">An</label><input id="r_to" name="to" value="${esc(c.email || '')}"></div>
          <div class="field"><label for="r_subject">Betreff</label><input id="r_subject" name="subject" value="${esc(subject)}"></div>
          <div class="field"><label for="r_body">Nachricht</label><textarea id="r_body" name="message" rows="11">${esc(texts[level])}</textarea></div>
          ${S.me.emailEnabled ? `<div class="attach">${I.file}<div><b>Rechnung_${esc(doc.number)}.pdf</b><span class="muted small">wird angehängt</span></div></div>` : ''}
        </div>
        <div class="modal-foot">
          ${S.me.emailEnabled ? `<button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" type="submit">${I.send}Jetzt senden</button>` : `<button type="button" class="btn btn-secondary" data-copy>${I.copy}Text kopieren</button><button type="button" class="btn btn-primary" data-mailto>${I.mail}E-Mail-Programm öffnen</button>`}
        </div>
      </form>`,
      { wide: true }
    );
    const mark = async (send) => {
      const f = $('#remForm').elements;
      await api(`/api/documents/${doc.id}/reminder`, { body: send ? { send: true, to: f.to.value, subject: f.subject.value, message: f.message.value } : {} });
      closeModal(true);
      toast(send ? `${names[level]} wurde versendet` : `${names[level]} vermerkt`);
      route();
    };
    $('#remForm', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('button[type=submit]', e.target);
      b.disabled = true;
      try {
        await mark(true);
      } catch (err) {
        fail(err);
        b.disabled = false;
      }
    });
    $('[data-copy]', m)?.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(`${$('#r_subject').value}\n\n${$('#r_body').value}`).catch(() => {});
      toast('Text kopiert');
      mark(false).catch(fail);
    });
    $('[data-mailto]', m)?.addEventListener('click', () => {
      window.location.href = `mailto:${encodeURIComponent($('#r_to').value.trim())}?subject=${encodeURIComponent($('#r_subject').value)}&body=${encodeURIComponent($('#r_body').value)}`;
      mark(false).catch(fail);
    });
  }

  // =====================================================================
  // Kunden
  // =====================================================================
  function customerModal(c, onSaved) {
    const v = c || { country: 'DE' };
    const m = openModal(
      `${modalHead(c ? `Kunde bearbeiten${c.number ? ` · ${esc(c.number)}` : ''}` : 'Neuer Kunde')}
      <form id="custForm" novalidate>
        <div class="modal-body"><div class="form-grid">
          <div class="field"><label for="c_name">Firma oder Name</label><input id="c_name" name="name" value="${esc(v.name)}" required></div>
          <div class="field s3"><label for="c_contact">Ansprechpartner/in <span class="opt">(optional)</span></label><input id="c_contact" name="contact" value="${esc(v.contact)}"></div>
          <div class="field s3"><label for="c_email">E-Mail für Rechnungen</label><input id="c_email" name="email" type="email" value="${esc(v.email)}"></div>
          <div class="field"><label for="c_street">Straße und Hausnummer</label><input id="c_street" name="street" value="${esc(v.street)}"></div>
          <div class="field s2"><label for="c_zip">PLZ</label><input id="c_zip" name="zip" value="${esc(v.zip)}"></div>
          <div class="field s4"><label for="c_city">Ort</label><input id="c_city" name="city" value="${esc(v.city)}"></div>
          <div class="field s3"><label for="c_country">Land</label><select id="c_country" name="country">${countryOptions(v.country || 'DE')}</select></div>
          <div class="field s3"><label for="c_vat">USt-IdNr. <span class="opt">(bei Firmen)</span></label><input id="c_vat" name="vat_id" value="${esc(v.vat_id)}" placeholder="z. B. FR40123456789"><span class="hint" id="vatHint"></span></div>
          <div class="field"><details ${v.buyer_reference ? 'open' : ''}><summary class="small">Für E-Rechnungen an Behörden</summary><div class="field mt-sm"><label for="c_ref">Leitweg-ID / Käuferreferenz</label><input id="c_ref" name="buyer_reference" value="${esc(v.buyer_reference)}" placeholder="z. B. 04011000-1234512345-06"><span class="hint">Öffentliche Auftraggeber nennen dir diese Nummer. Für normale Firmenkunden leer lassen.</span></div></details></div>
        </div></div>
        <div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" type="submit">${c ? 'Speichern' : 'Kunde anlegen'}</button></div>
      </form>`
    );
    const vatHint = () => {
      const country = $('#c_country', m).value;
      $('#vatHint', m).textContent = S.meta.eu.includes(country) && country !== 'DE' ? 'Mit USt-IdNr. wird automatisch Reverse-Charge verwendet.' : '';
    };
    $('#c_country', m).addEventListener('change', vatHint);
    vatHint();
    $('#custForm', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        const saved = c ? await api(`/api/customers/${c.id}`, { method: 'PUT', body: data }) : await api('/api/customers', { body: data });
        closeModal(true);
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
    let search = '';
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Kunden</h1><p>${customers.length}${lim ? ` von ${lim}` : ''} Kunden${lim && customers.length >= lim ? ' – Limit erreicht' : ''}</p></div>
        <div class="page-actions"><button class="btn btn-primary" id="addCust">${I.plus}Neuer Kunde</button></div>
      </div>
      ${customers.length > 5 ? `<div class="toolbar"><div></div><div class="search">${I.search}<input class="input" id="csearch" type="search" placeholder="Name, Ort oder Kundennummer …" aria-label="Kunden suchen"></div></div>` : ''}
      <div class="card table-card" id="custBox"></div>`;
    const box = $('#custBox');
    const draw = () => {
      const rows = customers.filter((c) => !search || `${c.name} ${c.contact} ${c.city} ${c.number} ${c.email}`.toLowerCase().includes(search));
      box.innerHTML = customers.length
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Kunde</th><th class="hide-sm">Kontakt</th><th class="hide-sm">Ort</th><th class="right">Offen</th><th class="right hide-sm">Umsatz</th><th><span class="sr-only">Aktionen</span></th></tr></thead><tbody>
        ${rows
          .map(
            (c) => `<tr>
          <td class="strong">${esc(c.name)}<div class="small muted">${esc(c.number)}${c.contact ? ` · ${esc(c.contact)}` : ''}</div></td>
          <td class="hide-sm">${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="muted">–</span>'}</td>
          <td class="hide-sm">${esc([c.zip, c.city].filter(Boolean).join(' ')) || '<span class="muted">–</span>'}${c.country !== 'DE' ? `<div class="small muted">${esc(S.meta.countries[c.country] || c.country)}</div>` : ''}</td>
          <td class="right num ${c.open_amount ? 'strong' : 'muted'}">${eur(c.open_amount)}</td>
          <td class="right num hide-sm">${eur(c.revenue)}</td>
          <td class="right nowrap">
            <a class="btn btn-sm btn-secondary" href="#/dokument/neu?customer=${c.id}">${I.plus}<span class="hide-sm">Rechnung</span></a>
            <button class="icon-btn" data-edit="${c.id}" aria-label="${esc(c.name)} bearbeiten">${I.edit}</button>
            <button class="icon-btn" data-del="${c.id}" aria-label="${esc(c.name)} löschen">${I.trash}</button>
          </td></tr>`
          )
          .join('')}</tbody></table></div>`
        : `<div class="empty"><div class="ico">${I.users}</div><h3>Noch keine Kunden</h3><p>Lege deine Kunden einmal an – danach wählst du sie bei jeder Rechnung mit einem Klick aus.</p><button class="btn btn-primary" data-first>${I.plus}Ersten Kunden anlegen</button></div>`;
    };
    draw();
    const add = () => {
      if (lim !== null && customers.length >= lim) return showUpsell('customers');
      customerModal(null, () => route());
    };
    $('#addCust').addEventListener('click', add);
    $('#csearch')?.addEventListener('input', (e) => {
      search = e.target.value.trim().toLowerCase();
      draw();
    });
    view.addEventListener('click', async (e) => {
      if (e.target.closest('[data-first]')) return add();
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (edit) customerModal(customers.find((c) => c.id === Number(edit.dataset.edit)), () => route());
      if (del) {
        const c = customers.find((x) => x.id === Number(del.dataset.del));
        if (!(await confirmDialog(`${c.name} löschen?`, 'Abgeschlossene Rechnungen bleiben unverändert erhalten. Entwürfe und Vorlagen für diesen Kunden musst du ggf. neu zuordnen.', 'Löschen', true))) return;
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

  // =====================================================================
  // Wiederkehrende Rechnungen
  // =====================================================================
  async function viewRecurring(m, q, token) {
    if (!S.me.features.recurring) {
      view.innerHTML = lockedView('Wiederkehrende Rechnungen', 'recurring', I.repeat, ['Ideal für Retainer, Wartung, Hosting und Mieten', 'Monatlich, vierteljährlich oder jährlich', 'Rechnungen werden automatisch als Entwurf erstellt']);
      bindLocked();
      return;
    }
    const [list, customers] = await Promise.all([api('/api/recurring'), api('/api/customers')]);
    if (stale(token)) return;
    const net = (items) => items.reduce((s, it) => s + it.quantity * it.price, 0);
    const monthly = list.filter((r) => r.active).reduce((s, r) => s + net(r.items) / { monthly: 1, quarterly: 3, yearly: 12 }[r.interval], 0);
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Wiederkehrende Rechnungen</h1><p>Fakturo legt diese Rechnungen am Stichtag automatisch als Entwurf an – du prüfst und versendest sie mit einem Klick.</p></div>
        <div class="page-actions"><button class="btn btn-primary" id="addRec">${I.plus}Neue Vorlage</button></div>
      </div>
      ${list.length ? `<div class="grid grid-4 mb"><div class="card kpi"><div class="label">Wiederkehrender Umsatz</div><div class="value">${eur(monthly)}</div><div class="sub">netto pro Monat</div></div></div>` : ''}
      <div class="card table-card">${
        list.length
          ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Kunde</th><th>Intervall</th><th>Nächste Rechnung</th><th class="right">Netto</th><th>Status</th><th><span class="sr-only">Aktionen</span></th></tr></thead><tbody>
        ${list
          .map(
            (r) => `<tr><td class="strong">${esc(r.customer_name)}${r.title ? `<div class="small muted">${esc(r.title)}</div>` : ''}</td><td>${INTERVALS[r.interval]}</td><td>${dateDe(r.next_date)}</td><td class="right num strong">${eur(net(r.items))}</td>
          <td>${r.active ? '<span class="badge b-paid">Aktiv</span>' : '<span class="badge b-draft">Pausiert</span>'}</td>
          <td class="right nowrap"><button class="btn btn-sm btn-secondary" data-toggle="${r.id}">${r.active ? 'Pausieren' : 'Fortsetzen'}</button><button class="icon-btn" data-del="${r.id}" aria-label="Vorlage löschen">${I.trash}</button></td></tr>`
          )
          .join('')}</tbody></table></div>`
          : `<div class="empty"><div class="ico">${I.repeat}</div><h3>Noch keine Vorlagen</h3><p>Lege eine Vorlage an, z. B. für einen monatlichen Wartungsvertrag oder Retainer.</p></div>`
      }</div>`;
    $('#addRec').addEventListener('click', () => {
      if (!customers.length) {
        toast('Lege zuerst einen Kunden an.', true);
        location.hash = '#/kunden?neu=1';
        return;
      }
      const md = openModal(
        `${modalHead('Neue wiederkehrende Rechnung')}
        <form id="recForm" novalidate><div class="modal-body"><div class="form-grid">
          <div class="field"><label for="r_c">Kunde</label><select id="r_c" name="customer_id">${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="r_t">Betreff <span class="opt">(optional)</span></label><input id="r_t" name="title" placeholder="z. B. Wartungsvertrag Website"></div>
          <div class="field s4"><label for="r_d">Leistung</label><input id="r_d" name="description" required placeholder="z. B. Website-Wartung & Updates"></div>
          <div class="field s2"><label for="r_p">Betrag netto (€)</label><input id="r_p" name="price" inputmode="decimal" required placeholder="0,00"></div>
          <div class="field s3"><label for="r_i">Intervall</label><select id="r_i" name="interval">${Object.entries(INTERVALS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field s3"><label for="r_n">Erste Rechnung am</label><input id="r_n" type="date" name="next_date" value="${todayIso()}" min="${todayIso()}"></div>
        </div></div>
        <div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" type="submit">Vorlage anlegen</button></div></form>`
      );
      $('#recForm', md).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        if (!f.description.trim() || !parseNum(f.price)) return toast('Bitte Leistung und Betrag angeben.', true);
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

  // =====================================================================
  // Einstellungen
  // =====================================================================
  function imageToPng(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / img.width, 360 / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      img.src = url;
    });
  }

  async function viewSettings(m, q, token) {
    const p = await api('/api/profile');
    if (stale(token)) return;
    S.profile = p;
    const f = S.me.features;
    const input = (name, label, cls = '', extra = '', hint = '') =>
      `<div class="field ${cls}"><label for="s_${name}">${label}</label><input id="s_${name}" name="${name}" value="${esc(p[name])}" ${extra}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    const xr = [!p.phone && 'Telefonnummer', !p.email && 'E-Mail-Adresse', !p.iban && 'IBAN', !p.tax_number && !p.vat_id && 'Steuernummer oder USt-IdNr.'].filter(Boolean);
    view.innerHTML = `
      <div class="page-head"><div><h1>Einstellungen</h1><p>Diese Angaben erscheinen auf deinen Rechnungen. Bereits abgeschlossene Rechnungen bleiben unverändert.</p></div></div>
      <div class="settings-layout">
      <nav class="settings-nav" aria-label="Abschnitte"><a href="#s-firma" data-scroll>Firmendaten</a><a href="#s-steuer" data-scroll>Steuern</a><a href="#s-bank" data-scroll>Bankverbindung</a><a href="#s-nummern" data-scroll>Nummern & Fristen</a><a href="#s-design" data-scroll>Erscheinungsbild</a><a href="#s-konto" data-scroll>Konto</a></nav>
      <div>
      <form id="profileForm" class="grid" novalidate>
        <div class="banner ${xr.length ? 'warn' : 'ok'}"><span>${xr.length ? I.alert : I.shield}<span>${xr.length ? `<b>E-Rechnung:</b> Für XRechnungen an Behörden und Großkunden fehlt noch: ${esc(xr.join(', '))}. ZUGFeRD-PDFs funktionieren bereits.` : '<b>E-Rechnung-bereit:</b> Deine Rechnungen enthalten ZUGFeRD, XRechnung ist ebenfalls möglich.'}</span></span></div>
        <div class="card card-pad" id="s-firma"><h2>Firmendaten</h2><p class="card-sub">Absender auf jeder Rechnung</p>
          <div class="form-grid">
            ${input('company', 'Firmenname <span class="opt">(optional)</span>', 's3')}${input('owner', 'Inhaber/in (Vor- und Nachname)', 's3', 'required')}
            ${input('street', 'Straße und Hausnummer', '', 'autocomplete="street-address"')}
            ${input('zip', 'PLZ', 's2', 'inputmode="numeric"')}${input('city', 'Ort', 's2')}
            <div class="field s2"><label for="s_country">Land</label><select id="s_country" name="country">${countryOptions(p.country)}</select></div>
            ${input('email', 'E-Mail', 's3', 'type="email"', 'Antworten deiner Kunden gehen an diese Adresse.')}${input('phone', 'Telefon', 's3', 'type="tel"', 'Für XRechnung erforderlich.')}
            ${input('website', 'Website <span class="opt">(optional)</span>')}
          </div>
        </div>
        <div class="card card-pad" id="s-steuer"><h2>Steuern</h2><p class="card-sub">Pflichtangabe nach § 14 UStG: Steuernummer <i>oder</i> USt-IdNr.</p>
          <div class="form-grid">${input('tax_number', 'Steuernummer', 's3', '', 'Vom Finanzamt, z. B. 12/345/67890')}${input('vat_id', 'USt-IdNr.', 's3', '', 'z. B. DE123456789 – nötig für EU-Kunden')}</div>
          <label class="switch"><input type="checkbox" name="small_business" ${p.small_business ? 'checked' : ''}><div><b>Kleinunternehmerregelung (§ 19 UStG)</b><span>Für neue Rechnungen: keine USt., der Pflichthinweis wird automatisch gedruckt.</span></div></label>
          <div class="field" style="max-width:240px"><label for="s_rate">Standard-Steuersatz</label><select id="s_rate" name="default_tax_rate">${[19, 7, 0].map((r) => `<option value="${r}" ${p.default_tax_rate === r ? 'selected' : ''}>${r} %</option>`).join('')}</select></div>
        </div>
        <div class="card card-pad" id="s-bank"><h2>Bankverbindung</h2><p class="card-sub">Wird auf der Rechnung und in der E-Rechnung angegeben. Die IBAN wird auf Tippfehler geprüft.</p>
          <div class="form-grid">${input('bank', 'Bank', 's2')}${input('iban', 'IBAN', 's3', 'autocomplete="off"')}${input('bic', 'BIC', 's1', 'autocomplete="off"')}</div>
        </div>
        <div class="card card-pad" id="s-nummern"><h2>Nummern & Fristen</h2><p class="card-sub">Rechnungsnummern werden lückenlos fortlaufend vergeben – erst beim Abschließen.</p>
          <div class="form-grid">
            ${input('invoice_prefix', 'Präfix Rechnungen', 's2', 'maxlength="10"')}${input('quote_prefix', 'Präfix Angebote', 's2', 'maxlength="10"')}
            <div class="field s2"><label for="s_next">Nächste Rechnungsnr.</label><input id="s_next" name="next_invoice_number" type="number" min="${p.next_invoice_number}" value="${p.next_invoice_number}"><span class="hint">Nur erhöhbar (z. B. beim Umstieg)</span></div>
            <div class="field s2"><label for="s_days">Zahlungsziel (Tage)</label><input id="s_days" name="payment_days" type="number" min="0" max="120" value="${p.payment_days}"></div>
          </div>
          <p class="small muted" style="margin:0">Nächste Rechnung: <b id="numPreview"></b></p>
        </div>
        <div class="card card-pad" id="s-design"><h2>Erscheinungsbild ${f.logo ? '' : '<span class="badge b-open">Pro</span>'}</h2><p class="card-sub">Logo, Akzentfarbe und Abschlusstext</p>
          <div class="field"><label>Logo</label>
            <div class="logo-row">
              <div class="logo-prev">${p.logo ? `<img src="${esc(p.logo)}" alt="Dein Logo">` : '<span class="small muted">Kein Logo</span>'}</div>
              <label class="btn btn-secondary btn-sm">${f.logo ? '' : I.lock}Logo hochladen<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
              ${p.logo ? '<button type="button" class="btn btn-ghost btn-sm" id="logoRemove">Entfernen</button>' : ''}
            </div>
            <span class="hint">PNG, JPG, WebP oder SVG · wird automatisch optimiert</span>
          </div>
          <div class="field"><label for="s_accent">Akzentfarbe</label><div class="color-row"><input id="s_accent" name="accent" type="color" value="${esc(p.accent)}">${['#1f4fd8', '#0f766e', '#7c3aed', '#be123c', '#111827', '#b45309'].map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('')}</div></div>
          <div class="field"><label for="s_footer">Zusatztext unter jeder Rechnung <span class="opt">(optional)</span></label><textarea id="s_footer" name="footer_note" rows="2" placeholder="z. B. Vielen Dank für Ihr Vertrauen!">${esc(p.footer_note)}</textarea></div>
        </div>
        <div class="form-actions sticky-save"><span class="muted small" id="profileState"></span><button class="btn btn-primary btn-lg" type="submit">Einstellungen speichern</button></div>
      </form>

      <div class="grid grid-2 mt-lg" id="s-konto">
        ${
          S.me.isDemo
            ? '<div class="card card-pad"><h2>Demo-Konto</h2><p class="card-sub">Passwort und Kontolöschung sind im Demo-Konto nicht verfügbar.</p></div>'
            : `<form class="card card-pad" id="pwForm" novalidate><h2>Passwort ändern</h2><p class="card-sub">Für ${esc(S.me.email)}</p>
          <div class="field"><label for="pw_cur">Aktuelles Passwort</label><input id="pw_cur" type="password" name="current" autocomplete="current-password" required></div>
          <div class="field"><label for="pw_new">Neues Passwort</label><input id="pw_new" type="password" name="next" autocomplete="new-password" minlength="8" required></div>
          <button class="btn btn-secondary" type="submit">Passwort ändern</button>
        </form>
        <div class="card card-pad"><h2>Daten & Konto</h2><p class="card-sub">Deine Daten gehören dir.</p>
          <p class="small muted">Rechnungen musst du in Deutschland in der Regel 8 Jahre aufbewahren. Lade vor dem Löschen deine PDFs und den CSV-Export herunter.</p>
          <div class="btn-row"><button class="btn btn-secondary" id="exportAll">${I.download}CSV-Export ${todayIso().slice(0, 4)}</button><button class="btn btn-danger" id="deleteAcc">Konto löschen</button></div>
        </div>`
        }
      </div>
      </div></div>`;

    const form = $('#profileForm');
    const numPreview = () => {
      const fe = form.elements;
      $('#numPreview').textContent = `${fe.invoice_prefix.value || 'RE'}-${todayIso().slice(0, 4)}-${String(fe.next_invoice_number.value || 1).padStart(4, '0')}`;
    };
    numPreview();
    let snapshot = JSON.stringify(Object.fromEntries(new FormData(form)));
    const dirty = () => JSON.stringify(Object.fromEntries(new FormData(form))) !== snapshot;
    S.dirty = dirty;
    form.addEventListener('input', () => {
      numPreview();
      $('#profileState').textContent = dirty() ? 'Ungespeicherte Änderungen' : '';
    });
    $$('.swatch', form).forEach((b) =>
      b.addEventListener('click', () => {
        form.elements.accent.value = b.dataset.color;
        form.dispatchEvent(new Event('input'));
      })
    );
    $$('[data-scroll]', view).forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        $(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
    $('#logoFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!f.logo) return showUpsell('logo');
      try {
        const png = await imageToPng(file);
        S.profile = await api('/api/profile', { method: 'PUT', body: { logo: png } });
        toast('Logo gespeichert');
        S.dirty = null;
        route();
      } catch (err) {
        fail(err);
      }
    });
    $('#logoRemove')?.addEventListener('click', async () => {
      try {
        await api('/api/profile', { method: 'PUT', body: { logo: '' } });
        S.dirty = null;
        route();
      } catch (err) {
        fail(err);
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.small_business = form.elements.small_business.checked;
      if (Number(data.next_invoice_number) === p.next_invoice_number) delete data.next_invoice_number;
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        S.profile = await api('/api/profile', { method: 'PUT', body: data });
        Object.assign(p, S.profile);
        await refreshMe();
        snapshot = JSON.stringify(Object.fromEntries(new FormData(form)));
        $('#profileState').textContent = '';
        form.elements.iban.value = S.profile.iban;
        toast('Einstellungen gespeichert');
      } catch (err) {
        fail(err);
      } finally {
        btn.disabled = false;
      }
    });
    $('#pwForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/me/password', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
        e.target.reset();
        toast('Passwort geändert');
      } catch (err) {
        fail(err);
      }
    });
    $('#exportAll')?.addEventListener('click', () => exportCsv(todayIso().slice(0, 4)));
    $('#deleteAcc')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Konto wirklich löschen?', 'Alle Rechnungen, Angebote und Kunden werden unwiderruflich gelöscht. Ein laufendes Abo wird sofort beendet.', 'Endgültig löschen', true))) return;
      try {
        await api('/api/me', { method: 'DELETE' });
        location.href = '/';
      } catch (err) {
        fail(err);
      }
    });
  }

  // =====================================================================
  // Abo
  // =====================================================================
  async function viewBilling(m, q, token) {
    await refreshMe();
    if (stale(token)) return;
    const me = S.me;
    const sub = me.subscription;
    const demo = me.billingMode === 'demo';
    let interval = sub.interval || 'monthly';
    const end = sub.currentPeriodEnd ? dateDe(new Date(sub.currentPeriodEnd * 1000).toISOString().slice(0, 10)) : null;
    const checkout = q.get('checkout');
    const perks = {
      free: ['3 abgeschlossene Rechnungen pro Monat', 'Bis zu 5 Kunden', 'E-Rechnung (ZUGFeRD & XRechnung)', 'PDF & E-Mail-Versand'],
      pro: ['Unbegrenzt Rechnungen & Kunden', 'Angebote → Rechnung', 'Eigenes Logo, ohne Branding', 'Zahlungserinnerungen & Mahnungen', 'CSV-Export für die Steuer'],
      business: ['Alles aus Pro', 'Wiederkehrende Rechnungen', 'Bevorzugter Support', 'Neue Funktionen zuerst'],
    };
    const order = { free: 0, pro: 1, business: 2 };

    const draw = () => {
      view.innerHTML = `
        <div class="page-head"><div><h1>Abo & Zahlung</h1><p>Wähle den Plan, der zu dir passt. Monatlich kündbar, keine versteckten Kosten.</p></div></div>
        ${checkout === 'success' ? `<div class="banner ok"><span>${I.check}<span><b>Willkommen im ${esc(me.planName)}-Plan! 🎉</b> Alle Funktionen sind jetzt freigeschaltet.</span></span><a class="btn btn-sm btn-success" href="#/dokument/neu">Rechnung schreiben</a></div>` : ''}
        ${checkout === 'cancel' ? `<div class="banner info"><span>Der Bezahlvorgang wurde abgebrochen. Kein Problem – du kannst jederzeit später upgraden.</span></div>` : ''}
        ${me.isDemo ? `<div class="banner info"><span>${I.eye}<span>Im Demo-Konto ist alles freigeschaltet. Erstelle dein eigenes Konto, um ein Abo abzuschließen.</span></span><button class="btn btn-sm btn-primary" data-leave-demo>Kostenloses Konto erstellen</button></div>` : ''}
        ${demo && !me.isDemo ? `<div class="banner warn"><span>${I.alert}<span><b>Testbetrieb:</b> Stripe ist noch nicht verbunden. Upgrades werden ohne Zahlung sofort aktiviert. Hinterlege deine Stripe-Schlüssel in der <code>.env</code>, um echte Abos zu verkaufen.</span></span></div>` : ''}
        <div class="card card-pad">
          <div class="plan-current">
            <div>
              <div class="muted small">Dein aktueller Plan</div>
              <div class="plan-current-name">${esc(me.planName)} ${me.plan !== 'free' ? `<span class="badge ${sub.status === 'past_due' ? 'b-overdue' : 'b-paid'}">${sub.status === 'trialing' ? 'Testphase' : sub.status === 'past_due' ? 'Zahlung offen' : sub.status === 'demo' ? 'Demo' : 'Aktiv'}</span>` : ''}</div>
              <div class="muted small">${
                me.plan === 'free'
                  ? `${me.usage.invoicesThisMonth} von ${me.limits.invoicesPerMonth} Rechnungen diesen Monat abgeschlossen`
                  : me.isDemo
                    ? 'Alle Funktionen zum Ausprobieren'
                    : `${sub.interval === 'yearly' ? 'Jährliche' : 'Monatliche'} Abrechnung${end ? ` · ${sub.status === 'trialing' ? 'Testphase endet' : sub.cancelAtPeriodEnd ? 'Endet' : 'Nächste Verlängerung'} am ${end}` : ''}`
              }</div>
            </div>
            <div class="btn-row">
              ${!me.isDemo && !demo && (me.plan !== 'free' || sub.status) ? `<button class="btn btn-secondary" id="portalBtn">${I.card}Zahlungsart, Belege & Kündigung</button>` : ''}
              ${!me.isDemo && demo && me.plan !== 'free' ? '<button class="btn btn-danger" id="demoCancel">Abo kündigen (Testbetrieb)</button>' : ''}
            </div>
          </div>
        </div>
        <div class="center-row">
          <div class="billing-toggle" role="group" aria-label="Abrechnungszeitraum">
            <button type="button" data-int="monthly" class="${interval === 'monthly' ? 'active' : ''}" aria-pressed="${interval === 'monthly'}">Monatlich</button>
            <button type="button" data-int="yearly" class="${interval === 'yearly' ? 'active' : ''}" aria-pressed="${interval === 'yearly'}">Jährlich <span class="save-badge">2 Monate gratis</span></button>
          </div>
        </div>
        <div class="plans">${S.plans
          .map((p) => {
            const current = p.id === me.plan;
            const price = interval === 'yearly' ? p.price.yearly / 12 : p.price.monthly;
            let action = '';
            if (me.isDemo) action = '';
            else if (current && (p.id === 'free' || sub.interval === interval || !demo)) action = '<button class="btn btn-secondary btn-block" disabled>Aktueller Plan</button>';
            else if (p.id === 'free') action = me.plan === 'free' ? '' : `<button class="btn btn-secondary btn-block" data-down>${demo ? 'Zu Starter wechseln' : 'Im Kundenportal kündigen'}</button>`;
            else if (me.plan !== 'free' && !demo) action = `<button class="btn ${order[p.id] > order[me.plan] ? 'btn-primary' : 'btn-secondary'} btn-block" data-portal>${order[p.id] > order[me.plan] ? 'Upgraden' : 'Wechseln'}</button>`;
            else action = `<button class="btn ${p.id === 'pro' ? 'btn-primary' : 'btn-secondary'} btn-block" data-plan="${p.id}">${me.plan === 'free' && S.trialDays && !sub.status ? `${S.trialDays} Tage kostenlos testen` : order[p.id] > order[me.plan] ? 'Upgraden' : current ? 'Intervall wechseln' : 'Wechseln'}</button>`;
            return `<div class="card plan-card${current ? ' current' : ''}">
              ${current ? '<span class="ribbon">Dein Plan</span>' : p.id === 'pro' && me.plan === 'free' ? '<span class="ribbon">Empfohlen</span>' : ''}
              <h3>${esc(p.name)}</h3>
              <div class="price"><span class="amount">${price.toLocaleString('de-DE', { maximumFractionDigits: 2 })} €</span><span class="per">/ Monat</span></div>
              <div class="muted small">${p.id === 'free' ? 'Für immer kostenlos' : interval === 'yearly' ? `${p.price.yearly} € jährlich abgerechnet` : 'Monatlich kündbar'}</div>
              <ul>${perks[p.id].map((x) => `<li>${checkIcon}<span>${esc(x)}</span></li>`).join('')}</ul>
              <div class="plan-action">${action}</div>
            </div>`;
          })
          .join('')}</div>
        <p class="small muted center">Alle Preise zzgl. gesetzlicher USt. · Sichere Zahlung über Stripe · Kündigung jederzeit zum Ende des Abrechnungszeitraums</p>`;

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
            toast('Im Testbetrieb gibt es kein Kundenportal.');
            b.disabled = false;
          } else location.href = r.url;
        } catch (err) {
          fail(err);
          b.disabled = false;
        }
      };
      $('#portalBtn')?.addEventListener('click', (e) => portal(e.currentTarget));
      $$('[data-portal]', view).forEach((b) => b.addEventListener('click', () => portal(b)));
      $$('[data-leave-demo]', view).forEach((b) => b.addEventListener('click', leaveDemo));
      const demoCancel = async () => {
        if (!(await confirmDialog('Abo kündigen?', 'Du wechselst zurück in den kostenlosen Starter-Plan. Deine Daten bleiben erhalten.', 'Kündigen', true))) return;
        try {
          await api('/api/billing/demo-cancel', { body: {} });
          await refreshMe();
          toast('Abo gekündigt');
          route();
        } catch (err) {
          fail(err);
        }
      };
      $('#demoCancel')?.addEventListener('click', demoCancel);
      $('[data-down]', view)?.addEventListener('click', (e) => (demo ? demoCancel() : portal(e.currentTarget)));
    };
    draw();
  }

  // =====================================================================
  // Start
  // =====================================================================
  async function init() {
    try {
      const [me, plans, meta] = await Promise.all([api('/api/me'), fetch('/api/plans').then((r) => r.json()), api('/api/meta')]);
      S.me = me;
      S.plans = plans.plans;
      S.trialDays = plans.trialDays;
      S.meta = meta;
      currentHash = location.hash;
      route();
    } catch (err) {
      if (!err.handled) view.innerHTML = `<div class="card empty"><h3>Verbindung fehlgeschlagen</h3><p>${esc(err.message)}</p><button class="btn btn-secondary" id="retryBtn">Erneut versuchen</button></div>`;
      $('#retryBtn')?.addEventListener('click', () => location.reload());
    }
  }
  init();
})();
