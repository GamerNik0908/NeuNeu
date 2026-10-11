# Fakturo – Rechnungsprogramm mit monatlichem Abo

Fakturo ist eine fertige SaaS-Website: **Landingpage + Web-App + Abo-Bezahlung über Stripe**.
Zielgruppe sind Selbstständige, Freelancer und Kleinunternehmer in Deutschland, die Rechnungen
und Angebote schreiben müssen – ein Problem, das jeden Monat wiederkommt und deshalb gut zu einem Abo passt.

## Warum genau dieses Produkt?

| Frage | Antwort |
| --- | --- |
| Wer zahlt? | ~4 Mio. Selbstständige in DE müssen Rechnungen mit Pflichtangaben (§ 14 UStG) schreiben. |
| Warum monatlich? | Rechnungen fallen jeden Monat an – der Nutzen wiederholt sich, also bleibt das Abo. |
| Warum upgraden? | Der kostenlose Plan ist bewusst auf 3 Rechnungen/Monat begrenzt. Wer regelmäßig arbeitet, stößt daran – und bekommt genau dann ein Upgrade-Angebot. |
| Warum vertrauen? | Kostenloser Start ohne Kreditkarte, 14 Tage Testphase, monatlich kündbar, Zahlung über Stripe. |

## Pläne

| | Starter | Pro | Business |
| --- | --- | --- | --- |
| Preis | 0 € | 9 €/Monat (84 €/Jahr) | 19 €/Monat (180 €/Jahr) |
| Rechnungen | 3 pro Monat | unbegrenzt | unbegrenzt |
| Kunden | 5 | unbegrenzt | unbegrenzt |
| Angebote → Rechnung | – | ✓ | ✓ |
| Logo, ohne „Erstellt mit Fakturo“ | – | ✓ | ✓ |
| Zahlungserinnerungen/Mahnungen | – | ✓ | ✓ |
| CSV-Export für die Steuer | – | ✓ | ✓ |
| Wiederkehrende Rechnungen | – | – | ✓ |

Preise und Limits änderst du in `server/plans.js` (und die Texte in `public/index.html`).

## Was die Website kann

- **Landingpage** (`/`): Hero mit Produkt-Vorschau, Vorher/Nachher, Funktionen, 3-Schritte-Erklärung,
  Ersparnis-Rechner („Lohnt sich das?“), Preise mit Monat/Jahr-Umschalter, Vergleichstabelle, FAQ.
- **Registrierung & Login** mit sicheren Passwörtern (scrypt) und Sitzungs-Cookie.
- **Onboarding**: Firmendaten in 2 Minuten, dann direkt zur ersten Rechnung.
- **Dashboard**: offene, überfällige und bezahlte Beträge, Umsatz der letzten 6 Monate, Einrichtungs-Checkliste.
- **Rechnungs-Editor mit Live-Vorschau**, automatische fortlaufende Nummern, mehrere Steuersätze,
  Kleinunternehmerregelung (§ 19 UStG), PDF-Export über den Druckdialog.
- **Status-Verwaltung**: Entwurf → versendet → bezahlt / storniert. Versendete Rechnungen sind
  gesperrt (keine nachträgliche Änderung).
- **Angebote**, die mit einem Klick zur Rechnung werden.
- **E-Mail-Versand** mit vorformuliertem Text, **Zahlungserinnerung, 1. und 2. Mahnung**.
- **Kundenverwaltung**, **CSV-Export**, **wiederkehrende Rechnungen** (werden automatisch erzeugt).
- **Abo-Seite** mit Upgrade, Stripe Checkout und Stripe-Kundenportal (Kündigen, Zahlungsart, Rechnungen).
- **Upgrade-Hinweise genau im richtigen Moment** (Limit erreicht, Pro-Funktion angeklickt).

## Starten

Voraussetzung: Node.js 22.5 oder neuer.

```bash
npm install
npm start          # http://localhost:3000
npm test           # automatisierte Tests
```

