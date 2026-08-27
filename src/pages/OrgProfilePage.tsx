import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { currentUserEmail } from '../utils/authState';
import { getOAuthSession } from '../utils/oauthSession';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import { useOrg } from '../contexts/OrgContext';
import { getOrganizationById, getOrganizationMembers, sendOrgMemberRequest, connectToSpacetimeDB, getProfileByEmail, promoteToCoLeader, demoteCoLeader, transferLeadership } from '../utils/spacetime';

function OrgProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loginAsOrg, activeOrg, logoutOrg } = useOrg();

  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);

  const orgId = id ? BigInt(id) : 0n;

  useEffect(() => {
    connectToSpacetimeDB('', getOAuthSession()?.stToken).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    const userEmail = currentUserEmail();
    const token = getOAuthSession()?.stToken;
    if (!token || !userEmail) return;

    const load = async () => {
      await connectToSpacetimeDB(userEmail, token);
      const orgData = getOrganizationById(orgId);
      if (orgData) {
        setOrg(orgData);
        setMembers(getOrganizationMembers(orgId));
      }
      // Resolve my actual identity from my profile
      const profile = await getProfileByEmail(userEmail!).catch(() => null);
      if (profile) {
        setCurrentIdentity(profile.identity.toHexString());
      }
      setIsLoading(false);
    };
    load();
  }, [id]);

  const handleJoinRequest = async () => {
    if (!orgId) return;
    try {
      await sendOrgMemberRequest(orgId);
      setRequestStatus('pending');
    } catch (e: any) {
      alert(e.message || 'Failed to send request');
    }
  };

  const handleSwitchToOrg = () => {
    if (org) {
      loginAsOrg(org);
      navigate('/me', { replace: true });
    }
  };

  if (isLoading) {
    return (
      <div className="loading-page"><div className="spinner"></div><p>Loading...</p>
        <style>{`.loading-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
          .spinner{width:40px;height:40px;border:4px solid #e0e0e0;border-top-color:#667eea;border-radius:50%;animation:spin 1s linear infinite}
          @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="org-page">
        <TopBar left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>} center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri" /></Link>} right={<AuthActions />} absoluteCenter />
        <main className="main-content"><p>Organization not found</p></main>
      </div>
    );
  }

  const isMember = members.some(m => m.identity === currentIdentity);
  const isOwnOrg = activeOrg !== null && activeOrg.id === orgId;
  const viewerRole = members.find(m => m.identity === currentIdentity)?.role || null;
  const viewerCanManage = viewerRole === 'leader' || viewerRole === 'co_leader';

  const handleRoleChange = async (m: any, newRole: string) => {
    if (newRole === m.role) return;
    try {
      if (newRole === 'leader') {
        const ok = window.confirm(`Transfer leadership to ${m.fullName}? You will be instantly demoted to co-leader.`);
        if (!ok) return;
        await transferLeadership(orgId, m.identity);
      } else if (newRole === 'co_leader') {
        await promoteToCoLeader(orgId, m.identity);
      } else if (newRole === 'member' && m.role === 'co_leader') {
        await demoteCoLeader(orgId, m.identity);
      }
    } catch (e: any) {
      alert(e.message || 'Failed');
    }
  };

  return (
    <div className="org-page">
      <TopBar left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>} center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri" /></Link>} right={isOwnOrg ? <AuthActions profileReplacement={<button onClick={() => { logoutOrg(); navigate('/me', { replace: true }); }} className="topbar-signin" style={{background:"#dc2626"}}>Back to my account</button>} /> : <AuthActions />} />
      <main className="main-content">
        <div className="org-header">
          <div className="org-picture-container">
            {org.picture ? <img src={org.picture} alt={org.name} className="org-picture" /> : <div className="org-picture-placeholder" />}
          </div>
          <h2 className="org-name">{org.name}</h2>
          {org.city && <p className="org-city">{org.city}</p>}
          {org.description && <p className="org-description">{org.description}</p>}
          <div className="org-actions">
            {isOwnOrg ? (
              <span className="active-badge">Using this account</span>
            ) : isMember && !activeOrg ? (
              <>
                <button onClick={handleSwitchToOrg} className="switch-org-btn">Use as {org.name}</button>
              </>
            ) : isMember && activeOrg ? (
              <span className="profile-note">Members can chat in this organization</span>
            ) : activeOrg ? (
              <span className="profile-note">Organizations cannot join other organizations</span>
            ) : (
              <button onClick={handleJoinRequest} disabled={requestStatus === 'pending'} className="join-org-btn">
                {requestStatus === 'pending' ? 'Request Pending' : 'Request to Join'}
              </button>
            )}
          </div>
        </div>

        {!org.hideMembers && (
        <div className="members-section">
          <h3>Members ({members.length})</h3>
          <div className="members-list">
            {members.map(m => (
              <div key={m.identity} className="member-row">
                <Link to={`/profile/${m.identity}`} className="member-link">
                  {m.picture ? <img src={m.picture} alt={m.fullName} className="member-avatar" /> : <div className="member-avatar-placeholder" />}
                  <div className="member-info">
                    <span className="member-name">{m.fullName}</span>
                    {m.city && <span className="member-city">{m.city}</span>}
                  </div>
                </Link>
                {m.role === 'leader' ? (
                  <span className={`role-badge role-leader`}>Leader</span>
                ) : viewerCanManage ? (
                  <select
                    value={m.role}
                    onChange={e => handleRoleChange(m, e.target.value)}
                    className="role-select"
                  >
                    <option value="member">Member</option>
                    <option value="co_leader">Co-Leader</option>
                    {viewerRole === 'leader' && <option value="leader">Leader</option>}
                  </select>
                ) : (
                  <span className={`role-badge role-${m.role}`}>{m.role}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        )}
      </main>

      <style>{`
        .org-page { min-height: 100vh; background: #f5f5f5; }
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .org-header { background: white; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .org-picture { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; }
        .org-picture-placeholder { width: 120px; height: 120px; border-radius: 50%; background: #e0e0e0; margin: 0 auto; }
        .org-name { margin: 12px 0 4px; font-size: 24px; color: #333; }
        .org-city { color: #666; font-size: 14px; margin: 0 0 8px; }
        .org-description { color: #444; font-size: 14px; line-height: 1.5; }
        .org-actions { margin-top: 16px; display: flex; gap: 8px; justify-content: center; align-items: center; }
        .join-org-btn { padding: 10px 24px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .join-org-btn:disabled { background: #ccc; }
        .switch-org-btn { padding: 10px 24px; background: #22c55e; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .active-badge { padding: 4px 12px; background: #dcfce7; color: #166534; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .members-section { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .members-section h3 { margin: 0 0 16px; color: #333; }
        .member-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .member-link { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #333; }
        .member-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
        .member-avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: #e0e0e0; }
        .member-name { font-weight: 500; }
        .role-badge { padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
        .role-leader { background: #fef3c7; color: #92400e; }
        .role-co_leader { background: #dbeafe; color: #1e40af; }
        .role-member { background: #f3f4f6; color: #374151; }
        .role-select { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-weight: 600; background: white; color: #374151; cursor: pointer; flex-shrink: 0; }
        .back-to-account-btn { padding: 6px 14px; background: #dc2626; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .profile-note { font-size: 13px; color: #666; }
      `}</style>
    </div>
  );
}

export default OrgProfilePage;
