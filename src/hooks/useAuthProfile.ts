import { useState, useEffect } from 'react';
import { connectToSpacetimeDB, getProfileByEmail } from '../utils/spacetime';
import { getOAuthSession, clearOAuthSession } from '../utils/oauthSession';

// Tracks the signed-in user's profile for top-bar UI (login state + avatar).
export function useAuthProfile() {
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      const oauthSession = getOAuthSession();
      if (!oauthSession) {
        setIsLoggedIn(false);
        return;
      }
      try {
        await connectToSpacetimeDB(oauthSession.email, oauthSession.stToken);
        for (let i = 0; i < 10; i++) {
          if (cancelled) return;
          const profile = await getProfileByEmail(oauthSession.email);
          if (profile) {
            setProfilePicture(profile.profilePicture);
            setIsLoggedIn(true);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (e) {
        console.error('OAuth session connect failed:', e);
        clearOAuthSession();
      }
      if (!cancelled) setIsLoggedIn(false);
    };

    initAuth();
    return () => { cancelled = true; };
  }, []);

  return { isLoggedIn, profilePicture };
}
