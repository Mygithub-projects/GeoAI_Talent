// Result shape for the admin user-management SERVER ACTIONS.
//
// Server actions must not throw for expected failures: Next.js replaces any
// uncaught error in a production build with the generic "An error occurred in
// the Server Components render… digest" placeholder, so the real reason never
// reaches the admin. Return one of these instead and the modal can show a
// localised message.
//
// Same convention as the /api/auth/* routes (see authErrorCodes.ts): the
// server sends a stable CODE, the client maps it through the i18n
// `authErrors` namespace. Never send UI copy from the server.
//
// This lives outside actions.ts on purpose — a 'use server' module may only
// export async functions, so a type declared there cannot be imported by the
// client components that consume it.

import type { AuthErrorCode } from './authErrorCodes'

export type AdminActionResult =
  /** `emailDelivered: false` means the account exists but nothing was sent
   *  (console fallback or a transport failure) — the admin needs telling. */
  | { ok: true;  emailDelivered?: boolean }
  | { ok: false; code: AuthErrorCode }
