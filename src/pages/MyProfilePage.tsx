import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../App';
import { getProfileByEmail, getMyStoryPosts, getMyPosts, updateProfile, deleteStoryPost, updateLocation, disconnectFromSpacetimeDB } from '../utils/spacetime';
import { clearOAuthSession, getOAuthSession } from '../utils/oauthSession';
import { getBrowserLocation, jitterLocation, reverseGeocode } from '../utils/geo';
import AuthActions from '../components/AuthActions';
import TopBar from '../components/TopBar';
import OrgSection from '../components/OrgSection';
import OrgAccountView from '../components/OrgAccountView';
import LocationSettings, { type LocationPrecision } from '../components/LocationSettings';
import ProfileDetails from '../components/ProfileDetails';
import ProfileTabs from '../components/ProfileTabs';
import FriendsList from '../components/FriendsList';
import { useOrg } from '../contexts/OrgContext';

interface UserProfile {
  identity: string;
  full_name: string;
  profile_picture: string;
  city: string;
  description: string;
  created_at: Date;
  age?: number;
  gender?: string;
  is_pro?: boolean;
}

interface StoryPost {
  id: bigint;
  content: string;
  mediaData: string;
  mediaTypes: string;
  createdAt: Date;
  posterIdentity: string;
  posterName: string;
  posterPicture: string;
}