Ohne Stripe-Schlüssel läuft die App im **Demo-Modus**: Upgrades werden ohne Zahlung sofort
aktiviert, damit du alles ausprobieren kannst. Die Daten liegen in `data/fakturo.db` (SQLite).

## Echte Abos mit Stripe einrichten

1. Konto auf [stripe.com](https://stripe.com) anlegen (erst im **Testmodus** arbeiten).
2. Unter **Produktkatalog** zwei Produkte anlegen: „Fakturo Pro“ und „Fakturo Business“,
   jeweils mit zwei wiederkehrenden Preisen (monatlich 9 € / jährlich 84 € bzw. 19 € / 180 €).
3. `.env.example` nach `.env` kopieren und eintragen:
   - `STRIPE_SECRET_KEY` (Entwickler → API-Schlüssel)
   - die vier `STRIPE_PRICE_…`-IDs (beginnen mit `price_`)
   - `APP_URL` = deine öffentliche Adresse, z. B. `https://fakturo.de`
4. **Webhook** anlegen (Entwickler → Webhooks) mit der URL `https://DEINE-DOMAIN/api/stripe/webhook`
   und den Ereignissen `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Das Signing-Secret als `STRIPE_WEBHOOK_SECRET` in die `.env`.
   Lokal testen: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
5. **Kundenportal** aktivieren (Einstellungen → Billing → Kundenportal): Kündigen, Planwechsel
   zwischen Pro/Business und Zahlungsart ändern erlauben.
6. Empfohlen: In Stripe **automatische Rechnungen** und **Stripe Tax** aktivieren, damit
   deine Kunden für ihr Abo korrekte Rechnungen mit USt. bekommen.
7. Testkauf mit Karte `4242 4242 4242 4242` – danach auf Live-Schlüssel umstellen.

## Online stellen

Die App ist ein einzelner Node-Prozess mit SQLite – sie läuft z. B. auf einem kleinen
VPS (Hetzner, ~5 €/Monat), Render, Railway oder Fly.io. Wichtig:

- `NODE_ENV=production` setzen (sichere Cookies) und HTTPS verwenden.
- Den Ordner `data/` auf einem dauerhaften Speicher ablegen und **regelmäßig sichern**.

## Vor dem Livegang (Pflicht in Deutschland)

- [ ] **Impressum, Datenschutzerklärung und AGB** in `public/legal/` mit echten Angaben füllen
      und rechtlich prüfen lassen.
- [ ] Gewerbe anmelden; die Abo-Einnahmen sind steuerpflichtig.
- [ ] Optional: Schriftart „Inter“ lokal hosten statt über Google Fonts (Datenschutz).
- [ ] Eigene Domain und E-Mail-Adresse für Support.

## Ideen, um mehr Abos zu verkaufen

- Auf Instagram/TikTok zeigen: „So schreibe ich eine Rechnung in 60 Sekunden“ (Bildschirmaufnahme).
- Ratgeber-Artikel für Google: „Rechnung schreiben als Kleinunternehmer“, „Pflichtangaben Rechnung“.
- In Freelancer-Gruppen (Facebook, Reddit, Discord) helfen und Fakturo verlinken.
- Rabattcodes über Stripe (Promotion Codes sind im Checkout schon aktiviert), z. B. 3 Monate −50 %.

## Projektstruktur

```
server/
  index.js       Express-Server, alle API-Routen
  plans.js       Pläne, Preise, Limits
  billing.js     Stripe Checkout, Kundenportal, Webhooks (+ Demo-Modus)
  documents.js   Rechnungen, Angebote, Steuerberechnung, wiederkehrende Rechnungen
  auth.js        Passwörter, Sitzungen, Rate-Limit
  db.js          SQLite-Schema
public/
  index.html     Landingpage
  app.html       Web-App (js/app.js)
  login.html, register.html, legal/
test/            API-Tests (node --test)
```
