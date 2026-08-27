import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg, type ActiveOrg } from '../contexts/OrgContext';
import { currentUserEmail } from '../utils/authState';
import { getOAuthSession } from '../utils/oauthSession';
import { QRCodeSVG } from 'qrcode.react';
import { getProfileByEmail, getMyStoryPosts, getMyPosts, getOrganizationMembers, getOrganizationById, promoteToCoLeader, demoteCoLeader, transferLeadership, connectToSpacetimeDB, updateOrganization, updateOrgLocation, jitterOrgToApprox } from '../utils/spacetime';
import { getBrowserLocation, jitterLocation, reverseGeocode } from '../utils/geo';
import PreciseLocationToggle from './PreciseLocationToggle';
import ProfileDetails from './ProfileDetails';
import ProfileTabs from './ProfileTabs';
import HideToggle from './HideToggle';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';

function OrgAccountView() {
  const navigate = useNavigate();
  const { activeOrg, logoutOrg } = useOrg();
  const org = activeOrg as ActiveOrg;

  const [members, setMembers] = useState<any[]>([]);
  const [orgData, setOrgData] = useState<any>(org || null);
  const [orgPrecision, setOrgPrecision] = useState<'off' | 'approx' | 'exact'>('off');
  const [hideMembers, setHideMembers] = useState(false);
  const [isUpdatingHide, setIsUpdatingHide] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'story' | 'posts' | 'members'>('story');
  const [createdAt, setCreatedAt] = useState<Date | null>(null);
  const [showQR, setShowQR] = useState(false);

  const refreshOrg = async () => {
    if (!org) return;
    setMembers(getOrganizationMembers(org.id));
    setStories(await getMyStoryPosts(org.identity));
    setMyPosts(await getMyPosts(org.identity));
    const orgRow = getOrganizationById(org.id);
    if (orgRow) {
      setOrgData({ ...orgRow } as any);
      setCreatedAt(new Date(Number((orgRow as any).createdAt?.microsSinceUnixEpoch || 0) / 1000));
      setOrgPrecision((orgRow.locationPrecision as 'off' | 'approx' | 'exact') || 'off');
      setHideMembers(!!orgRow.hideMembers);
    }
    // Re-resolve my role each refresh (the member subscription may lag on first load)
    try {
      const userEmail = currentUserEmail();
      if (userEmail) {
        const profile = await getProfileByEmail(userEmail);
        if (profile) {
          const myHex = profile.identity.toHexString();
          const mine = getOrganizationMembers(org.id).find((m: any) => m.identity === myHex);
          setMyRole(mine ? mine.role : null);
        }
      }
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    if (!org) return;
    const userEmail = currentUserEmail();
    if (!userEmail) return;
    const load = async () => {
      await connectToSpacetimeDB(userEmail, getOAuthSession()?.stToken).catch(() => {});
      refreshOrg();
      const interval = setInterval(refreshOrg, 3000);
      return () => clearInterval(interval);
    };
    load();
  }, [org?.id]);

  if (!org) return null;

  const handlePromote = async (memberIdentity: string) => {
    try { await promoteToCoLeader(org.id, memberIdentity); } catch (e: any) { alert(e.message || 'Failed'); }
  };
  const handleDemote = async (memberIdentity: string) => {
    try { await demoteCoLeader(org.id, memberIdentity); } catch (e: any) { alert(e.message || 'Failed'); }
  };
  const handleTransfer = async (memberIdentity: string, memberName: string) => {
    const ok = window.confirm(`Transfer leadership to ${memberName}? You will be instantly demoted to co-leader.`);
    if (!ok) return;
    try { await transferLeadership(org.id, memberIdentity); } catch (e: any) { alert(e.message || 'Failed'); }
  };

  const handleRoleChange = async (m: any, newRole: string) => {
    if (newRole === m.role) return;
    if (newRole === 'leader') {
      await handleTransfer(m.identity, m.fullName);
      return;
    }
    if (newRole === 'co_leader') {
      await handlePromote(m.identity);
      return;
    }
    if (newRole === 'member' && m.role === 'co_leader') {
      await handleDemote(m.identity);
    }
  };

  const canManage = myRole === 'leader' || myRole === 'co_leader';

  const handleHideMembersToggle = async (checked: boolean) => {
    setIsUpdatingHide(true);
    try {
      await updateOrganization(org.id, undefined, undefined, undefined, undefined, undefined, checked);
      setHideMembers(checked);
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    } finally {
      setIsUpdatingHide(false);
    }
  };

  const handleOrgToggleEnable = async () => {
    // Toggle ON: fetch a fresh precise location for the org
    const pos = await getBrowserLocation();
    await updateOrgLocation(org.id, pos.lat, pos.lng, 'exact');
    setOrgPrecision('exact');
  };

  const handleOrgToggleDisable = async () => {
    // Toggle OFF: backend jitters the last stored precise org location
    await jitterOrgToApprox(org.id);
    setOrgPrecision('approx');
  };

  const handleRefreshLocation = async () => {
    // Same as the individual profile: fetch a fresh accurate fix, derive the city,
    // and store the coords at the current precision (exact when Precise Location is on).
    try {
      const pos = await getBrowserLocation();
      const city = await reverseGeocode(pos.lat, pos.lng);
      if (city) {
        await updateOrganization(org.id, undefined, city, undefined);
      }
      const isExact = orgPrecision === 'exact';
      const toSend = isExact ? pos : jitterLocation(pos.lat, pos.lng, 5);
      await updateOrgLocation(org.id, toSend.lat, toSend.lng, isExact ? 'exact' : 'approx');
      setOrgPrecision(isExact ? 'exact' : 'approx');
      await refreshOrg();
    } catch (e: any) {
      alert(e?.message === 'Geolocation not supported on this device'
        ? 'This device does not support location services.'
        : 'Could not get your location. Check that location permissions are enabled for this site.');
    }
  };

  return (
    <div className="my-profile-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
        center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        absoluteCenter
        right={<AuthActions profileReplacement={<button onClick={() => { logoutOrg(); navigate('/me', { replace: true }); }} className="topbar-signin" style={{background:"#dc2626"}}>Back to my account</button>} />}
      />
      <main className="main-content">
        <div className="profile-section">
          <ProfileDetails
            picture={orgData?.picture || org.picture || ''}
            name={orgData?.name || org.name}
            city={orgData?.city || org.city || ''}
            description={orgData?.description || ''}
            onUpdateLocation={handleRefreshLocation}
            isLocationUpdating={false}
            showLocationUpdate={canManage}
            onSaveDescription={async (v) => {
              await updateOrganization(org.id, undefined, undefined, v);
              await refreshOrg();
            }}
            gender={orgData?.gender}
            onSaveAgeGender={async (_b, g) => {
              await updateOrganization(org.id, undefined, undefined, undefined, undefined, undefined, undefined, g);
              await refreshOrg();
            }}
            pictureExtra={<button onClick={() => setShowQR(true)} className="share-btn-under-pic">Share</button>}
          >
            <p className="join-date">
              {createdAt ? `Joined ${createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}
            </p>
          </ProfileDetails>
        </div>

        {canManage && (
          <PreciseLocationToggle
            isExact={orgPrecision === 'exact'}
            onEnable={handleOrgToggleEnable}
            onDisable={handleOrgToggleDisable}
          />
        )}

        {showQR && (
          <div className="qr-modal" onClick={() => setShowQR(false)}>
            <div className="qr-content" onClick={(e) => e.stopPropagation()}>
              <h3>Scan to Follow</h3>
              <div className="qr-code">
                <QRCodeSVG value={`${window.location.origin}/org/${org.id}`} size={200} />
              </div>
              <p className="qr-instruction">
                Anyone can scan this code to quickly follow this organization.
              </p>
              <button onClick={() => setShowQR(false)} className="close-button">
                Close
              </button>
            </div>
          </div>
        )}

        <div className="story-section">
          <ProfileTabs
            tabs={[
              { key: 'story', label: 'Story' },
              { key: 'posts', label: 'Posts' },
              { key: 'members', label: 'Members' },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as any)}
          />

          {activeTab === 'members' ? (
            <div className="members-tab">
              <div className="members-tab-card">
                {members.length === 0 ? (
                  <div className="empty-story">
                    <p>No members yet.</p>
                  </div>
                ) : (
                  <div className="members-list">
                    {members.map((m: any) => (
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
                        ) : (
                          <select
                            value={m.role}
                            onChange={e => handleRoleChange(m, e.target.value)}
                            disabled={!canManage}
                            className="role-select"
                          >
                            <option value="member">Member</option>
                            <option value="co_leader">Co-Leader</option>
                            {myRole === 'leader' && <option value="leader">Leader</option>}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {canManage && (
                <HideToggle
                  label="Hide your members"
                  checked={hideMembers}
                  onChange={handleHideMembersToggle}
                  busy={isUpdatingHide}
                />
              )}
            </div>
          ) : activeTab === 'story' ? (
            <>
              <div className="no-post-own-story">
                <p>You cannot post on your own story. Others can share stories about you.</p>
              </div>
              {stories.length === 0 ? (
                <div className="empty-story"><p>No stories about you yet.</p></div>
              ) : (
                <div className="stories-list">
                  {stories.map((story: any) => (
                    <div key={story.id.toString()} className="story-card">
                      <Link to={`/profile/${story.posterIdentity}`} className="story-header-link">
                        <div className="story-header">
                          {story.posterPicture ? (
                            <img src={story.posterPicture} alt={story.posterName} className="story-avatar" />
                          ) : (
                            <div className="story-avatar-placeholder" />
                          )}
                          <div className="story-meta">
                            <span className="story-author">{story.posterName}</span>
                            <span className="story-date">{new Date(story.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </Link>
                      <p className="story-content">{story.content}</p>
                      {story.mediaData && story.mediaData.length > 0 && (
                        <img src={story.mediaData} alt="Story media" className="story-media" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {myPosts.length === 0 ? (
                <div className="empty-story"><p>This organization hasn't posted on anyone's story yet.</p></div>
              ) : (
                <div className="stories-list">
                  {myPosts.map((post: any) => (
                    <div key={post.id.toString()} className="story-card">
                      <Link to={`/profile/${post.profileOwnerIdentity}`} className="post-receiver-link">
                        <div className="post-receiver-header">
                          <div className="post-receiver-meta">
                            <span className="post-receiver-name">{post.profileOwnerName}</span>
                            <span className="post-receiver-date">{new Date(post.createdAt).toLocaleDateString()}</span>
                          </div>
                          {post.profileOwnerPicture ? (
                            <img src={post.profileOwnerPicture} alt={post.profileOwnerName} className="story-avatar" />
                          ) : (
                            <div className="story-avatar-placeholder" />
                          )}
                        </div>
                      </Link>
                      <p className="story-content">{post.content}</p>
                      {post.mediaData && post.mediaData.length > 0 && (
                        <img src={post.mediaData} alt="Story media" className="story-media" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <style>{`
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .profile-section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .join-date { margin: 8px 0 0; font-size: 13px; color: #999; }
        .members-tab-card { background: white; border-radius: 12px; padding: 8px 20px; margin-top: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .qr-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
        .qr-content { background: white; border-radius: 12px; padding: 24px; max-width: 340px; width: 100%; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .qr-content h3 { margin: 0 0 16px; color: #333; font-size: 17px; }
        .qr-code { display: flex; justify-content: center; margin-bottom: 16px; }
        .qr-instruction { margin: 0 0 16px; color: #666; font-size: 13px; }
        .close-button { padding: 8px 20px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .members-section h3 { margin: 0 0 12px; color: #333; font-size: 15px; }
        .member-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .member-row:last-child { border-bottom: none; }
        .member-link { display: flex; align-items: center; gap: 12px; text-decoration: none; color: #333; flex: 1; min-width: 0; }
        .member-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .member-avatar-placeholder { width: 44px; height: 44px; border-radius: 50%; background: #e0e0e0; flex-shrink: 0; }
        .member-info { display: flex; flex-direction: column; min-width: 0; }
        .member-name { font-size: 15px; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .member-city { font-size: 12px; color: #999; }
        .role-badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .role-leader { background: #fef3c7; color: #92400e; }
        .role-co_leader { background: #dbeafe; color: #1e40af; }
        .role-member { background: #f3f4f6; color: #374151; }
        .role-select { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-weight: 600; background: white; color: #374151; cursor: pointer; flex-shrink: 0; }
        .role-select:disabled { background: #f3f4f6; color: #9ca3af; cursor: default; }
        .story-section h2 { font-size: 16px; color: #666; margin: 0 0 16px; }

        .profile-tab { padding: 10px 20px; background: none; border: none; border-bottom: 2px solid transparent; font-size: 15px; font-weight: 600; color: #666; cursor: pointer; }
        .profile-tab:hover { color: #667eea; }
        .profile-tab.active { color: #667eea; border-bottom-color: #667eea; }
        .no-post-own-story { background: white; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .no-post-own-story p { margin: 0; color: #666; font-size: 14px; }
        .stories-list { display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
        .story-card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .story-header-link { text-decoration: none; display: block; margin-bottom: 12px; }
        .story-header-link:hover .story-author { color: #667eea; }
        .story-header { display: flex; align-items: center; gap: 12px; }
        .story-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        .story-avatar-placeholder { width: 40px; height: 40px; border-radius: 50%; background: #e0e0e0; }
        .story-meta { display: flex; flex-direction: column; }
        .story-author { font-weight: 600; color: #333; }
        .story-date { font-size: 12px; color: #999; }
        .story-content { margin: 0; color: #333; line-height: 1.5; white-space: pre-wrap; }
        .story-media { margin-top: 12px; max-width: 100%; border-radius: 8px; }
        .empty-story { background: white; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .empty-story p { margin: 0; color: #666; }
        .post-receiver-link { text-decoration: none; }
        .post-receiver-header { display: flex; align-items: center; gap: 12px; }
        .post-receiver-meta { display: flex; flex-direction: column; align-items: flex-end; }
        .post-receiver-name { font-weight: 600; color: #333; font-size: 14px; }
        .post-receiver-date { font-size: 12px; color: #999; }
        .post-receiver-link:hover .post-receiver-name { color: #667eea; }
      `}</style>
    </div>
  );
}

export default OrgAccountView;
