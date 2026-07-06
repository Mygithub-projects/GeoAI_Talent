// Shared merge-token substitution for the batch invite draft.
// Used client-side (EmailReviewModal "preview as" dropdown, real
// links not yet known) and server-side (invite send route, real
// tokens already generated) so preview and send stay in sync.
export interface MergeContext {
  trainer_name: string
  venue_name?:  string
  start_date?:  string
  end_date?:    string
  accept_url?:  string
  decline_url?: string
}

export function mergeTemplate(template: string, ctx: MergeContext): string {
  return template
    .replaceAll('{{trainer_name}}', ctx.trainer_name)
    .replaceAll('{{venue_name}}',  ctx.venue_name  ?? '')
    .replaceAll('{{start_date}}',  ctx.start_date  ?? '')
    .replaceAll('{{end_date}}',    ctx.end_date    ?? '')
    .replaceAll('{{accept_url}}',  ctx.accept_url  ?? '[personalized accept link]')
    .replaceAll('{{decline_url}}', ctx.decline_url ?? '[personalized decline link]')
}
