// Client-side field validation for the auth screens.
//
// Two deliberate properties:
//  1. The form-level validators return EVERY problem at once, so a user with
//     three mistakes sees three messages on one submit instead of discovering
//     them one at a time.
//  2. They return CODES, not copy — the page maps them through the i18n
//     `authErrors` namespace, so validation messages are localised like
//     everything else. This is also why the forms carry `noValidate`: the
//     browser's own validation bubbles appear in the BROWSER's language, not
//     the app's, which would break the single-active-language rule.

import { AUTH_ERROR, type AuthErrorCode } from './authErrorCodes'

export const MIN_PASSWORD_LENGTH = 8

// Deliberately permissive: catches the everyday typo (missing @, missing dot,
// stray space) without trying to out-guess the real address grammar. The
// server and the auth provider remain the authority.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function checkRequired(value: string, code: AuthErrorCode): AuthErrorCode | null {
  return value.trim() === '' ? code : null
}

export function checkEmail(value: string): AuthErrorCode | null {
  if (value.trim() === '') return AUTH_ERROR.EMAIL_REQUIRED
  return EMAIL_SHAPE.test(value.trim()) ? null : AUTH_ERROR.INVALID_EMAIL
}

export function checkPassword(value: string): AuthErrorCode | null {
  if (value === '') return AUTH_ERROR.PASSWORD_REQUIRED
  return value.length < MIN_PASSWORD_LENGTH ? AUTH_ERROR.WEAK_PASSWORD : null
}

export function checkMatch(value: string, other: string): AuthErrorCode | null {
  if (value === '') return AUTH_ERROR.CONFIRM_REQUIRED
  return value !== other ? AUTH_ERROR.PASSWORDS_NO_MATCH : null
}

// ── Form-level validators ────────────────────────────────────────────
// Each returns a partial map of field → code. An empty object means valid.
// Key order matches visual field order so "focus the first invalid field"
// is just the first key.

export type LoginField = 'email' | 'password'
export type RegisterField = 'fullName' | 'email' | 'password' | 'confirm' | 'district'
export type UpdatePasswordField = 'password' | 'confirm'
export type ResetPasswordField = 'email'

type Errors<F extends string> = Partial<Record<F, AuthErrorCode>>

const prune = <F extends string>(entries: [F, AuthErrorCode | null][]): Errors<F> => {
  const out: Errors<F> = {}
  for (const [field, code] of entries) if (code) out[field] = code
  return out
}

export function validateLogin(v: { email: string; password: string }): Errors<LoginField> {
  return prune<LoginField>([
    ['email', checkEmail(v.email)],
    // Length is NOT checked on sign-in: an existing account may predate the
    // current policy, and the real answer comes from the auth provider.
    ['password', checkRequired(v.password, AUTH_ERROR.PASSWORD_REQUIRED)],
  ])
}

export function validateRegister(v: {
  fullName: string
  email: string
  password: string
  confirm: string
  district: string
}): Errors<RegisterField> {
  return prune<RegisterField>([
    ['fullName', checkRequired(v.fullName, AUTH_ERROR.FULL_NAME_REQUIRED)],
    ['email',    checkEmail(v.email)],
    ['password', checkPassword(v.password)],
    ['confirm',  checkMatch(v.confirm, v.password)],
    ['district', checkRequired(v.district, AUTH_ERROR.DISTRICT_REQUIRED)],
  ])
}

export function validateUpdatePassword(v: {
  password: string
  confirm: string
}): Errors<UpdatePasswordField> {
  return prune<UpdatePasswordField>([
    ['password', checkPassword(v.password)],
    ['confirm',  checkMatch(v.confirm, v.password)],
  ])
}

export function validateResetPassword(v: { email: string }): Errors<ResetPasswordField> {
  return prune<ResetPasswordField>([['email', checkEmail(v.email)]])
}
