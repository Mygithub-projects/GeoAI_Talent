import nodemailer from 'nodemailer'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// The app user an email is sent on behalf of. We can't put their address in
// From — the message would fail SPF/DKIM/DMARC for their domain (moe.gov.my
// especially) and land in spam or bounce — so the system mailbox still sends,
// shown as "<name> via GeoAI Talent Agent", with Reply-To set to the user so
// a recipient's reply reaches them directly.
export interface EmailSender {
  name?:  string | null
  email?: string | null
}

export interface EmailPayload {
  to:      string
  subject: string
  html:    string
  sender?: EmailSender | null
}

const FROM = process.env.EMAIL_FROM ?? 'GeoAI Talent Agent <noreply@geotalent.jpnswk.edu.my>'

// Split FROM into display name + address ("Name <addr>" or a bare address).
const FROM_MATCH   = FROM.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
const FROM_NAME    = FROM_MATCH?.[1]?.trim() || 'GeoAI Talent Agent'
const FROM_ADDRESS = FROM_MATCH?.[2]?.trim() || FROM.trim()

// Header-safe display name: no CR/LF (header injection), quotes or angle brackets.
const cleanName = (s: string) => s.replace(/[\r\n"<>]+/g, ' ').replace(/\s+/g, ' ').trim()

interface ResolvedFrom { name: string; address: string; replyTo?: string }

function resolveFrom(sender?: EmailSender | null): ResolvedFrom {
  const email = sender?.email?.trim()
  if (!email || /[\r\n\s<>]/.test(email)) return { name: FROM_NAME, address: FROM_ADDRESS }
  const who = cleanName(sender?.name || '') || email
  return { name: `${who} via ${FROM_NAME}`, address: FROM_ADDRESS, replyTo: email }
}

export type EmailTransport = 'resend' | 'smtp' | 'console'

/**
 * Send an email via Resend REST API (RESEND_API_KEY or EMAIL_API_KEY starting with "re_"),
 * Nodemailer SMTP (SMTP_HOST set), or console fallback for development.
 * Returns the transport actually used — 'console' means nothing was
 * really delivered, and callers should surface that to the user.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailTransport> {
  const resendKey = process.env.RESEND_API_KEY ?? process.env.EMAIL_API_KEY
  if (resendKey?.startsWith('re_')) {
    await sendViaResend(payload, resendKey)
    return 'resend'
  }
  // Require credentials too — SMTP_HOST alone with a blank password would
  // fail every send instead of falling back to the console
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    await sendViaSMTP(payload)
    return 'smtp'
  }
  // Development fallback — log to console. Also print any links from the
  // body (accept/decline URLs) so flows can be tested without a provider;
  // this branch never runs when a real provider is configured.
  console.log('\n[EMAIL] ─────────────────────────────────────')
  const from = resolveFrom(payload.sender)
  console.log(`  From:    ${from.name} <${from.address}>${from.replyTo ? `  (Reply-To: ${from.replyTo})` : ''}`)
  console.log(`  To:      ${payload.to}`)
  console.log(`  Subject: ${payload.subject}`)
  const links = [...payload.html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
  if (links.length) {
    console.log('  Links:')
    for (const url of links) console.log(`    ${url}`)
  }
  console.log('[EMAIL] (HTML body omitted — set RESEND_API_KEY or SMTP_HOST to send for real)')
  console.log('[EMAIL] ─────────────────────────────────────\n')
  return 'console'
}

async function sendViaResend(payload: EmailPayload, apiKey: string): Promise<void> {
  const from = resolveFrom(payload.sender)
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:     `"${from.name}" <${from.address}>`,
      to:       payload.to,
      subject:  payload.subject,
      html:     payload.html,
      ...(from.replyTo ? { reply_to: from.replyTo } : {}),
    }),
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
  const from = resolveFrom(payload.sender)
  await transporter.sendMail({
    from:    { name: from.name, address: from.address },
    to:      payload.to,
    subject: payload.subject,
    html:    payload.html,
    ...(from.replyTo ? { replyTo: from.replyTo } : {}),
  })
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
