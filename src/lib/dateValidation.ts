export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validateInviteDateRange(startDate?: string | null, endDate?: string | null) {
  const today = getTodayDateString()

  if (!startDate || !endDate) {
    return { ok: false, error: 'Please choose workshop dates before inviting trainers.' }
  }

  if (startDate < today || endDate < today) {
    return {
      ok: false,
      error: 'Workshop dates must be today or later before invitations can be sent.',
    }
  }

  return { ok: true }
}
