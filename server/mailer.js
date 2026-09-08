import nodemailer from 'nodemailer';
import 'dotenv/config';

const SERVICE_LABELS = {
  alignment:   'Лазерная центровка',
  balancing:   'Динамическая балансировка',
  diagnostics: 'Вибродиагностика',
  consult:     'Консультация / другое',
};

let transporter = null;
let configured = false;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  configured = true;
  // Probe credentials at boot so a misconfiguration shows up immediately
  // in the server log instead of silently dropping every notification.
  transporter.verify().then(
    () => console.log('mailer ready ·', process.env.SMTP_HOST),
    (err) => console.error('mailer verify failed:', err.message),
  );
} else {
  console.log('mailer disabled (SMTP_HOST not set) — intake will still save to DB');
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));

const row = (label, value) => {
  if (value === null || value === undefined || value === '') return '';
  return `
    <tr>
      <td style="padding:8px 14px 8px 0;color:#80848B;font:500 11px/1.4 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#131619;font:400 14px/1.5 'IBM Plex Sans',system-ui,sans-serif;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
};

function buildHtml(r) {
  const serviceLabel = SERVICE_LABELS[r.service] ?? r.service;
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:32px 16px;background:#E5E4DC;font-family:'IBM Plex Sans',system-ui,sans-serif;color:#131619;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#E5E4DC;border:1px solid #B5B5AB;border-radius:2px;">
    <tr>
      <td style="padding:24px 28px 12px;border-bottom:1px solid #C7C7BD;">
        <div style="margin-top:4px;font:500 12px/1.4 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#545961;">${escapeHtml(serviceLabel)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          ${row('Имя', r.name)}
          ${row('Почта', r.email)}
          ${row('Телефон', r.phone)}
          ${row('Тип машины', r.machine)}
          ${row('Регион', r.region)}
        </table>
      </td>
    </tr>
    ${r.message ? `
    <tr>
      <td style="padding:6px 28px 22px;">
        <div style="font:500 11px/1.4 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#80848B;margin-bottom:8px;">Описание задачи</div>
        <div style="padding:14px 16px;background:#DAD9D0;border-left:2px solid #1F4E6B;font:400 14px/1.55 'IBM Plex Sans',system-ui,sans-serif;color:#131619;white-space:pre-wrap;">${escapeHtml(r.message)}</div>
      </td>
    </tr>` : ''}
    <tr>
      <td style="padding:14px 28px 22px;border-top:1px solid #C7C7BD;font:400 11px/1.5 'IBM Plex Mono',monospace;letter-spacing:.1em;color:#80848B;">
        Запись № ${escapeHtml(r.id)} · ${escapeHtml(new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }))} МСК<br>
        Согласие на обработку ПДн: ${r.consent ? 'получено' : 'НЕ получено'}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(r) {
  const serviceLabel = SERVICE_LABELS[r.service] ?? r.service;
  const lines = [
    `Заявка ${r.ref}`,
    `Направление: ${serviceLabel}`,
    '',
    `Имя:        ${r.name}`,
    `Почта:      ${r.email}`,
    `Телефон:    ${r.phone}`,
  ];
  if (r.machine) lines.push(`Тип машины: ${r.machine}`);
  if (r.region)  lines.push(`Регион:     ${r.region}`);
  if (r.message) lines.push('', 'Описание задачи:', r.message);
  lines.push('', `Запись № ${r.id} · ${new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`);
  lines.push(`IP: ${r.ip ?? '—'}`);
  return lines.join('\n');
}

/**
 * Send the intake notification. Fire-and-forget by design: the DB row is the
 * source of truth, email is just a heads-up. Caller should not await this.
 */
export function sendIntakeNotification(record) {
  if (!configured) return;

  const to = process.env.MAIL_TO;
  if (!to) {
    console.warn('mailer skipped: MAIL_TO not set');
    return;
  }

  const serviceLabel = SERVICE_LABELS[record.service] ?? record.service;

  transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    replyTo: record.email,
    subject: `Заявка ${record.id} — ${serviceLabel}`,
    text: buildText(record),
    html: buildHtml(record),
  }).then(
    (info) => console.log('mail sent', record.ref, '·', info.messageId),
    (err)  => console.error('mail failed', record.ref, '·', err.message),
  );
}
