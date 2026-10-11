(function () {
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const toggle = document.getElementById('navToggle');
    toggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
  }

  // Preis-Umschalter monatlich / jährlich
  const toggleButtons = document.querySelectorAll('.billing-toggle button');
  toggleButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      const interval = btn.dataset.interval;
      toggleButtons.forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-monthly]').forEach((el) => (el.textContent = el.dataset[interval]));
      document.querySelectorAll('[data-plan-link]').forEach((a) => {
        a.href = `/register?plan=${a.dataset.planLink}&interval=${interval}`;
      });
    })
  );

  // Ersparnis-Rechner
  const inv = document.getElementById('calcInvoices');
  if (inv) {
    const min = document.getElementById('calcMinutes');
    const rate = document.getElementById('calcRate');
    const fmt = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    const update = () => {
      const n = Number(inv.value);
      const m = Number(min.value);
      const r = Number(rate.value);
      const saved = Math.max(0, (n * (m - 3)) / 60);
      const value = saved * r;
      document.getElementById('outInvoices').textContent = n;
      document.getElementById('outMinutes').textContent = `${m} min`;
      document.getElementById('outRate').textContent = `${r} €`;
      document.getElementById('calcHours').textContent = `${fmt(saved, 1)} Std.`;
      document.getElementById('calcValue').textContent = `${fmt(value)} €`;
      document.getElementById('calcRoi').textContent = `${fmt(Math.max(1, value / 9))}×`;
    };
    [inv, min, rate].forEach((el) => el.addEventListener('input', update));
    update();
  }

  // Live-Demo: legt ein Demo-Konto mit Beispieldaten an und öffnet die App
  document.querySelectorAll('[data-demo]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Demo wird vorbereitet …';
      try {
        const res = await fetch('/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Die Demo ist gerade nicht verfügbar.');
        location.href = '/app';
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = label;
      }
    })
  );

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
