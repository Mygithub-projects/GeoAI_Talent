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
