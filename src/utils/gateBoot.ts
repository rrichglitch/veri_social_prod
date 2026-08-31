import { connectToSpacetimeDB, checkProfileExistsByEmail, disconnectFromSpacetimeDB } from './spacetime';
import { getOAuthSession, clearOAuthSession } from './oauthSession';

// ─── Session boot singleton ────────────────────────────────────────────────
// The connect + profile-check sequence runs ONCE per SPA session. AuthGate
// mounts on every route change and useAuthProfile mounts on every TopBar
// render — both read this resolved state synchronously so navigation and
// top-bar auth never re-boot, never re-connect, never flash "Sign In".
export interface GateBoot {
  email: string | null;
  identityHex: string | null;
  hasProfile: boolean;
}

const emptyBoot: GateBoot = { email: null, identityHex: null, hasProfile: false };

let gateBoot: GateBoot = { ...emptyBoot };
let gateBootPromise: Promise<void> | null = null;
let gateBootDone = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function getGateBootSnapshot(): GateBoot {
  return gateBoot;
}

export function isGateBootDone(): boolean {
  return gateBootDone;
}

export function setGateBootHasProfile(has: boolean) {
  gateBoot.hasProfile = has;
  notify();
}

export function onGateBootChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function ensureGateBoot(): Promise<void> {
  if (gateBootPromise) return gateBootPromise;
  gateBootPromise = (async () => {
    const oauthSession = getOAuthSession();
    if (!oauthSession) {
      gateBoot = { ...emptyBoot };
      gateBootDone = true;
      notify();
      return;
    }
    gateBoot.email = oauthSession.email;
    gateBoot.identityHex = oauthSession.identityHex;
    gateBootDone = false;
    notify();
    try {
      // Retry the connection: a single transient failure (cold-boot right
      // after a redirect, WS hiccup) must NOT log the user out.
      let connected = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await connectToSpacetimeDB(oauthSession.email, oauthSession.stToken);
          connected = true;
          break;
        } catch (e) {
          if (attempt === 3) throw e;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
      if (!connected) throw new Error('connect failed');

      let profileExists = false;
      for (let i = 0; i < 30; i++) {
        profileExists = await checkProfileExistsByEmail(oauthSession.email);
        if (profileExists) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      gateBoot.hasProfile = profileExists;
    } catch (e) {
      console.error('Error connecting to SpacetimeDB:', e);
      // Session token is stale/invalid — drop it and go to the landing page
      clearOAuthSession();
      disconnectFromSpacetimeDB();
      gateBoot = { ...emptyBoot };
    } finally {
      gateBootDone = true;
      notify();
    }
  })();
  return gateBootPromise;
}