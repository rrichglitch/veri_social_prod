import { useState, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthProfile } from '../hooks/useAuthProfile';
import { getUnreadNotificationCount } from '../utils/spacetime';
import { useOrg } from '../contexts/OrgContext';
import { currentUserIdentityHex } from '../utils/authState';

export default function AuthActions({ profileReplacement, hideChat }: { profileReplacement?: ReactNode; hideChat?: boolean }) {
  const { isLoggedIn, profilePicture } = useAuthProfile();
  const { activeOrg } = useOrg();
  const navigate = useNavigate();
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Identity hex of whoever we act as: org account > oauth session > legacy OIDC sub
  const notifIdentity = activeOrg
    ? activeOrg.identity
    : (currentUserIdentityHex() || '');

  useEffect(() => {
    if (!isLoggedIn || !notifIdentity) return;
    const update = () => {
      setUnreadNotifs(getUnreadNotificationCount(notifIdentity));
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, notifIdentity]);

  if (!isLoggedIn) {
    // Single entry point — flow selection happens on the /login page
    return (
      <button onClick={() => navigate('/login')} className="topbar-signin">Sign In</button>
    );
  }

  return (
    <div className="auth-actions">
      {!hideChat && (
        <Link to="/friends" className="nav-icon-link" style={{position:'relative'}}>
          {activeOrg ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          )}
        </Link>
      )}
      <Link to="/notifications" className="nav-icon-link" style={{position:'relative'}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unreadNotifs > 0 && <span className="ticker">{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>}
      </Link>
      {profileReplacement ? profileReplacement : (
        <Link to="/me" className="nav-icon-link">
          {activeOrg ? (
            activeOrg.picture ? (
              <img src={activeOrg.picture} alt="Profile" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}} />
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M7 19c1-3 3-4 5-4s4 1 5 4"/></svg>
            )
          ) : profilePicture ? (
            <img src={profilePicture} alt="Profile" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}} />
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M20 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
          )}
        </Link>
      )}
      <style>{`
        .auth-actions { display: flex; align-items: center; gap: 16px; }
        .nav-icon-link { color: #555; transition: color 0.2s; display: flex; }
        .nav-icon-link:hover { color: #333; }
        .topbar-signin { padding: 6px 14px; background: #667eea; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .topbar-signin:hover { background: #5a6fd6; }
        .ticker { position: absolute; top: -6px; right: -10px; background: #ef4444; color: white; font-size: 10px; padding: 2px 5px; border-radius: 10px; min-width: 16px; text-align: center; line-height: 1; }
      `}</style>
    </div>
  );
}