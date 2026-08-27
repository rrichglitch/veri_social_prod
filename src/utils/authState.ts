// Session-agnostic auth state helpers (OAuth relay sessions only).
// The old SpacetimeCloud-OIDC flow has been removed; all sessions live in
// localStorage via oauthSession.ts.
import { getOAuthSession } from './oauthSession';

// Legacy no-op signature retained so existing call sites keep compiling.
export interface OidcLike {
  isAuthenticated: boolean;
  user?: { id_token?: string; access_token?: string } | null;
}

// Email of the signed-in user from the OAuth session.
export function currentUserEmail(_auth?: OidcLike): string | null {
  return getOAuthSession()?.email ?? null;
}

export function isSignedIn(_auth?: OidcLike): boolean {
  return Boolean(getOAuthSession());
}

// Identity hex of the signed-in user (used for notification tickers etc).
export function currentUserIdentityHex(): string | null {
  return getOAuthSession()?.identityHex ?? null;
}
