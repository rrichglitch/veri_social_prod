import type { ReactNode } from 'react';
import { useEffect, useState, createContext, useContext } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import type { Identity } from 'spacetimedb';
import { connectToSpacetimeDB, checkProfileExistsByEmail, disconnectFromSpacetimeDB } from './utils/spacetime';
import { getOAuthSession, clearOAuthSession } from './utils/oauthSession';
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
import OrgProfilePage from './pages/OrgProfilePage';
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

// Wraps signed-in-only subtrees. Resolves the OAuth session ONCE and holds
// children in a loading state until the SpacetimeDB connection is ready —
// so pages never render "logged out" and then snap to logged-in.
function AuthGate({ children }: { children: ReactNode }) {
  const location = window.location.pathname;
  const [isLoading, setIsLoading] = useState(true);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [hasProfile, setHasProfileState] = useState(false);

  const setHasProfile = (has: boolean) => {
    setHasProfileState(has);
  };

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      const oauthSession = getOAuthSession();
      if (!oauthSession) {
        setIsLoading(false);
        return;
      }

      console.log('Authenticated via OAuth relay:', oauthSession.provider);
      setIdentity({ toHexString: () => oauthSession.identityHex } as unknown as Identity);
      setEmail(oauthSession.email);

      try {
        await connectToSpacetimeDB(oauthSession.email, oauthSession.stToken);

        let profileExists = false;
        for (let i = 0; i < 30; i++) {
          if (cancelled) return;
          profileExists = await checkProfileExistsByEmail(oauthSession.email);
          if (profileExists) break;
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log('Profile exists in DB:', profileExists);
        setHasProfileState(profileExists);

        if (!profileExists && !location.includes('/register')) {
          console.log('No profile found, redirecting to register');
          setIsLoading(false);
          window.location.replace('/register');
          return;
        }
      } catch (e) {
        console.error('Error connecting to SpacetimeDB:', e);
        // Session token is stale/invalid — drop it and go to the landing page
        clearOAuthSession();
        disconnectFromSpacetimeDB();
        setIsLoading(false);
        window.location.replace('/');
        return;
      }

      if (!cancelled) setIsLoading(false);
    };

    initAuth();
    return () => { cancelled = true; };
  }, [location]);

  // Hold the whole subtree in the loading shell until session + profile state
  // are resolved. This is what eliminates the logged-out → logged-in flash.
  if (isLoading || getOAuthSession()) {
    if (isLoading) {
      return <div className="loading">Loading...</div>;
    }
  }

  if (!getOAuthSession()) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppContext.Provider value={{ identity, email, isLoading: false, hasProfile, setHasProfile }}>
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

// Tiny helper so ScrollToTop doesn't need react-router's useLocation inside
// the same tree as heavy siblings.
function AppRoutes() {
  return (
    <>
      <ScrollToTop />
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/profile/:identity" element={<ProfilePage />} />
      <Route path="/org/:id" element={<OrgProfilePage />} />
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
