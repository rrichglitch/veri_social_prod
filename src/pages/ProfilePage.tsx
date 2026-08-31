import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { currentUserEmail, isSignedIn } from '../utils/authState';
import { getOAuthSession } from '../utils/oauthSession';
import ProfileHeader from '../components/ProfileHeader';
import ProfileTabs from '../components/ProfileTabs';
import FriendsList from '../components/FriendsList';
import Gallery from '../components/Gallery';
import { useOrg } from '../contexts/OrgContext';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import { getProfileByIdentity, checkIsFollowing, createStoryPost, getTodayStoryPostCount, getStoriesForProfile, connectToSpacetimeDB, getProfileByEmail, getOrganizationById, orgAccountIdentityHex, checkIsFriend, getOrgMemberRequestStatus, sendOrgMemberRequest, leaveOrg, uploadStoryMedia } from '../utils/spacetime';
import { compressGalleryImage } from '../utils/imageCompress';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES, DAILY_POST_LIMIT } from '../config';
import { isFileSizeValid, isFileTypeValid } from '../utils/sanitize';

interface StoryPost {
  id: bigint;
  content: string;
  mediaData: string;
  mediaTypes: string;
  mediaUrl?: string; // S3-backed media (8/31)
  createdAt: Date;
  posterIdentity: string;
  posterName: string;
  posterPicture: string;
}

