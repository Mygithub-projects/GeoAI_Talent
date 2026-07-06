import nodemailer from 'nodemailer'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface EmailPayload {
  to:      string
  subject: string
  html:    string
}

const FROM = process.env.EMAIL_FROM ?? 'GEO-TALENT AGENT <noreply@geotalent.jpnswk.edu.my>'

/**
 * Send an email via Resend REST API (RESEND_API_KEY or EMAIL_API_KEY starting with "re_"),
 * Nodemailer SMTP (SMTP_HOST set), or console fallback for development.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY ?? process.env.EMAIL_API_KEY
  if (resendKey?.startsWith('re_')) {
    await sendViaResend(payload, resendKey)
    return
  }
  if (process.env.SMTP_HOST) {
    await sendViaSMTP(payload)
    return
  }
  // Development fallback — log to console
  console.log('\n[EMAIL] ─────────────────────────────────────')
  console.log(`  To:      ${payload.to}`)
  console.log(`  Subject: ${payload.subject}`)
  console.log('[EMAIL] (HTML body omitted — set RESEND_API_KEY or SMTP_HOST to send for real)')
  console.log('[EMAIL] ─────────────────────────────────────\n')
}

async function sendViaResend(payload: EmailPayload, apiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: FROM, to: payload.to, subject: payload.subject, html: payload.html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
}

async function sendViaSMTP(payload: EmailPayload): Promise<void> {
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST!,
    port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  })
  await transporter.sendMail({ from: FROM, to: payload.to, subject: payload.subject, html: payload.html })
}

// ── Venue resolution ─────────────────────────────────────────────
// Shared by invite/preview/reinvite routes: dynamic venue name wins,
// otherwise fall back to the registry school's name, otherwise 'TBC'.

export async function resolveVenueName(
  admin: AdminClient,
  engagement: { dynamic_venue_name?: string | null; venue_school_code?: string | null },
): Promise<string> {
  if (engagement.dynamic_venue_name) return engagement.dynamic_venue_name
  if (engagement.venue_school_code) {
    const { data: school } = await admin
      .from('schools').select('school_name').eq('school_code', engagement.venue_school_code).single()
    if (school?.school_name) return school.school_name
  }
  return 'TBC'
}
