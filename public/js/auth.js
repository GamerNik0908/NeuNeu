(function () {
  const form = document.getElementById('authForm');
  const errorBox = document.getElementById('formError');
  const okBox = document.getElementById('formOk');
  const mode = form.dataset.mode;
  const params = new URLSearchParams(location.search);
  const plan = ['pro', 'business'].includes(params.get('plan')) ? params.get('plan') : null;
  const interval = params.get('interval') === 'yearly' ? 'yearly' : 'monthly';

  if (plan && mode === 'register') {
    document.getElementById('regSub').textContent = `Erstelle dein Konto – danach startest du deine kostenlose ${plan === 'pro' ? 'Pro' : 'Business'}-Testphase.`;
  }
  if (mode === 'login' && params.get('reset') === '1') show(okBox, 'Dein Passwort wurde geändert.');

  // Bereits angemeldet? Direkt in die App.
  if (mode === 'login' || (mode === 'register' && !plan)) {
    fetch('/api/me').then((r) => r.ok && r.json()).then((me) => me && !me.isDemo && location.replace('/app')).catch(() => {});
  }

  function show(box, msg) {
    if (!box) return;
    box.textContent = msg;
    box.classList.add('show');
  }
  const hide = () => [errorBox, okBox].forEach((b) => b && b.classList.remove('show'));

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.');
    return data;
  }

  document.querySelectorAll('[data-pw]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.textContent = visible ? 'Anzeigen' : 'Verbergen';
      btn.setAttribute('aria-label', visible ? 'Passwort anzeigen' : 'Passwort verbergen');
    })
  );

  document.querySelector('[data-demo]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await post('/api/auth/demo', {});
      location.href = '/app';
    } catch (err) {
      show(errorBox, err.message);
      e.currentTarget.disabled = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide();
    const button = form.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(form));
    if (data.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return show(errorBox, 'Bitte gib eine gültige E-Mail-Adresse ein.');
    if ((mode === 'register' || mode === 'reset') && String(data.password).length < 8) return show(errorBox, 'Das Passwort muss mindestens 8 Zeichen haben.');
    if (mode === 'register' && !form.elements.terms.checked) return show(errorBox, 'Bitte bestätige die AGB und die Datenschutzerklärung.');
    if (mode === 'register') data.terms = true;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Einen Moment …';
    try {
      if (mode === 'forgot') {
        const r = await post('/api/auth/forgot', data);
        show(okBox, r.emailEnabled ? 'Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link geschickt. Schau auch im Spam-Ordner nach.' : 'Der E-Mail-Versand ist auf diesem Server nicht eingerichtet. Der Link wurde in der Server-Konsole ausgegeben.');
        form.reset();
        button.disabled = false;
        button.textContent = label;
        return;
      }
      if (mode === 'reset') {
        await post('/api/auth/reset', { token: params.get('token'), password: data.password });
        location.href = '/app';
        return;
      }
      await post(`/api/auth/${mode}`, data);
      if (plan) {
        const checkout = await post('/api/billing/checkout', { plan, interval });
        location.href = checkout.url;
      } else {
        location.href = mode === 'register' ? '/app#/willkommen' : '/app';
      }
    } catch (err) {
      show(errorBox, err.message);
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
