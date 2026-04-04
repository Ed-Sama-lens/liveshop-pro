import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'LiveShop <noreply@liveshop.app>';

export interface EmailOptions {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
}

/**
 * Send an email via Resend.
 *
 * Silently logs errors in development; throws in production
 * to surface delivery failures.
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  // Skip if no API key configured
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EMAIL] Would send to ${options.to}: ${options.subject}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not configured');
  }

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  if (error) {
    throw new Error(`Email send failed: ${error.message}`);
  }
}
