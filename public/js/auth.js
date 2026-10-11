(function () {
  const form = document.getElementById('authForm');
  const errorBox = document.getElementById('formError');
  const mode = form.dataset.mode;
  const params = new URLSearchParams(location.search);
  const plan = ['pro', 'business'].includes(params.get('plan')) ? params.get('plan') : null;
  const interval = params.get('interval') === 'yearly' ? 'yearly' : 'monthly';

  if (plan && mode === 'register') {
    const name = plan === 'pro' ? 'Pro' : 'Business';
    document.getElementById('regSub').textContent = `Erstelle dein Konto – danach startest du deine 14-tägige ${name}-Testphase.`;
  }

  // Bereits angemeldet? Direkt in die App.
  fetch('/api/me').then((r) => {
    if (r.ok && !plan) location.replace('/app');
  });

  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  };

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
    return data;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('show');
    const button = form.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(form));
    if (mode === 'register' && String(data.password).length < 8) return showError('Das Passwort muss mindestens 8 Zeichen haben.');
    button.disabled = true;
    try {
      await post(`/api/auth/${mode}`, data);
      if (plan) {
        const checkout = await post('/api/billing/checkout', { plan, interval });
        location.href = checkout.url;
      } else {
        location.href = mode === 'register' ? '/app#/willkommen' : '/app';
      }
    } catch (err) {
      showError(err.message);
      button.disabled = false;
    }
  });
})();
