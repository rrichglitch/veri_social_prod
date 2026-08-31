import type { ReactNode } from 'react';
import { useEffect, useState, createContext, useContext } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { Identity } from 'spacetimedb';
import { getDbConnection } from './utils/spacetime';
import { ensureGateBoot, getGateBootSnapshot, isGateBootDone, setGateBootHasProfile, type GateBoot } from './utils/gateBoot';
import { hasCheckoutReturnMarker, clearCheckoutReturnMarker } from './utils/checkoutReturn';
import { getOAuthSession } from './utils/oauthSession';
import { OrgProvider } from './contexts/OrgContext';

import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import MainFeedPage from './pages/MainFeedPage';
import ProfilePage from './pages/ProfilePage';
import MyProfilePage from './pages/MyProfilePage';
import UpgradeProPage from './pages/UpgradeProPage';
import FollowPage from './pages/FollowPage';
import CallbackPage from './pages/CallbackPage';
import SearchPage from './pages/SearchPage';
import AboutPage from './pages/AboutPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import CreateOrgPage from './pages/CreateOrgPage';
import NotificationsPage from './pages/NotificationsPage';
import FriendsPage from './pages/FriendsPage';
import DMChatPage from './pages/DMChatPage';
import OrgChatPage from './pages/OrgChatPage';

interface AppContextType {
  identity: Identity | null;
  email: string | null;
  isLoading: boolean;
  hasProfile: boolean;
  setHasProfile: (has: boolean) => void;
}

const AppContext = createContext<AppContextType>({
  identity: null,
  email: null,
  isLoading: true,
  hasProfile: false,
  setHasProfile: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);

// ─── Session boot singleton ────────────────────────────────────────────────
// AuthGate mounts FRESH on every route change (each protected route wraps its
// own instance). The session boot (connect + profile check) must therefore
// run ONCE per SPA session; later mounts reuse it so navigation is instant —
// no loading shell, no reconnect, no RPC polling on every page change.
// The singleton itself lives in utils/gateBoot.ts (shared with the top-bar
// auth hook); this file only consumes it.

// Wraps signed-in-only subtrees. Holds children in a loading state only until
// the (once-per-session) boot resolves — after that, mounts are instant.
function AuthGate({ children }: { children: ReactNode }) {
  const pathname = window.location.pathname;
  const [boot, setBoot] = useState<GateBoot>(getGateBootSnapshot());
  const [ready, setReady] = useState(isGateBootDone());

  useEffect(() => {
    let alive = true;
    ensureGateBoot().then(() => {
      if (!alive) return;
      setBoot(getGateBootSnapshot());
      setReady(true);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setHasProfile = (has: boolean) => {
    setGateBootHasProfile(has);
    setBoot((b) => ({ ...b, hasProfile: has }));
  };

  // Cheap per-navigation routing — SYNC reads from the local table cache, no
  // RPC, no reconnect: pin disabled accounts to the enable flow, send
  // profile-less users to register.
  useEffect(() => {
    if (!ready || !boot.email) return;
    if (!boot.hasProfile) {
      if (!pathname.includes('/register')) {
        window.location.replace('/register');
      }
      return;
    }
    let meDisabled = false;
    try {
      // Own-row lookup via the primary-key index from the local cache.
      const myHex = boot.identityHex ? `0x${boot.identityHex.replace(/^0x/, '')}` : '';
      const me = myHex ? getDbConnection()?.db.user_profile.identity.find(Identity.fromString(myHex)) : null;
      meDisabled = !!(me && me.disabled);
    } catch {
      // cache not synced yet — treat as ordinary navigation
    }
    if (meDisabled && !pathname.includes('/me')) {
      window.location.replace('/me?enable_profile=1');
    }
  }, [ready, boot, pathname]);

  if (!getOAuthSession()) {
    return <Navigate to="/" replace />;
  }
  if (!ready) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <AppContext.Provider
      value={{
        identity: boot.identityHex ? ({ toHexString: () => boot.identityHex } as unknown as Identity) : null,
        email: boot.email,
        isLoading: false,
        hasProfile: boot.hasProfile,
        setHasProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

function RedirectHandler() {
  useEffect(() => {
    const redirectPath = sessionStorage.getItem('auth_redirect_path');
    if (redirectPath) {
      sessionStorage.removeItem('auth_redirect_path');
      window.location.replace(redirectPath);
    }
  }, []);
  return null;
}

function LandingPage() {
  return <AboutPage />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Clear the checkout-return marker once the user leaves the payment-flow pages
// (profile, org pages, upgrade page) — otherwise a later back press could
// over-jump the history. The flow pages keep it so the detour skip stays armed.
function CheckoutMarkerGuard() {
  const { pathname } = useLocation();
  useEffect(() => {
    const keep = pathname === '/me' || pathname === '/upgrade-pro' || pathname.startsWith('/org/');
    if (!keep && hasCheckoutReturnMarker()) clearCheckoutReturnMarker();
  }, [pathname]);
  return null;
}

// Tiny helper so ScrollToTop doesn't need react-router's useLocation inside
// the same tree as heavy siblings.
function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <CheckoutMarkerGuard />
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/profile/:identity" element={<ProfilePage />} />
      <Route path="/org/:id" element={<ProfilePage />} />
      <Route path="/org/create" element={<AuthGate><CreateOrgPage /></AuthGate>} />
      <Route path="/register" element={<AuthGate><RegisterPage /></AuthGate>} />
      <Route path="/home" element={<><RedirectHandler /><AuthGate><MainFeedPage /></AuthGate></>} />
      <Route path="/me" element={<AuthGate><MyProfilePage /></AuthGate>} />
      <Route path="/upgrade-pro" element={<AuthGate><UpgradeProPage /></AuthGate>} />
      <Route path="/follow/:ownerIdentity" element={<AuthGate><FollowPage /></AuthGate>} />
      <Route path="/notifications" element={<AuthGate><NotificationsPage /></AuthGate>} />
      <Route path="/friends" element={<AuthGate><FriendsPage /></AuthGate>} />
      <Route path="/messages/:identity" element={<AuthGate><DMChatPage /></AuthGate>} />
      <Route path="/org-chat/:id" element={<AuthGate><OrgChatPage /></AuthGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <OrgProvider>
        <AppRoutes />
      </OrgProvider>
    </BrowserRouter>
  );
}

export default App;
