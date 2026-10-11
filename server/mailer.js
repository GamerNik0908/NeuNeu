// E-Mail-Versand über SMTP (z. B. Brevo, Postmark, Mailjet, Strato, IONOS …).
// Ohne SMTP-Konfiguration ist der Versand deaktiviert – die App fällt dann auf
// "PDF herunterladen + eigenes E-Mail-Programm" zurück.
const nodemailer = require('nodemailer');

let transport = null;
const sent = []; // nur für Tests (MAIL_TRANSPORT=memory)

function enabled() {
  return process.env.MAIL_TRANSPORT === 'memory' || Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function getTransport() {
  if (transport) return transport;
  if (process.env.MAIL_TRANSPORT === 'memory') {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const fromAddress = () => process.env.MAIL_FROM || 'Fakturo <no-reply@localhost>';

// Absender ist immer unsere Domain (sonst landet alles im Spam), Antworten gehen an den Nutzer.
async function send({ to, cc, bcc, replyTo, fromName, subject, text, attachments }) {
  if (!enabled()) throw Object.assign(new Error('Der E-Mail-Versand ist nicht eingerichtet.'), { status: 501 });
  const address = fromAddress().match(/<([^>]+)>/)?.[1] || fromAddress();
  const from = fromName ? { name: `${fromName.replace(/["<>]/g, '')} via Fakturo`, address } : fromAddress();
  const message = { from, to, cc, bcc, replyTo, subject, text, attachments };
  const info = await getTransport().sendMail(message);
  if (process.env.MAIL_TRANSPORT === 'memory') sent.push({ ...message, attachments: (attachments || []).map((a) => a.filename) });
  return info;
}

module.exports = { enabled, send, sent };