function MyProfilePage() {
  const navigate = useNavigate();
  const { email } = useApp();
  const { activeOrg } = useOrg();

  const handleLogout = () => {
    const oauthSession = getOAuthSession();
    clearOAuthSession();
    disconnectFromSpacetimeDB();
    if (oauthSession) {
      // OAuth-backed session — returning to the login page is enough
      navigate('/', { replace: true });
    } else {
      // Legacy SpacetimeCloud-OIDC session — full OIDC sign-out
      window.location.href = '/';
    }
  };

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [stories, setStories] = useState<StoryPost[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'story' | 'posts' | 'friends' | 'orgs'>('story');
  const [hideFriends, setHideFriends] = useState(false);
  const [isUpdatingHide, setIsUpdatingHide] = useState(false);
   
  const [showPictureModal, setShowPictureModal] = useState(false);
  const [showPictureSelect, setShowPictureSelect] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [postToDelete, setPostToDelete] = useState<any | null>(null);
  const [locPrecision, setLocPrecision] = useState<LocationPrecision>('off');
  const [isLocUpdating, setIsLocUpdating] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (email) {
      loadProfile();
    }
  }, [email]);

  useEffect(() => {
    if (showPictureSelect) {
      fileInputRef.current?.click();
      setShowPictureSelect(false);
    }
  }, [showPictureSelect]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPictureModal(false);
        setShowQR(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const loadProfile = async () => {
    if (!email) return;
    
    try {
      const profileData = await getProfileByEmail(email);
      if (profileData) {
        const date = profileData.createdAtMicros
          ? new Date(Number(profileData.createdAtMicros) / 1000)
          : new Date();
        const identityHex = profileData.identity.toHexString();
        
        setProfile({
          identity: identityHex,
          full_name: profileData.fullName,
          profile_picture: profileData.profilePicture,
          city: profileData.city,
          description: profileData.description,
          created_at: date,
          age: profileData.age,
          gender: profileData.gender,
          is_pro: profileData.isPro,
        });

        const profileStories = await getMyStoryPosts(identityHex);
        setStories(profileStories);

        const userPosts = await getMyPosts(identityHex);
        setMyPosts(userPosts);
        setLocPrecision((profileData.locationPrecision as LocationPrecision) || 'off');
        setHideFriends(!!profileData.hideFriends);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // "Update" next to Location: fetch a fresh accurate fix, derive the city from it,
  // and store the coords at the current precision (exact when Precise Location is on).
  const handleLocationUpdate = async () => {
    setIsLocUpdating(true);
    try {
      const pos = await getBrowserLocation();
      const city = await reverseGeocode(pos.lat, pos.lng);
      if (city) {
        await updateProfile(undefined, city, undefined);
      }
      const isExact = locPrecision === 'exact';
      const toSend = isExact ? pos : jitterLocation(pos.lat, pos.lng, 5);
      await updateLocation(toSend.lat, toSend.lng, isExact ? 'exact' : 'approx');
      setLocPrecision(isExact ? 'exact' : 'approx');
      await loadProfile();
    } catch (e: any) {
      alert(e?.message === 'Geolocation not supported on this device'
        ? 'This device does not support location services.'
        : 'Could not get your location. Check that location permissions are enabled for this site.');
    } finally {
      setIsLocUpdating(false);
    }
  };

  const handleHideFriendsToggle = async (checked: boolean) => {
    setIsUpdatingHide(true);
    try {
      await updateProfile(undefined, undefined, undefined, checked);
      setHideFriends(checked);
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    } finally {
      setIsUpdatingHide(false);
    }
  };

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        await updateProfile(base64, undefined, undefined);
        await loadProfile();
      } catch (e) {
        console.error('Error updating profile picture:', e);
      } finally {
        setShowPictureSelect(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (activeOrg) {
    return <OrgAccountView />;
  }

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const followUrl = `${window.location.origin}${basePath}/follow/${profile?.identity || ''}`;

  return (
    <div className="my-profile-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
        center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        right={<AuthActions profileReplacement={<button onClick={handleLogout} className="topbar-signin" style={{background:"#dc2626"}}>Log Out</button>} />}
        absoluteCenter
      />

      <main className="main-content">
        <div className="profile-section">
          <ProfileDetails
            picture={profile?.profile_picture || ''}
            name={profile?.full_name || ''}
            city={profile?.city || ''}
            description={profile?.description || ''}
            onUpdateLocation={handleLocationUpdate}
            isLocationUpdating={isLocUpdating}
            onSaveDescription={async (v) => {
              await updateProfile(undefined, undefined, v);
              await loadProfile();
            }}
            age={profile?.age}
            gender={profile?.gender}
            onSaveAgeGender={async (_b, g) => {
              await updateProfile(undefined, undefined, undefined, undefined, g);
              await loadProfile();
            }}
            onPictureClick={() => setShowPictureModal(true)}
            pictureExtra={<button onClick={() => setShowQR(true)} className="share-btn-under-pic">Share</button>}
          >
            <div className="join-row">
              <p className="join-date">
                Joined {profile?.created_at.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
              {!profile?.is_pro && (
                <button className="upgrade-pro-btn" onClick={() => navigate('/upgrade-pro')}>
                  Upgrade to Pro
                </button>
              )}
              {profile?.is_pro && (
                <button className="pro-badge" onClick={() => navigate('/upgrade-pro')} aria-label="View Pro subscription">
                  PRO
                </button>
              )}
            </div>
          </ProfileDetails>
        </div>

        <LocationSettings currentPrecision={locPrecision} onChanged={setLocPrecision} />

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handlePictureChange}
          style={{ display: 'none' }}
        />

        <div className="story-section">
          <ProfileTabs
            tabs={[
              { key: 'story', label: 'Story' },
              { key: 'posts', label: 'Posts' },
              { key: 'friends', label: 'Friends' },
              { key: 'orgs', label: 'Organizations' },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as any)}
          />

          {activeTab === 'orgs' ? (
            <OrgSection profileIdentity={profile?.identity || ''} />
          ) : activeTab === 'friends' ? (
            <FriendsList
              identity={profile?.identity || ''}
              emptyText="You have no friends yet."
              hideToggle={{
                label: 'Hide your friends',
                checked: hideFriends,
                onChange: handleHideFriendsToggle,
                busy: isUpdatingHide,
              }}
            />
          ) : activeTab === 'story' ? (
            <>
              <div className="no-post-own-story">
                <p>You cannot post on your own story. Others can share stories about you.</p>
              </div>

              {stories.length === 0 ? (
                <div className="empty-story">
                  <p>No stories about you yet.</p>
                </div>
              ) : (
                <div className="stories-list">
                  {stories.map((story) => (
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
                <div className="empty-story">
                  <p>You haven't posted on anyone's story yet.</p>
                </div>
              ) : (
                <div className="stories-list">
                  {myPosts.map((post) => (
                    <div key={post.id.toString()} className="story-card">
                      <div className="post-header-row">
                        <button
                          className="delete-post-btn"
                          onClick={() => {
                            setPostToDelete(post);
                            setShowDeleteModal(true);
                          }}
                        >
                          Delete
                        </button>
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
                      </div>
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

      {showQR && (
        <div className="qr-modal" onClick={() => setShowQR(false)}>
          <div className="qr-content" onClick={(e) => e.stopPropagation()}>
            <h3>Scan to Follow Me</h3>
            <div className="qr-code">
              <QRCodeSVG value={followUrl} size={200} />
            </div>
            <p className="qr-instruction">
              Anyone can scan this code to quickly follow your story.
            </p>
            <button onClick={() => setShowQR(false)} className="close-button">
              Close
            </button>
          </div>
        </div>
      )}

      {showPictureModal && (
        <div className="picture-modal" onClick={() => setShowPictureModal(false)}>
          <div className="picture-content" onClick={(e) => e.stopPropagation()}>
            {profile?.profile_picture ? (
              <img src={profile.profile_picture} alt={profile.full_name} className="large-picture" />
            ) : (
              <div className="large-picture-placeholder" />
            )}
            <div className="picture-modal-actions">
              <button onClick={() => { setShowPictureModal(false); setShowPictureSelect(true); }} className="change-photo-btn">
                Change Photo
              </button>
              <button onClick={() => setShowPictureModal(false)} className="close-button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && postToDelete && (
        <div className="delete-modal" onClick={() => setShowDeleteModal(false)}>
          <div className="delete-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Post?</h3>
            <div className="delete-modal-post">
              <div className="post-header-row">
                <Link to={`/profile/${postToDelete.profileOwnerIdentity}`} className="post-receiver-link" onClick={() => setShowDeleteModal(false)}>
                  <div className="post-receiver-header">
                    <div className="post-receiver-meta">
                      <span className="post-receiver-name">{postToDelete.profileOwnerName}</span>
                      <span className="post-receiver-date">{new Date(postToDelete.createdAt).toLocaleDateString()}</span>
                    </div>
                    {postToDelete.profileOwnerPicture ? (
                      <img src={postToDelete.profileOwnerPicture} alt={postToDelete.profileOwnerName} className="story-avatar" />
                    ) : (
                      <div className="story-avatar-placeholder" />
                    )}
                  </div>
                </Link>
              </div>
              <p className="story-content">{postToDelete.content}</p>
              {postToDelete.mediaData && postToDelete.mediaData.length > 0 && (
                <img src={postToDelete.mediaData} alt="Story media" className="story-media" />
              )}
            </div>
            <p className="delete-modal-text">This action cannot be undone.</p>
            <div className="delete-modal-actions">
              <button onClick={() => setShowDeleteModal(false)} className="cancel-delete-btn">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteStoryPost(postToDelete.id);
                    setMyPosts((prev) => prev.filter((p) => p.id !== postToDelete.id));
                    setShowDeleteModal(false);
                    setPostToDelete(null);
                  } catch (e) {
                    console.error('Failed to delete post:', e);
                    alert('Failed to delete post');
                  }
                }}
                className="confirm-delete-btn"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .my-profile-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .profile-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .join-date {
          margin: 0;
          font-size: 13px;
          color: #999;
        }
        .join-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .upgrade-pro-btn { padding: 5px 14px; background: #f59e0b; color: white; border: none; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
        .upgrade-pro-btn:hover { background: #d97706; }
        .pro-badge { padding: 3px 10px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; cursor: pointer; transition: filter 0.15s; }
        .pro-badge:hover { filter: brightness(1.08); }
        .pro-badge:active { filter: brightness(0.85); }

                }

        .story-section h2 {
          font-size: 16px;
          color: #666;
          margin: 0 0 16px;
        }

        .no-post-own-story {
          background: white;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .no-post-own-story p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .stories-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow: hidden;
        }

        .story-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .story-header-link {
          text-decoration: none;
          display: block;
          margin-bottom: 12px;
        }

        .story-header-link:hover .story-author {
          color: #667eea;
        }

        .story-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .story-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }

        .story-avatar-placeholder {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .story-meta {
          display: flex;
          flex-direction: column;
        }

        .story-author {
          font-weight: 600;
          color: #333;
        }

        .story-date {
          font-size: 12px;
          color: #999;
        }

        .story-content {
          margin: 0;
          color: #333;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .post-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .post-receiver-link {
          text-decoration: none;
        }

        .post-receiver-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .post-receiver-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .post-receiver-name {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .post-receiver-date {
          font-size: 12px;
          color: #999;
        }

        .post-receiver-link:hover .post-receiver-name {
          color: #667eea;
        }

        .delete-post-btn {
          padding: 6px 14px;
          background: white;
          color: #dc2626;
          border: 1px solid #dc2626;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .delete-post-btn:hover {
          background: #dc2626;
          color: white;
        }

        .story-media {
          margin-top: 12px;
          max-width: 100%;
          border-radius: 8px;
        }

        .empty-story {
          background: white;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .empty-story p {
          margin: 0;
          color: #666;
        }

        .loading-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .delete-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .delete-modal-content {
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 600px;
          width: 90%;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .delete-modal-content h3 {
          margin: 0 0 16px;
          font-size: 18px;
          color: #333;
        }

        .delete-modal-post {
          background: #f8f8f8;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .delete-modal-post .post-header-row {
          margin-bottom: 8px;
          justify-content: flex-end;
        }

        .delete-modal-post .story-content {
          margin: 0;
          font-size: 14px;
        }

        .delete-modal-post .story-media {
          margin-top: 8px;
          max-height: 150px;
          object-fit: cover;
        }

        .delete-modal-text {
          margin: 0 0 16px;
          font-size: 14px;
          color: #666;
          text-align: center;
        }

        .delete-modal-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .cancel-delete-btn {
          padding: 10px 24px;
          background: white;
          color: #666;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-delete-btn:hover {
          background: #f5f5f5;
        }

        .confirm-delete-btn {
          padding: 10px 24px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .confirm-delete-btn:hover {
          background: #b91c1c;
        }

        .qr-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .qr-content {
          background: white;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          max-width: 90%;
        }

        .qr-content h3 {
          margin: 0 0 16px;
          color: #333;
        }

        .qr-code {
          margin-bottom: 16px;
        }

        .qr-instruction {
          margin: 0 0 8px;
          font-size: 14px;
          color: #666;
        }

        .picture-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .picture-content {
          text-align: center;
        }

        .large-picture {
          max-width: 80vw;
          max-height: 70vh;
          border-radius: 8px;
          object-fit: contain;
        }

        .large-picture-placeholder {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: #e0e0e0;
          margin: 0 auto;
        }

        .picture-modal-actions {
          margin-top: 16px;
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .change-photo-btn {
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        .change-photo-btn:hover {
          background: #5a6fd6;
        }

        .close-button {
          margin: 0;
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        @media (max-width: 640px) {
          .header {
            padding: 10px 16px;
          }

          .main-content {
            padding: 16px;
          }

        }
      `}</style>
    </div>
  );
}

export default MyProfilePage;
