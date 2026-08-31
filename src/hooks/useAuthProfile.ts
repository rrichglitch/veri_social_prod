import { useState, useEffect } from 'react';
import { getOAuthSession } from '../utils/oauthSession';
import { getProfileRowByEmail } from '../utils/spacetime';
import { ensureGateBoot, getGateBootSnapshot, isGateBootDone, onGateBootChange } from '../utils/gateBoot';

// Tracks the signed-in user's profile for top-bar UI (login state + avatar).
//
// Reads the once-per-session boot singleton (utils/gateBoot.ts) instead of
// running its own connect + RPC on every mount: when the boot has already
// resolved, the very first render already shows the logged-in icons — no
// "Sign In" flash on page navigation. The avatar comes from the synced local
// subscription cache, so no `getProfileByEmail` RPC happens here at all.
export function useAuthProfile() {
  const noSession = !getOAuthSession();
  const [booted, setBooted] = useState(() => (noSession ? true : isGateBootDone()));
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (noSession) return false;
    if (!isGateBootDone()) return false;
    const b = getGateBootSnapshot();
    return !!(b.email && b.hasProfile);
  });
  const [profilePicture, setProfilePicture] = useState(() => {
    if (noSession || !isGateBootDone()) return '';
    const b = getGateBootSnapshot();
    if (!b.email || !b.hasProfile) return '';
    try {
      const row = getProfileRowByEmail(b.email);
      return (row?.profilePictureSmall || row?.profilePicture) ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (booted) return undefined;

    let alive = true;
    const refresh = () => {
      if (!alive) return;
      setBooted(isGateBootDone());
      const b = getGateBootSnapshot();
      setIsLoggedIn(!!(b.email && b.hasProfile));
      if (b.email && b.hasProfile) {
        try {
          const row = getProfileRowByEmail(b.email);
          if (row) setProfilePicture((row.profilePictureSmall || row.profilePicture) ?? '');
        } catch {
          // cache not synced yet — keep placeholder avatar
        }
      } else {
        setProfilePicture('');
      }
    };

    // Boot may already be in flight (started by AuthGate); just wait for it.
    ensureGateBoot().then(refresh);
    const off = onGateBootChange(refresh);

    // The local subscription cache can land after the boot resolves; pick up
    // the avatar once it does.
    const t = setTimeout(refresh, 1000);

    return () => {
      alive = false;
      off();
      clearTimeout(t);
    };
  }, [booted]);

  return { isLoggedIn, profilePicture, booted };
}