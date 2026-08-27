// OAuth relay client: claim + session helpers.
import { getDbConnection } from './spacetime';

export interface OAuthClaimResult {
  success: boolean;
  already_owned: boolean;
  error?: string;
}

// Claims an existing profile by email. The procedure verifies the provider
// access token against Google/Facebook itself, then moves the profile (and all
// identity references) to the caller's identity.
export async function oauthClaimProfile(
  provider: 'google' | 'facebook',
  oauthToken: string,
  sub: string,
  email: string,
  identityHex: string
): Promise<OAuthClaimResult> {
  const db = getDbConnection();
  if (!db) throw new Error('Not connected to SpacetimeDB');
  const result = await db.procedures.oauthClaimProfile({
    provider,
    oauthToken,
    sub,
    email,
    identityHex,
  });
  return {
    success: Boolean(result.success),
    already_owned: Boolean(result.alreadyOwned),
    error: result.error ?? undefined,
  };
}