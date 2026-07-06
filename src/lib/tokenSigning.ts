import { createHmac, randomBytes, createHash } from 'crypto'

function secret(): string {
  const s = process.env.TOKEN_SIGNING_SECRET
  if (!s) throw new Error('TOKEN_SIGNING_SECRET env var is not set')
  return s
}

/**
 * Generate a signed invitation token:
 * format = base64url(32 random bytes) + '.' + HMAC-SHA256 signature
 * The raw token travels in the URL; store only the hash in the DB.
 */
export function generateSignedToken(): string {
  const raw = randomBytes(32).toString('base64url')
  const sig = createHmac('sha256', secret()).update(raw).digest('base64url')
  return `${raw}.${sig}`
}

/** Verify the HMAC signature without a DB round-trip. */
export function verifySignedToken(token: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return false
  const raw = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret()).update(raw).digest('base64url')
  return sig === expected
}

/** SHA-256 digest of the full signed token — stored in invitation_tokens.token_hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