// ONE page for BOTH other-individual profiles (/profile/:identity) and
// other-organization profiles (/org/:id) — same styles, same features. The
// only differences for organizations: an Organization badge, a Join/Leave
// button (membership ≡ friendship with the org's account identity) instead
// of Add Friend/Unfriend, and the Friends tab labeled Members.
function ProfilePage() {
  const { identity: profileIdentity, id: orgIdParam } = useParams<{ identity?: string; id?: string }>();
  const navigate = useNavigate();
  const { activeOrg } = useOrg();

  const isOrgView = orgIdParam !== undefined;
  const orgId = isOrgView ? BigInt(orgIdParam || '0') : 0n;
  const orgIdentityHex = isOrgView ? orgAccountIdentityHex(orgId) : '';

  const [currentUserIdentity, setCurrentUserIdentity] = useState<string | null>(null);

  // Background: try to connect and get current user identity
  useEffect(() => {
    const init = async () => {
      try {
        await connectToSpacetimeDB('', undefined);
      } catch (e) {
        console.log('Anonymous connect failed:', e);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const userEmail = currentUserEmail();
      if (!userEmail) return;

      try {
        await connectToSpacetimeDB('', getOAuthSession()?.stToken);
        for (let i = 0; i < 10; i++) {
          const profile = await getProfileByEmail(userEmail);
          if (profile) {
            setCurrentUserIdentity(profile.identity.toHexString());
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (e) {
        console.error('Auth connect failed:', e);
      }
    };
    if (isSignedIn()) {
      initAuth();
    }
  }, []);

  const [profile, setProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stories, setStories] = useState<StoryPost[]>([]);

  const [storyContent, setStoryContent] = useState('');
  const [storyMedia, setStoryMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'story' | 'friends'>('story');

  const currentIdentityHex = currentUserIdentity;
  const isOwnProfile = currentIdentityHex === profileIdentity;

  // Individual profiles: viewing your own redirects to /me.
  useEffect(() => {
    if (!isOrgView && currentIdentityHex && profileIdentity && currentIdentityHex === profileIdentity) {
      navigate('/me', { replace: true });
    }
  }, [isOrgView, currentIdentityHex, profileIdentity, navigate]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!isOrgView && currentIdentityHex === profileIdentity) {
        setIsLoading(false);
        return;
      }
      if (!profileIdentity && !isOrgView) {
        setIsLoading(false);
        return;
      }

      try {
        if (isOrgView) {
          const org = getOrganizationById(orgId);
          if (!org) {
            setIsLoading(false);
            return;
          }
          setProfile({
            identity: orgIdentityHex,
            fullName: org.name,
            profilePicture: org.picture,
            city: org.city,
            description: org.description,
            createdAt: org.createdAt,
            gender: org.gender,
            hideMembers: !!org.hideMembers,
            leaderIdentityHex: org.leaderIdentity.toHexString(),
          });
          if (currentIdentityHex) {
            // Following the org is a SEPARATE quantity from membership.
            setIsFollowing(await checkIsFollowing(orgIdentityHex, currentIdentityHex));
            // Membership ≡ friendship with the org's account identity.
            setIsMember(checkIsFriend(currentIdentityHex, orgIdentityHex));
            setRequestPending(getOrgMemberRequestStatus(orgId, currentIdentityHex) === 'pending');
            setIsLeader(org.leaderIdentity.toHexString() === currentIdentityHex);
            const profileStories = await getStoriesForProfile(orgIdentityHex);
            setStories(profileStories);
          }
        } else {
          const profileData = await getProfileByIdentity(profileIdentity!);
          setProfile(profileData);

          if (profileData && currentIdentityHex) {
            const following = await checkIsFollowing(profileIdentity!, currentIdentityHex);
            setIsFollowing(following);

            const profileStories = await getStoriesForProfile(profileIdentity!);
            setStories(profileStories);
          }
        }
      } catch (e) {
        console.error('Error loading profile:', e);
      }
      setIsLoading(false);
    };

    loadProfile();
    const t = setInterval(loadProfile, 2000);
    return () => clearInterval(t);
  }, [profileIdentity, orgIdParam, isOrgView, currentIdentityHex]);

  const handleFollowChange = (following: boolean) => {
    setIsFollowing(following);
  };

  const handleJoin = async () => {
    try {
      await sendOrgMemberRequest(orgId);
      setRequestPending(true);
    } catch (e: any) {
      alert(e.message || 'Failed to send request');
    }
  };

  const handleLeave = async () => {
    try {
      await leaveOrg(orgId);
      setIsMember(false);
    } catch (e: any) {
      alert(e.message || 'Failed to leave organization');
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isFileTypeValid(file, [...ALLOWED_MEDIA_TYPES])) {
        setPostError('Invalid file type');
        return;
      }
      if (!isFileSizeValid(file, MAX_MEDIA_SIZE_BYTES)) {
        setPostError('File is too large (max 5MB)');
        return;
      }
      setStoryMedia(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setPostError(null);
    }
  };

  const handleSubmitStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyContent.trim() || isOwnProfile) return;

    setIsPosting(true);
    setPostError(null);

    try {
      let mediaData: string | undefined;
      let mediaTypes: string[] | undefined;
      let mediaKey: string | undefined;
      let mediaUrl: string | undefined;
      let mediaBytes: bigint | undefined;
      let mediaType: string | undefined;

      if (storyMedia) {
        // Story media follows the gallery pipeline (8/31): compress to WebP
        // ≤ ~460KB client-side, upload to the relay (500KB cap + sniff +
        // per-user rate limit), store in S3, and link via story_media.
        const compressed = await compressGalleryImage(storyMedia);
        const upload = await uploadStoryMedia(compressed);
        if (!upload) {
          setPostError('Media upload failed — please try again');
          setIsPosting(false);
          return;
        }
        mediaKey = upload.s3Key;
        mediaUrl = upload.url;
        mediaBytes = BigInt(upload.bytes);
        mediaType = 'image/webp';
      }

      const ownerIdentity = isOrgView ? orgIdentityHex : profileIdentity!;
      // Friendly pre-check for the daily post budget (backend enforces too).
      if (getTodayStoryPostCount(currentIdentityHex || '') >= DAILY_POST_LIMIT) {
        setPostError(`Daily post limit reached (${DAILY_POST_LIMIT} per day)`);
        return;
      }
      await createStoryPost(ownerIdentity, storyContent.trim(), mediaData, mediaTypes, activeOrg?.id, mediaKey, mediaUrl, mediaBytes, mediaType);

      setStoryContent('');
      setStoryMedia(null);
      setMediaPreview(null);

      // Refresh stories
      const updatedStories = await getStoriesForProfile(ownerIdentity);
      setStories(updatedStories);
    } catch (error) {
      console.error('Failed to post story:', error);
      setPostError(error instanceof Error ? error.message : 'Failed to post');
    }

    setIsPosting(false);
  };

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading{isOrgView ? ' organization' : ' profile'}...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <TopBar
          left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
          center={<Link to="/" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
          absoluteCenter
          right={<div style={{ width: 36 }} />}
        />
        <main className="main-content">
          <div className="not-found">
            <p>{isOrgView ? 'Organization not found' : 'Profile not found'}</p>
            <Link to="/" className="home-link">Go Home</Link>
          </div>
        </main>
      </div>
    );
  }

  const canPost = !!currentIdentityHex && currentIdentityHex !== (isOrgView ? orgIdentityHex : profileIdentity);

  return (
    <div className="profile-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
        center={<Link to={isSignedIn() ? '/home' : '/'} className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        absoluteCenter
        right={<AuthActions />}
      />

      <main className="main-content">
        <ProfileHeader
          profile={{
            identity: isOrgView ? orgIdentityHex : profileIdentity!,
            full_name: profile.fullName,
            profile_picture: profile.profilePictureSmall || profile.profilePicture,
            city: profile.city,
            description: profile.description,
            created_at: profile.createdAt,
            age: profile.age,
            gender: profile.gender,
          }}
          fullPicture={profile.profilePictureUrl || profile.profilePicture}
          isOwnProfile={isOwnProfile && !isOrgView}
          isFollowing={isFollowing}
          onFollowChange={handleFollowChange}
          currentIdentityHex={currentIdentityHex || undefined}
          isOrgProfile={isOrgView}
          onJoinRequest={handleJoin}
          requestPending={requestPending}
          isOrgMember={isMember}
          isOrgLeader={isLeader}
          onLeaveOrg={handleLeave}
        />

        {/* Gallery — right under the top info section, like Instagram/Facebook */}
        <Gallery
          ownerIdentityHex={isOrgView ? orgIdentityHex : profileIdentity!}
          isOwn={!isOrgView && isOwnProfile}
        />

        <ProfileTabs
          tabs={[
            { key: 'story', label: 'Story' },
            ...(isOrgView
              ? (!profile.hideMembers ? [{ key: 'friends', label: 'Members' }] : [])
              : (!profile.hideFriends ? [{ key: 'friends', label: 'Friends' }] : [])),
          ]}
          active={activeTab}
          onChange={(k) => setActiveTab(k as any)}
        />

        {activeTab === 'friends' ? (
          <FriendsList identity={isOrgView ? orgIdentityHex : profileIdentity!} emptyText={isOrgView ? 'No members yet.' : 'No friends yet.'} />
        ) : (
        <>
        {canPost && (
          <form onSubmit={handleSubmitStory} className="story-form">
            <textarea
              value={storyContent}
              onChange={(e) => setStoryContent(e.target.value)}
              placeholder={`Tell a true story about ${profile.fullName}...`}
              maxLength={CHAR_LIMITS.storyContent}
              className="story-input"
            />
            {mediaPreview && (
              <div className="media-preview">
                <img src={mediaPreview} alt="Preview" />
                <button type="button" onClick={() => { setStoryMedia(null); setMediaPreview(null); }} className="remove-media">×</button>
              </div>
            )}
            <div className="story-form-actions">
              <label className="media-label">
                <input type="file" accept="image/*" onChange={handleMediaChange} hidden />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </label>
              <span className="char-count">{storyContent.length}/{CHAR_LIMITS.storyContent}</span>
              <button type="submit" disabled={isPosting || !storyContent.trim()} className="post-button">
                {isPosting ? 'Posting...' : 'Post'}
              </button>
            </div>
            {postError && <p className="error-message">{postError}</p>}
          </form>
        )}

        <div className="story-section">
          <h2>Story</h2>
          {stories.length === 0 ? (
            <div className="empty-story">
              <p>No stories yet. Be the first to share a story!</p>
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
                  {(story.mediaUrl || (story.mediaData && story.mediaData.length > 0)) && (
                    <img src={story.mediaUrl || story.mediaData} alt="Story media" className="story-media" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </main>

      <style>{`
        .profile-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .main-content {
          max-width: var(--content-max-width);
          margin: 0 auto;
          padding: 24px;
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

        .not-found {
          text-align: center;
          padding: 48px;
          background: white;
          border-radius: 12px;
        }

        .home-link {
          display: inline-block;
          margin-top: 16px;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
        }

        .story-form {
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .story-input {
          width: 100%;
          min-height: 100px;
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          font-family: inherit;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }

        .story-input:focus {
          border-color: #667eea;
        }

        .media-preview {
          position: relative;
          margin-top: 12px;
          display: inline-block;
        }

        .media-preview img {
          max-width: 200px;
          max-height: 200px;
          border-radius: 8px;
        }

        .remove-media {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #dc2626;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
        }

        .story-form-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
        }

        .media-label {
          cursor: pointer;
          color: #666;
          padding: 8px;
          border-radius: 8px;
        }

        .media-label:hover {
          background: #f5f5f5;
          color: #667eea;
        }

        .char-count {
          flex: 1;
          text-align: right;
          font-size: 12px;
          color: #999;
        }

        .post-button {
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .post-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .error-message {
          color: #dc2626;
          font-size: 14px;
          margin-top: 8px;
        }

        .story-section h2 {
          margin: 0 0 16px;
          font-size: 18px;
          color: #333;
        }

        .empty-story {
          text-align: center;
          padding: 32px;
          background: white;
          border-radius: 12px;
          color: #666;
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

        .story-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
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

        .story-media {
          margin-top: 12px;
          max-width: 100%;
          border-radius: 8px;
        }

        .profile-page .picture-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .profile-page .picture-content {
          text-align: center;
        }

        .profile-page .large-picture {
          max-width: 80vw;
          max-height: 70vh;
          border-radius: 8px;
          object-fit: contain;
        }

        .profile-page .large-picture-placeholder {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: #e0e0e0;
          margin: 0 auto;
        }

        .profile-page .picture-modal .close-button {
          display: block;
          margin: 16px auto 0;
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        .profile-page .picture-modal .close-button:hover {
          background: #5a6fd6;
        }
      `}</style>
    </div>
  );
}

export default ProfilePage;