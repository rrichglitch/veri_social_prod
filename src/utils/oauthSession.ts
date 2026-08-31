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
  oauthToken?: string; // NEVER persisted — provider access token is in-memory only (8/31)
  identityHex: string;
}

const KEY = 'veri_oauth_session';

export function getOAuthSession(): OAuthSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OAuthSession;
    if (!s.stToken || !s.provider || !s.email) return null;
    // Defense in depth: never hand a persisted provider token back.
    delete s.oauthToken;
    return s;
  } catch {
    return null;
  }
}

export function setOAuthSession(session: OAuthSession) {
  // The provider access token is a live credential — it must never touch
  // localStorage (XSS/extension/device-leak surface). It lives only in the
  // callback flow's memory for the oauthClaimProfile call.
  const { oauthToken: _omit, ...persisted } = session;
  localStorage.setItem(KEY, JSON.stringify(persisted));
}

// Full logout: clears the oauth session AND every other veri_* key
// (org-acting context, pending-registration PII) so shared devices don't
// leak the previous user's state (8/31 security round).
export function clearOAuthSession() {
  localStorage.removeItem(KEY);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('veri_')) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable — best effort */
  }
}