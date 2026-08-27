// OAuth session management (Google/Facebook via the relay).
// The session holds the SpacetimeDB identity token handed back from the relay
// plus provider metadata needed for account claiming and registration.

export interface OAuthSession {
  stToken: string;
  provider: 'google' | 'facebook';
  sub: string;
  email: string;
  name: string;
  picture: string;
  oauthToken: string; // short-lived provider access token, consumed by oauthClaimProfile
  identityHex: string;
}

const KEY = 'veri_oauth_session';

export function getOAuthSession(): OAuthSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OAuthSession;
    if (!s.stToken || !s.provider || !s.email) return null;
    return s;
  } catch {
    return null;
  }
}

export function setOAuthSession(session: OAuthSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearOAuthSession() {
  localStorage.removeItem(KEY);
}