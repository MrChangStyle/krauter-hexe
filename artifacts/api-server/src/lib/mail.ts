/**
 * Sending mail (docs/konto.md).
 *
 * Render cannot send mail itself, so the app uses Resend's HTTP API. It is
 * switched on by RESEND_API_KEY; MAIL_FROM sets the sender (the domain must be
 * verified at Resend). Without a key nothing is sent and callers fall back to
 * their manual way – for "Passwort vergessen" the owner passes on a link.
 *
 * Mail also needs PUBLIC_BASE_URL: links in a mail must never be built from
 * the request's Host header, which whoever asks for the mail can choose.
 */

import { getAppConfig } from './appConfig';
import { logger } from './logger';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Little Farming <hallo@littlefarming.de>';
const TIMEOUT_MS = 10_000;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function isMailConfigured(): boolean {
  return !!process.env['RESEND_API_KEY']?.trim() && !!getAppConfig().canonicalOrigin;
}

/** True when the mail service accepted the mail. Never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env['RESEND_API_KEY']?.trim();
  if (!key) return false;
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env['MAIL_FROM']?.trim() || DEFAULT_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, body: (await res.text()).slice(0, 300) }, 'mail rejected');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'mail failed');
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
