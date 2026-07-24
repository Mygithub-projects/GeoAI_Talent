// Pure invitation-email HTML templating — no Node-only imports, so this
// is safe to use from both server routes and client components (the
// EmailReviewModal live preview builds the exact same HTML the send
// route will produce, with no server round-trip per keystroke).

export interface InvitationEmailParams {
  lang:          'en' | 'bm'
  // Plain text, blank-line-separated paragraphs; may contain the
  // literal token {{trainer_name}} (substitute via mergeTemplate
  // before calling this, or leave literal for a token-preview render).
  customMessage: string
  trainingTitle: string
  venueName:     string
  startDate:     string | null    // ISO date YYYY-MM-DD
  endDate:       string | null
  acceptUrl:     string
  declineUrl:    string
  expiresAt:     Date
}

const BM_MONTHS = [
  'Januari','Februari','Mac','April','Mei','Jun',
  'Julai','Ogos','September','Oktober','November','Disember',
]

function formatDate(iso: string | null, lang: 'en' | 'bm'): string {
  if (!iso) return 'TBC'
  const [y, m, d] = iso.split('-').map(Number)
  const month = lang === 'bm'
    ? BM_MONTHS[m - 1]
    : new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long' })
  return `${d} ${month} ${y}`
}

function formatExpiry(dt: Date, lang: 'en' | 'bm'): string {
  return formatDate(dt.toISOString().split('T')[0], lang)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Blank-line-separated paragraphs -> <p>; single newlines -> <br>.
function renderMessageHtml(message: string): string {
  return message
    .split(/\n{2,}/)
    .filter(para => para.trim().length > 0)
    .map(para => `<p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function defaultInvitationMessage(lang: 'en' | 'bm'): string {
  return lang === 'bm'
    ? 'Tuan/Puan {{trainer_name}},\n\nAnda telah dicadangkan dan dipilih sebagai Jurulatih Utama untuk program berikut. Sila semak butiran dan sahkan penyertaan anda.\n\nSila sahkan penyertaan anda dengan mengklik salah satu butang di bawah.'
    : 'Dear {{trainer_name}},\n\nYou have been nominated and selected as a Master Trainer for the programme below. Please review the details and confirm your participation.\n\nPlease confirm your participation using one of the buttons below.'
}

export function defaultInvitationSubject(lang: 'en' | 'bm', trainingTitle: string): string {
  return lang === 'bm'
    ? `Jemputan Latihan: ${trainingTitle}`
    : `Training Invitation: ${trainingTitle}`
}

// ── Response acknowledgment ──────────────────────────────────────
// Sent automatically to the trainer right after they click Accept or
// Decline. Pure confirmation of what was recorded — no links, no
// buttons, no prompt to log in to the system.

export interface ResponseAckEmailParams {
  lang:          'en' | 'bm'
  trainerName:   string
  accepted:      boolean
  trainingTitle: string
  venueName:     string
  startDate:     string | null
  endDate:       string | null
}

export function buildResponseAckEmail(p: ResponseAckEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'

  const strings = isBm ? {
    sectionTitle: 'MAKLUM BALAS DITERIMA',
    statusLabel:  'Status',
    labelProg:    'Program',
    labelVenue:   'Tempat',
    labelDates:   'Tarikh',
    statusValue:  p.accepted ? 'DISAHKAN' : 'DITOLAK',
    subject:      p.accepted
      ? `Pengesahan Penyertaan: ${p.trainingTitle}`
      : `Maklum Balas Direkodkan: ${p.trainingTitle}`,
    greeting:     `Tuan/Puan ${p.trainerName},`,
    body:         p.accepted
      ? 'Terima kasih atas maklum balas anda. Penerimaan anda telah direkodkan dan penyertaan anda bagi program di bawah kini <strong>DISAHKAN</strong>.'
      : 'Terima kasih atas maklum balas anda. Penolakan anda bagi program di bawah telah direkodkan.',
    closing:      p.accepted
      ? 'Penyelaras program telah dimaklumkan. Sebarang maklumat lanjut mengenai program ini akan disampaikan kepada anda oleh pihak penyelaras. Tiada tindakan lanjut diperlukan daripada anda buat masa ini.'
      : 'Penyelaras program telah dimaklumkan. Tiada tindakan lanjut diperlukan daripada anda.',
    footerLine1:  'Emel ini dihantar bagi pihak Jabatan Pendidikan Negeri Sarawak.',
    footerLine2:  'Emel ini dijana secara automatik — tiada balasan diperlukan.',
  } : {
    sectionTitle: 'RESPONSE RECEIVED',
    statusLabel:  'Status',
    labelProg:    'Programme',
    labelVenue:   'Venue',
    labelDates:   'Dates',
    statusValue:  p.accepted ? 'CONFIRMED' : 'DECLINED',
    subject:      p.accepted
      ? `Participation Confirmed: ${p.trainingTitle}`
      : `Response Recorded: ${p.trainingTitle}`,
    greeting:     `Dear ${p.trainerName},`,
    body:         p.accepted
      ? 'Thank you for your response. Your acceptance has been recorded and your participation in the programme below is now <strong>CONFIRMED</strong>.'
      : 'Thank you for your response. Your decision to decline the programme below has been recorded.',
    closing:      p.accepted
      ? 'The programme coordinator has been notified. Any further details about the programme will be communicated to you by the coordinator. No further action is required from you at this time.'
      : 'The programme coordinator has been notified. No further action is required from you.',
    footerLine1:  'This email was sent on behalf of Jabatan Pendidikan Negeri Sarawak.',
    footerLine2:  'This is an automated acknowledgment — no reply is needed.',
  }

  const dateRange = p.startDate === p.endDate
    ? formatDate(p.startDate, p.lang)
    : `${formatDate(p.startDate, p.lang)} – ${formatDate(p.endDate, p.lang)}`

  const statusColor = p.accepted ? '#12B5AC' : '#15233A'

  const html = `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${strings.subject}</title>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#F6F8FB;padding:32px 16px;">
    <tr><td align="center">

      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td style="background:#0E2F57;padding:28px 32px;text-align:center;">
            <p style="color:rgba(255,255,255,.55);font-size:11px;letter-spacing:2px;
                      text-transform:uppercase;margin:0 0 6px;">
              Jabatan Pendidikan Negeri Sarawak
            </p>
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:.5px;">
              GeoAI Talent Agent
            </h1>
          </td>
        </tr>

        <!-- Title bar (teal on accept, slate on decline) -->
        <tr>
          <td style="background:${statusColor};padding:10px 32px;">
            <p style="color:#ffffff;font-size:11px;font-weight:700;margin:0;letter-spacing:1px;">
              ${strings.sectionTitle}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">

            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${escapeHtml(strings.greeting)}</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${strings.body}</p>

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background:#F6F8FB;border:1px solid #E2E8F0;
                          border-left:4px solid ${statusColor};border-radius:8px;
                          padding:0;margin-bottom:28px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;width:80px;vertical-align:top;padding-bottom:10px;">
                        ${strings.statusLabel}
                      </td>
                      <td style="font-size:14px;color:${statusColor};font-weight:700;padding-bottom:10px;">
                        ${strings.statusValue}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelProg}
                      </td>
                      <td style="font-size:14px;color:#0E2F57;font-weight:700;padding-bottom:10px;">
                        ${escapeHtml(p.trainingTitle)}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelVenue}
                      </td>
                      <td style="font-size:13px;color:#334155;padding-bottom:10px;">
                        ${escapeHtml(p.venueName)}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;">
                        ${strings.labelDates}
                      </td>
                      <td style="font-size:13px;color:#334155;">
                        ${dateRange}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="color:#94A3B8;font-size:12px;margin:0;">
              ${strings.closing}
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F6F8FB;padding:20px 32px;
                     border-top:1px solid #E2E8F0;text-align:center;">
            <p style="color:#94A3B8;font-size:11px;line-height:1.7;margin:0 0 4px;">
              ${strings.footerLine1}
            </p>
            <p style="color:#CBD5E1;font-size:10px;margin:0;">
              ${strings.footerLine2}
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`

  return { subject: strings.subject, html }
}

// ── Reschedule re-confirmation ───────────────────────────────────
// Sent to every still-invited/accepted trainer when a workshop's dates
// change after invitations went out. Shows the old dates struck through
// next to the new dates and asks the trainer to re-confirm via fresh
// accept/decline links (their previous response no longer applies).

export interface RescheduleEmailParams {
  lang:          'en' | 'bm'
  trainerName:   string
  trainingTitle: string
  venueName:     string
  oldStartDate:  string | null    // ISO date YYYY-MM-DD
  oldEndDate:    string | null
  newStartDate:  string | null
  newEndDate:    string | null
  acceptUrl:     string
  declineUrl:    string
  expiresAt:     Date
}

function formatDateRange(start: string | null, end: string | null, lang: 'en' | 'bm'): string {
  return start === end
    ? formatDate(start, lang)
    : `${formatDate(start, lang)} – ${formatDate(end, lang)}`
}

export function buildRescheduleEmail(p: RescheduleEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'

  const strings = isBm ? {
    sectionTitle: 'PERUBAHAN TARIKH — SILA SAHKAN SEMULA',
    labelProg:    'Program',
    labelVenue:   'Tempat',
    labelOld:     'Tarikh Asal',
    labelNew:     'Tarikh Baharu',
    subject:      `Perubahan Tarikh: ${p.trainingTitle}`,
    greeting:     `Tuan/Puan ${p.trainerName},`,
    body:         'Sila ambil perhatian bahawa tarikh program berikut telah <strong>diubah</strong>. Maklum balas anda yang terdahulu tidak lagi terpakai bagi tarikh baharu ini.',
    reconfirm:    'Sila sahkan semula penyertaan anda bagi tarikh baharu dengan mengklik salah satu butang di bawah.',
    acceptBtn:    '✔ Terima Tarikh Baharu',
    declineBtn:   '✘ Tolak Tarikh Baharu',
    expiryNote:   `Pautan pengesahan ini tamat tempoh pada <strong>${formatExpiry(p.expiresAt, 'bm')}</strong>.`,
    footerLine1:  'Emel ini dihantar bagi pihak Jabatan Pendidikan Negeri Sarawak.',
    footerLine2:  'Sekiranya anda tidak menjangka menerima emel ini, sila abaikannya.',
  } : {
    sectionTitle: 'DATE CHANGE — PLEASE RE-CONFIRM',
    labelProg:    'Programme',
    labelVenue:   'Venue',
    labelOld:     'Previous dates',
    labelNew:     'New dates',
    subject:      `Date Change: ${p.trainingTitle}`,
    greeting:     `Dear ${p.trainerName},`,
    body:         'Please note that the dates of the programme below have been <strong>changed</strong>. Your previous response no longer applies to the new dates.',
    reconfirm:    'Please re-confirm your participation for the new dates using one of the buttons below.',
    acceptBtn:    '✔ Accept New Dates',
    declineBtn:   '✘ Decline New Dates',
    expiryNote:   `These confirmation links expire on <strong>${formatExpiry(p.expiresAt, 'en')}</strong>.`,
    footerLine1:  'This email was sent on behalf of Jabatan Pendidikan Negeri Sarawak.',
    footerLine2:  'If you were not expecting this email, you may safely disregard it.',
  }

  const html = `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${strings.subject}</title>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#F6F8FB;padding:32px 16px;">
    <tr><td align="center">

      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td style="background:#0E2F57;padding:28px 32px;text-align:center;">
            <p style="color:rgba(255,255,255,.55);font-size:11px;letter-spacing:2px;
                      text-transform:uppercase;margin:0 0 6px;">
              Jabatan Pendidikan Negeri Sarawak
            </p>
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:.5px;">
              GeoAI Talent Agent
            </h1>
          </td>
        </tr>

        <!-- Amber title bar -->
        <tr>
          <td style="background:#F2A341;padding:10px 32px;">
            <p style="color:#ffffff;font-size:11px;font-weight:700;margin:0;letter-spacing:1px;">
              ${strings.sectionTitle}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">

            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${escapeHtml(strings.greeting)}</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${strings.body}</p>

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background:#F6F8FB;border:1px solid #E2E8F0;
                          border-left:4px solid #F2A341;border-radius:8px;
                          padding:0;margin-bottom:28px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;width:110px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelProg}
                      </td>
                      <td style="font-size:14px;color:#0E2F57;font-weight:700;padding-bottom:10px;">
                        ${escapeHtml(p.trainingTitle)}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelVenue}
                      </td>
                      <td style="font-size:13px;color:#334155;padding-bottom:10px;">
                        ${escapeHtml(p.venueName)}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelOld}
                      </td>
                      <td style="font-size:13px;padding-bottom:10px;">
                        <s style="color:#94A3B8;">${formatDateRange(p.oldStartDate, p.oldEndDate, p.lang)}</s>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;">
                        ${strings.labelNew}
                      </td>
                      <td style="font-size:14px;color:#0E2F57;font-weight:700;">
                        ${formatDateRange(p.newStartDate, p.newEndDate, p.lang)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${strings.reconfirm}</p>

            <!-- CTA buttons -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="margin-bottom:24px;">
              <tr>
                <td style="padding-right:8px;width:50%;">
                  <a href="${p.acceptUrl}"
                     style="display:block;text-align:center;background:#12B5AC;color:#ffffff;
                            text-decoration:none;font-size:14px;font-weight:700;
                            padding:13px 20px;border-radius:8px;letter-spacing:.2px;">
                    ${strings.acceptBtn}
                  </a>
                </td>
                <td style="padding-left:8px;width:50%;">
                  <a href="${p.declineUrl}"
                     style="display:block;text-align:center;background:#15233A;color:#ffffff;
                            text-decoration:none;font-size:14px;font-weight:700;
                            padding:13px 20px;border-radius:8px;letter-spacing:.2px;">
                    ${strings.declineBtn}
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#94A3B8;font-size:12px;margin:0;">
              ${strings.expiryNote}
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F6F8FB;padding:20px 32px;
                     border-top:1px solid #E2E8F0;text-align:center;">
            <p style="color:#94A3B8;font-size:11px;line-height:1.7;margin:0 0 4px;">
              ${strings.footerLine1}
            </p>
            <p style="color:#CBD5E1;font-size:10px;margin:0;">
              ${strings.footerLine2}
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`

  return { subject: strings.subject, html }
}

// ── Shared shell for the simple notification emails (Phase 8) ────
// Same visual skeleton as the ack email: navy header, coloured title
// bar, body paragraphs, optional details card, optional CTA button.

interface SimpleEmailShellParams {
  lang:         'en' | 'bm'
  subject:      string
  sectionTitle: string
  barColor:     string
  paragraphs:   string[]           // already-safe HTML strings
  detailRows?:  Array<{ label: string; value: string; strong?: boolean }>
  cta?:         { label: string; url: string }
  footerLine2:  string
}

function buildSimpleEmail(p: SimpleEmailShellParams): { subject: string; html: string } {
  const footerLine1 = p.lang === 'bm'
    ? 'Emel ini dihantar bagi pihak Jabatan Pendidikan Negeri Sarawak.'
    : 'This email was sent on behalf of Jabatan Pendidikan Negeri Sarawak.'

  const detailsCard = p.detailRows?.length ? `
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background:#F6F8FB;border:1px solid #E2E8F0;
                          border-left:4px solid ${p.barColor};border-radius:8px;
                          padding:0;margin-bottom:28px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    ${p.detailRows.map((r, i) => `<tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;width:110px;vertical-align:top;${i < p.detailRows!.length - 1 ? 'padding-bottom:10px;' : ''}">
                        ${r.label}
                      </td>
                      <td style="font-size:${r.strong ? 14 : 13}px;color:${r.strong ? '#0E2F57' : '#334155'};${r.strong ? 'font-weight:700;' : ''}${i < p.detailRows!.length - 1 ? 'padding-bottom:10px;' : ''}">
                        ${r.value}
                      </td>
                    </tr>`).join('')}
                  </table>
                </td>
              </tr>
            </table>` : ''

  const ctaBlock = p.cta ? `
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
              <tr>
                <td>
                  <a href="${p.cta.url}"
                     style="display:inline-block;text-align:center;background:#12B5AC;color:#ffffff;
                            text-decoration:none;font-size:14px;font-weight:700;
                            padding:13px 28px;border-radius:8px;letter-spacing:.2px;">
                    ${p.cta.label}
                  </a>
                </td>
              </tr>
            </table>` : ''

  const html = `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${p.subject}</title>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#F6F8FB;padding:32px 16px;">
    <tr><td align="center">

      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td style="background:#0E2F57;padding:28px 32px;text-align:center;">
            <p style="color:rgba(255,255,255,.55);font-size:11px;letter-spacing:2px;
                      text-transform:uppercase;margin:0 0 6px;">
              Jabatan Pendidikan Negeri Sarawak
            </p>
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:.5px;">
              GeoAI Talent Agent
            </h1>
          </td>
        </tr>

        <!-- Title bar -->
        <tr>
          <td style="background:${p.barColor};padding:10px 32px;">
            <p style="color:#ffffff;font-size:11px;font-weight:700;margin:0;letter-spacing:1px;">
              ${p.sectionTitle}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">
            ${p.paragraphs.map(para => `<p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">${para}</p>`).join('')}
            ${detailsCard}
            ${ctaBlock}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F6F8FB;padding:20px 32px;
                     border-top:1px solid #E2E8F0;text-align:center;">
            <p style="color:#94A3B8;font-size:11px;line-height:1.7;margin:0 0 4px;">
              ${footerLine1}
            </p>
            <p style="color:#CBD5E1;font-size:10px;margin:0;">
              ${p.footerLine2}
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`

  return { subject: p.subject, html }
}

// ── Account approved (Phase 8) ───────────────────────────────────
// Sent to a user when an admin approves their pending registration.

export interface AccountApprovedEmailParams {
  lang:     'en' | 'bm'
  fullName: string
  role:     'admin' | 'user'
  district: string | null
  loginUrl: string
}

export function buildAccountApprovedEmail(p: AccountApprovedEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'
  const roleLabel = p.role === 'admin'
    ? (isBm ? 'Pentadbir' : 'Administrator')
    : (isBm ? 'Pengguna Standard' : 'Standard User')

  return buildSimpleEmail({
    lang:         p.lang,
    subject:      isBm ? 'Akaun Anda Telah Diluluskan — GeoAI Talent Agent' : 'Your Account Has Been Approved — GeoAI Talent Agent',
    sectionTitle: isBm ? 'AKAUN DILULUSKAN' : 'ACCOUNT APPROVED',
    barColor:     '#12B5AC',
    paragraphs: [
      escapeHtml(isBm ? `Tuan/Puan ${p.fullName},` : `Dear ${p.fullName},`),
      isBm
        ? 'Pendaftaran anda telah <strong>diluluskan</strong>. Anda kini boleh log masuk ke GeoAI Talent Agent menggunakan e-mel dan kata laluan yang anda daftarkan.'
        : 'Your registration has been <strong>approved</strong>. You can now sign in to the GeoAI Talent Agent using the email and password you registered with.',
    ],
    detailRows: [
      { label: isBm ? 'Peranan' : 'Role', value: escapeHtml(roleLabel), strong: true },
      ...(p.district ? [{ label: isBm ? 'Daerah PPD' : 'PPD district', value: escapeHtml(p.district) }] : []),
    ],
    cta: { label: isBm ? 'Log Masuk' : 'Sign In', url: p.loginUrl },
    footerLine2: isBm
      ? 'Emel ini dijana secara automatik — tiada balasan diperlukan.'
      : 'This is an automated notification — no reply is needed.',
  })
}

// ── Trainer response notification to the coordinator (Phase 8) ───
// Sent to the engagement creator when a trainer clicks Accept or
// Decline — the email twin of the in-app bell notification.

export interface TrainerResponseNotifyEmailParams {
  lang:          'en' | 'bm'
  creatorName:   string
  trainerName:   string
  accepted:      boolean
  trainingTitle: string
  venueName:     string
  startDate:     string | null
  endDate:       string | null
  backlogUrl:    string
}

export function buildTrainerResponseNotifyEmail(p: TrainerResponseNotifyEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'
  const dateRange = formatDateRange(p.startDate, p.endDate, p.lang)
  const statusColor = p.accepted ? '#12B5AC' : '#15233A'

  return buildSimpleEmail({
    lang:         p.lang,
    subject:      isBm
      ? `${p.accepted ? 'Jurulatih Menerima' : 'Jurulatih Menolak'}: ${p.trainingTitle}`
      : `${p.accepted ? 'Trainer Accepted' : 'Trainer Declined'}: ${p.trainingTitle}`,
    sectionTitle: isBm
      ? (p.accepted ? 'JEMPUTAN DITERIMA' : 'JEMPUTAN DITOLAK')
      : (p.accepted ? 'INVITATION ACCEPTED' : 'INVITATION DECLINED'),
    barColor:     statusColor,
    paragraphs: [
      escapeHtml(isBm ? `Tuan/Puan ${p.creatorName},` : `Dear ${p.creatorName},`),
      isBm
        ? `<strong>${escapeHtml(p.trainerName)}</strong> telah <strong>${p.accepted ? 'MENERIMA' : 'MENOLAK'}</strong> jemputan bagi program di bawah.`
        : `<strong>${escapeHtml(p.trainerName)}</strong> has <strong>${p.accepted ? 'ACCEPTED' : 'DECLINED'}</strong> the invitation for the programme below.`,
    ],
    detailRows: [
      { label: isBm ? 'Program' : 'Programme', value: escapeHtml(p.trainingTitle), strong: true },
      { label: isBm ? 'Tempat' : 'Venue',      value: escapeHtml(p.venueName) },
      { label: isBm ? 'Tarikh' : 'Dates',      value: dateRange },
    ],
    cta: { label: isBm ? 'Lihat Papan Bengkel' : 'View Engagements Board', url: p.backlogUrl },
    footerLine2: isBm
      ? 'Emel ini dijana secara automatik — tiada balasan diperlukan.'
      : 'This is an automated notification — no reply is needed.',
  })
}

// ── Post-workshop feedback request (Phase 9) ─────────────────────
// Sent automatically by the daily cron once a workshop completes
// (end_date passed, workflow Confirmed) — asks each confirmed trainer
// to fill in the public token-linked feedback form within 14 days.

export interface FeedbackRequestEmailParams {
  lang:          'en' | 'bm'
  trainerName:   string
  trainingTitle: string
  venueName:     string
  startDate:     string | null    // ISO date YYYY-MM-DD
  endDate:       string | null
  deadlineDate:  string           // ISO date YYYY-MM-DD — stated fill-by deadline (sent + 14 days)
  feedbackUrl:   string
}

export function buildFeedbackRequestEmail(p: FeedbackRequestEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'
  const dateRange = formatDateRange(p.startDate, p.endDate, p.lang)
  const deadline  = formatDate(p.deadlineDate, p.lang)

  return buildSimpleEmail({
    lang:         p.lang,
    subject:      isBm ? `Maklum Balas Bengkel: ${p.trainingTitle}` : `Workshop Feedback: ${p.trainingTitle}`,
    sectionTitle: isBm ? 'PERMINTAAN MAKLUM BALAS' : 'FEEDBACK REQUEST',
    barColor:     '#1E63C4',   // Royal Blue — distinct from teal (accept) / amber (reschedule)
    paragraphs: [
      escapeHtml(isBm ? `Tuan/Puan ${p.trainerName},` : `Dear ${p.trainerName},`),
      isBm
        ? 'Terima kasih kerana berkhidmat sebagai Jurulatih Utama bagi program di bawah. Kami amat menghargai jika anda dapat meluangkan beberapa minit untuk melengkapkan borang maklum balas ringkas mengenai pengalaman anda.'
        : 'Thank you for serving as Master Trainer for the programme below. We would greatly appreciate a few minutes of your time to complete a short feedback form about your experience.',
    ],
    detailRows: [
      { label: isBm ? 'Program' : 'Programme',        value: escapeHtml(p.trainingTitle), strong: true },
      { label: isBm ? 'Tempat' : 'Venue',             value: escapeHtml(p.venueName) },
      { label: isBm ? 'Tarikh' : 'Dates',             value: dateRange },
      { label: isBm ? 'Tarikh Akhir' : 'Deadline',    value: `<strong>${deadline}</strong>` },
    ],
    cta: { label: isBm ? 'Isi Borang Maklum Balas' : 'Complete Feedback Form', url: p.feedbackUrl },
    footerLine2: isBm
      ? `Sila lengkapkan borang ini dalam tempoh 14 hari (sebelum ${deadline}). Emel ini dijana secara automatik — tiada balasan diperlukan.`
      : `Please complete this form within 14 days (by ${deadline}). This is an automated notification — no reply is needed.`,
  })
}

// ── Workshop cancellation apology (2026-07-22) ───────────────────
// Sent to every Confirmed or Pending-invite trainer when a workshop is
// cancelled from the Calendar. A pure receipt — NO links (trainer-facing
// public rule: their emails carry no route into the app).

export interface CancellationEmailParams {
  lang:          'en' | 'bm'
  trainerName:   string
  trainingTitle: string
  venueName:     string
  startDate:     string | null    // ISO date YYYY-MM-DD (the cancelled dates)
  endDate:       string | null
}

export function buildCancellationEmail(p: CancellationEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'
  const dateRange = formatDateRange(p.startDate, p.endDate, p.lang)

  return buildSimpleEmail({
    lang:         p.lang,
    subject:      isBm ? `Bengkel Dibatalkan: ${p.trainingTitle}` : `Workshop Cancelled: ${p.trainingTitle}`,
    sectionTitle: isBm ? 'BENGKEL DIBATALKAN' : 'WORKSHOP CANCELLED',
    barColor:     '#B91C1C',   // clear "cancelled" signal — not the amber alert bar
    paragraphs: [
      escapeHtml(isBm ? `Tuan/Puan ${p.trainerName},` : `Dear ${p.trainerName},`),
      isBm
        ? 'Dukacita dimaklumkan bahawa program latihan di bawah telah <strong>dibatalkan</strong>. Maaf atas segala kesulitan yang timbul; sebarang kemas kini akan dimaklumkan kemudian.'
        : 'We regret to inform you that the training programme below has been <strong>cancelled</strong>. Sorry for the inconvenience caused; any update will be further informed.',
    ],
    detailRows: [
      { label: isBm ? 'Program' : 'Programme', value: escapeHtml(p.trainingTitle), strong: true },
      { label: isBm ? 'Tempat' : 'Venue',      value: escapeHtml(p.venueName) },
      { label: isBm ? 'Tarikh' : 'Dates',      value: dateRange },
    ],
    footerLine2: isBm
      ? 'Emel ini dijana secara automatik — tiada balasan diperlukan.'
      : 'This is an automated notification — no reply is needed.',
  })
}

export function buildInvitationEmail(p: InvitationEmailParams): { subject: string; html: string } {
  const isBm = p.lang === 'bm'

  const strings = isBm ? {
    sectionTitle: 'JEMPUTAN LATIHAN RASMI',
    labelProg:    'Program',
    labelVenue:   'Tempat',
    labelDates:   'Tarikh',
    acceptBtn:    '✔ Terima Jemputan',
    declineBtn:   '✘ Tolak Jemputan',
    expiryNote:   `Jemputan ini tamat tempoh pada <strong>${formatExpiry(p.expiresAt, 'bm')}</strong>.`,
    footerLine1:  'Jemputan ini dihantar bagi pihak Jabatan Pendidikan Negeri Sarawak.',
    footerLine2:  'Sekiranya anda tidak menjangka menerima emel ini, sila abaikannya.',
  } : {
    sectionTitle: 'OFFICIAL TRAINING INVITATION',
    labelProg:    'Programme',
    labelVenue:   'Venue',
    labelDates:   'Dates',
    acceptBtn:    '✔ Accept Invitation',
    declineBtn:   '✘ Decline Invitation',
    expiryNote:   `This invitation expires on <strong>${formatExpiry(p.expiresAt, 'en')}</strong>.`,
    footerLine1:  'This invitation was sent on behalf of Jabatan Pendidikan Negeri Sarawak.',
    footerLine2:  'If you were not expecting this email, you may safely disregard it.',
  }

  const dateRange = p.startDate === p.endDate
    ? formatDate(p.startDate, p.lang)
    : `${formatDate(p.startDate, p.lang)} – ${formatDate(p.endDate, p.lang)}`

  const subject = defaultInvitationSubject(p.lang, p.trainingTitle)

  const html = `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#F6F8FB;padding:32px 16px;">
    <tr><td align="center">

      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td style="background:#0E2F57;padding:28px 32px;text-align:center;">
            <p style="color:rgba(255,255,255,.55);font-size:11px;letter-spacing:2px;
                      text-transform:uppercase;margin:0 0 6px;">
              Jabatan Pendidikan Negeri Sarawak
            </p>
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:.5px;">
              GeoAI Talent Agent
            </h1>
          </td>
        </tr>

        <!-- Teal title bar -->
        <tr>
          <td style="background:#12B5AC;padding:10px 32px;">
            <p style="color:#ffffff;font-size:11px;font-weight:700;margin:0;letter-spacing:1px;">
              ${strings.sectionTitle}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">

            ${renderMessageHtml(p.customMessage)}

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background:#F6F8FB;border:1px solid #E2E8F0;
                          border-left:4px solid #1E63C4;border-radius:8px;
                          padding:0;margin-bottom:28px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;width:80px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelProg}
                      </td>
                      <td style="font-size:14px;color:#0E2F57;font-weight:700;padding-bottom:10px;">
                        ${p.trainingTitle}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;padding-bottom:10px;">
                        ${strings.labelVenue}
                      </td>
                      <td style="font-size:13px;color:#334155;padding-bottom:10px;">
                        ${p.venueName}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;
                                 letter-spacing:.6px;vertical-align:top;">
                        ${strings.labelDates}
                      </td>
                      <td style="font-size:13px;color:#334155;">
                        ${dateRange}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA buttons -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="margin-bottom:24px;">
              <tr>
                <td style="padding-right:8px;width:50%;">
                  <a href="${p.acceptUrl}"
                     style="display:block;text-align:center;background:#12B5AC;color:#ffffff;
                            text-decoration:none;font-size:14px;font-weight:700;
                            padding:13px 20px;border-radius:8px;letter-spacing:.2px;">
                    ${strings.acceptBtn}
                  </a>
                </td>
                <td style="padding-left:8px;width:50%;">
                  <a href="${p.declineUrl}"
                     style="display:block;text-align:center;background:#15233A;color:#ffffff;
                            text-decoration:none;font-size:14px;font-weight:700;
                            padding:13px 20px;border-radius:8px;letter-spacing:.2px;">
                    ${strings.declineBtn}
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#94A3B8;font-size:12px;margin:0;">
              ${strings.expiryNote}
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F6F8FB;padding:20px 32px;
                     border-top:1px solid #E2E8F0;text-align:center;">
            <p style="color:#94A3B8;font-size:11px;line-height:1.7;margin:0 0 4px;">
              ${strings.footerLine1}
            </p>
            <p style="color:#CBD5E1;font-size:10px;margin:0;">
              ${strings.footerLine2}
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}
