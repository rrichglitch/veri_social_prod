import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { currentUserEmail } from '../utils/authState';
import TopBar from '../components/TopBar';
import { getNotifications, resolveNotification, acceptFriendRequest, declineFriendRequest, getProfileByEmail } from '../utils/spacetime';
import AuthActions from '../components/AuthActions';
import { useOrg } from '../contexts/OrgContext';

function NotificationsPage() {
  const navigate = useNavigate();
  const { activeOrg } = useOrg();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);
  const identityRef = { current: null as string | null };

  useEffect(() => {
    if (activeOrg) {
      setCurrentIdentity(activeOrg.identity);
      identityRef.current = activeOrg.identity;
      return;
    }
    const email = currentUserEmail();
    if (!email) return;
    try {
      getProfileByEmail(email).then(p => {
        if (p) {
          const id = p.identity.toHexString();
          setCurrentIdentity(id);
          identityRef.current = id;
        }
      });
    } catch {}
  }, [activeOrg]);

  useEffect(() => {
    if (!currentIdentity) return;
    const update = () => setNotifs(getNotifications(currentIdentity));
    update();
    const interval = setInterval(update, 1500);
    return () => clearInterval(interval);
  }, [currentIdentity]);

  const handleResolve = async (id: bigint) => {
    setBusy(`resolve:${id}`);
    try {
      await resolveNotification(id);
      setNotifs(prev => prev.filter(n => n.id !== id));
    } catch (e: any) {
      alert(e?.message || 'Failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = async (refId: bigint) => {
    setBusy(`accept:${refId}`);
    try {
      await acceptFriendRequest(refId, activeOrg?.id);
      // Clear the original notification immediately
      setNotifs(prev => prev.filter(n => !(n.type === 'friend_request' && n.referenceId === refId)));
    } catch (e: any) {
      alert(e?.message || 'Failed to accept. Please try again.');
      setBusy(null);
    }
  };

  const handleDecline = async (refId: bigint) => {
    setBusy(`decline:${refId}`);
    try {
      await declineFriendRequest(refId, activeOrg?.id);
      // Clear the original notification immediately
      setNotifs(prev => prev.filter(n => !(n.type === 'friend_request' && n.referenceId === refId)));
    } catch (e: any) {
      alert(e?.message || 'Failed to decline. Please try again.');
      setBusy(null);
    }
  };

  const handleClearAll = async () => {
    setBusy('clearAll');
    const targets = notifs.filter(n => !n.resolved);
    try {
      for (const n of targets) {
        try { await resolveNotification(n.id); } catch {}
      }
      const ids = new Set(targets.map(n => n.id.toString()));
      setNotifs(prev => prev.filter(n => !ids.has(n.id.toString())));
    } finally {
      setBusy(null);
    }
  };

  const pendingNotifs = notifs.filter(n => !n.resolved);
  const resolvedNotifs = notifs.filter(n => n.resolved);

  return (
    <div className="notif-page">
      <TopBar left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>} center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>} right={<AuthActions />} absoluteCenter />
      <main className="main-content">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <h3 style={{margin:0}}>Notifications</h3>
          {pendingNotifs.length > 0 && (
            <button onClick={handleClearAll} disabled={busy !== null} className="notif-btn clear-btn">Clear All</button>
          )}
        </div>
        {pendingNotifs.length > 0 && (
          <div className="notif-section">
            {pendingNotifs.map(n => (
              <div key={n.id.toString()} className="notif-card pending">
                <div className="notif-body">
                  <span className="notif-type">{n.type.replace(/_/g, ' ')}</span>
                  <p className="notif-msg">{n.message}</p>
                  {n.fromName !== 'Someone' && <span className="notif-from">From: {n.fromName}</span>}
                </div>
                {n.type === 'friend_request' ? (
                  <div style={{display:'flex',gap:4,flexShrink:0}}>
                    <button onClick={() => handleAccept(n.referenceId)} disabled={busy !== null} className="notif-btn accept-btn">Accept</button>
                    <button onClick={() => handleDecline(n.referenceId)} disabled={busy !== null} className="notif-btn decline-btn">Decline</button>
                  </div>
                ) : (
                  <button onClick={() => handleResolve(n.id)} disabled={busy !== null} className="notif-btn accept-btn">✓</button>
                )}
              </div>
            ))}
          </div>
        )}
        {resolvedNotifs.length > 0 && (
          <div className="notif-section">
            <h3>Resolved</h3>
            {resolvedNotifs.map(n => (
              <div key={n.id.toString()} className="notif-card resolved">
                <div className="notif-body">
                  <span className="notif-type">{n.type.replace(/_/g, ' ')}</span>
                  <p className="notif-msg">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {notifs.length === 0 && <p className="empty">No notifications yet</p>}
      </main>

      <style>{`
        .notif-page { min-height: 100vh; background: #f5f5f5; }
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .notif-section { margin-bottom: 24px; }
        .notif-section h3 { margin: 0 0 12px; color: #333; font-size: 16px; }
        .notif-card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .notif-card.pending { border-left: 3px solid #667eea; }
        .notif-card.resolved { opacity: 0.6; }
        .notif-type { font-size: 11px; text-transform: uppercase; color: #667eea; font-weight: 600; }
        .notif-msg { margin: 4px 0; color: #333; font-size: 14px; }
        .notif-btn { padding: 6px 14px; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; position: relative; z-index: 1; transition: filter 0.1s, transform 0.05s; }
        .notif-btn.accept-btn { background: #22c55e; }
        .notif-btn.decline-btn { background: #dc2626; }
        .notif-btn.clear-btn { background: #ef4444; border-radius: 6px; font-size: 13px; }
        .notif-btn:active { filter: brightness(0.8); transform: scale(0.97); }
        .notif-btn:disabled { filter: brightness(0.75) saturate(0.7); cursor: default; transform: none; }
        .notif-from { font-size: 12px; color: #999; }
        .empty { text-align: center; padding: 48px; color: #999; }
      `}</style>
    </div>
  );
}

export default NotificationsPage;
