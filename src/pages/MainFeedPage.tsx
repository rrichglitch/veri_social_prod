import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../App';
import { getProfileRowByEmail, getMyStoryPosts, refreshFeed, getPaginatedFeedStories, updateFeedScrollPosition, type FeedStory } from '../utils/spacetime';
import { useOrg } from '../contexts/OrgContext';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import SearchBar from '../components/SearchBar';
import ProfileTabs from '../components/ProfileTabs';


function MainFeedPage() {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState('');
  const { email } = useApp();
  const { activeOrg } = useOrg();

  // Loading only while the local profile cache is cold — warm caches render
  // instantly (no RPC on the own feed).
  const [isLoading, setIsLoading] = useState(() => {
    if (activeOrg) return false;
    try {
      return !getProfileRowByEmail(email || '');
    } catch {
      return true;
    }
  });
  const [myStories, setMyStories] = useState<any[]>([]);
  const [followedStories, setFollowedStories] = useState<FeedStory[]>([]);
  const [activeTab, setActiveTab] = useState<'following' | 'mystory'>('following');
  // My Story starts newest-first; the order button flips it.
  const [myStoryNewestFirst, setMyStoryNewestFirst] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // "newest first" / "oldest first" tooltip shown next to the order button
  const [orderTip, setOrderTip] = useState<string | null>(null);
  const orderTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Following is always newest-first — the most recent posts sit at the top.
  const FOLLOWING_ORDER_OLD_TO_NEW = false;

  const lastSaveTimeRef = useRef<number>(0);
  const currentIdentityHexRef = useRef<string>('');
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const allStoriesRef = useRef<FeedStory[]>([]);

  const loadData = useCallback(async (refresh: boolean = true) => {
    if (!email) {
      setIsLoading(false);
      return;
    }

    try {
      if (activeOrg) {
        // Org account: feed = org's story + org's follows
        const myFeed = await getMyStoryPosts(activeOrg.identity);
        setMyStories(myFeed);
        const { stories, hasMore: more } = getPaginatedFeedStories(FOLLOWING_ORDER_OLD_TO_NEW, 0);
        allStoriesRef.current = stories;
        setFollowedStories(stories);
        setHasMore(more);
        setCurrentPage(0);
        setIsLoading(false);
        return;
      }
      const profile = getProfileRowByEmail(email);
      if (profile) {
        const identityHex = profile.identity.toHexString();
        currentIdentityHexRef.current = identityHex;

        const myFeed = await getMyStoryPosts(identityHex);
        setMyStories(myFeed);

        if (refresh) {
          await refreshFeed();
        }

        const { stories, hasMore: more } = getPaginatedFeedStories(FOLLOWING_ORDER_OLD_TO_NEW, 0);
        allStoriesRef.current = stories;
        setFollowedStories(stories);
        setHasMore(more);
        setCurrentPage(0);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    }
    setIsLoading(false);
  }, [email, activeOrg]);

  useEffect(() => {
    if (email) {
      loadData(true);
    }
  }, [email, loadData]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    const { stories, hasMore: more } = getPaginatedFeedStories(FOLLOWING_ORDER_OLD_TO_NEW, nextPage);

    allStoriesRef.current = [...allStoriesRef.current, ...stories];
    setFollowedStories(allStoriesRef.current);
    setHasMore(more);
    setCurrentPage(nextPage);
    setIsLoadingMore(false);
  }, [currentPage, hasMore, isLoadingMore, activeOrg]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleToggleMyStoryOrder = () => {
    setMyStoryNewestFirst((v) => {
      const next = !v;
      // Show which direction the story now appears in, briefly.
      setOrderTip(next ? 'newest first' : 'oldest first');
      if (orderTipTimer.current) clearTimeout(orderTipTimer.current);
      orderTipTimer.current = setTimeout(() => setOrderTip(null), 1800);
      return next;
    });
  };

  const handleScroll = useCallback(async () => {
    const identity = currentIdentityHexRef.current;
    if (!identity) return;

    // Endless scroll only applies to the Following tab.
    if (activeTab !== 'following') return;

    const container = feedContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 100;
    const isAtTop = scrollTop <= 100;

    if (isAtBottom && hasMore && !isLoadingMore) {
      loadMore();
    }

    // Following is newest-first: the newest stories sit at the top, so when
    // the user scrolls back up to the top we remember the newest story's
    // timestamp as the scroll position.
    if (isAtTop && followedStories.length > 0) {
      const newestStory = followedStories[0];
      const timestampToSave = new Date(newestStory.createdAt);
      const now = Date.now();
      if (now - lastSaveTimeRef.current > 30000) {
        try {
          await updateFeedScrollPosition(timestampToSave);
          lastSaveTimeRef.current = now;
          console.log('Feed scroll position saved:', timestampToSave);
        } catch (e) {
          console.error('Error saving feed position:', e);
        }
      }
    }
  }, [activeTab, followedStories, hasMore, isLoadingMore, loadMore]);

  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // My Story can be displayed in either direction — flip without mutating state.
  const displayedMyStories = myStoryNewestFirst
    ? myStories
    : [...myStories].reverse();

  const hasContent = activeTab === 'following'
    ? followedStories.length > 0
    : myStories.length > 0;

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="main-feed-page">
      <TopBar
        left={<Link to="/about" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        center={<div className="topbar-search-wrap"><SearchBar onSearch={handleSearch} value={searchQ} onChange={setSearchQ} onOptionsClick={() => navigate(`/search?q=${encodeURIComponent(searchQ.trim() || "")}&opts=1`)} /></div>}
        absoluteCenter
        right={<AuthActions />}
      />

      <main className="main-content" ref={feedContainerRef}>
        <div className="feed-tab-row">
          <ProfileTabs
            tabs={[
              { key: 'following', label: 'Following' },
              { key: 'mystory', label: 'My Story' },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as 'following' | 'mystory')}
          />
          {activeTab === 'mystory' && (
            <div className="story-order-wrap">
              <button
                className="story-order-btn"
                onClick={handleToggleMyStoryOrder}
                aria-label={myStoryNewestFirst ? 'Show oldest first' : 'Show newest first'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 17V6M8 6l-3.5 3.5M8 6l3.5 3.5" />
                  <path d="M16 7v11M16 18l-3.5-3.5M16 18l3.5-3.5" />
                </svg>
              </button>
              {orderTip && <span className="story-order-tip">{orderTip}</span>}
            </div>
          )}
        </div>

        {activeTab === 'following' ? (
          !hasContent ? (
            <div className="empty-feed">
              <p>No posts yet. Follow some people to see their stories!</p>
              <Link to="/search" className="find-people-link">
                Find People
              </Link>
            </div>
          ) : (
            <div className="feed">
              <div className="stories-list">
                {followedStories.map((story) => (
                  <div key={story.id.toString()} className="story-card">
                    <div className="story-people-row">
                      <Link to={`/profile/${story.posterIdentity.toHexString()}`} className="story-person-col">
                        {story.posterPicture ? (
                          <img src={story.posterPicture} alt={story.posterName} className="person-avatar-lg" />
                        ) : (
                          <div className="person-avatar-placeholder-lg" />
                        )}
                        <span className="person-name-lg">{story.posterName}</span>
                      </Link>
                      <div className="story-middle-col">
                        <span className="small-arrow">→</span>
                        <span className="small-date">{new Date(story.createdAt).toLocaleDateString()}</span>
                      </div>
                      <Link to={`/profile/${story.profileOwnerIdentityHex}`} className="story-person-col">
                        {story.profileOwnerPicture ? (
                          <img src={story.profileOwnerPicture} alt={story.profileOwnerName} className="person-avatar-lg" />
                        ) : (
                          <div className="person-avatar-placeholder-lg" />
                        )}
                        <span className="person-name-lg">{story.profileOwnerName}</span>
                      </Link>
                    </div>
                    <p className="story-content">{story.content}</p>
                    {(story.mediaUrl || (story.mediaData && story.mediaData.length > 0)) && (
                      <img src={story.mediaUrl || story.mediaData} alt="Story media" className="story-media" />
                    )}
                  </div>
                ))}
              </div>
              {isLoadingMore && (
                <div className="loading-more-indicator">
                  Loading more...
                </div>
              )}
            </div>
          )
        ) : (
          <>
            {myStories.length === 0 ? (
              <div className="empty-story">
                <p>No stories about you yet.</p>
              </div>
            ) : (
              <div className="stories-list">
                {displayedMyStories.map((story) => (
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
          </>
        )}
      </main>

      <style>{`
        .org-banner { display: flex; align-items: center; gap: 10px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; }
        .org-banner-pic { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
        .org-banner-pic-placeholder { width: 32px; height: 32px; border-radius: 50%; background: #c7d2fe; }
        .org-banner-name { flex: 1; font-size: 14px; font-weight: 600; color: #3730a3; }
        .org-banner-stop { padding: 6px 14px; background: #ef4444; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .org-banner-stop:hover { background: #dc2626; }
        .topbar-search-wrap {
          width: 100%;
        }

        .main-feed-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .main-content {
          max-width: var(--content-max-width);
          margin: 0 auto;
          padding: 24px;
        }

        .feed-tab-row {
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid #e0e0e0;
          margin-bottom: 20px;
        }

        .feed-tab-row .profile-tabs {
          flex: 1;
          margin-bottom: 0;
          border-bottom: none;
        }

        .story-order-wrap {
          position: relative;
          flex-shrink: 0;
        }

        .story-order-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          background: white;
          border: 1px solid #667eea;
          border-radius: 50%;
          color: #667eea;
          cursor: pointer;
          transition: all 0.2s;
        }

        .story-order-btn:hover {
          background: #667eea;
          color: white;
        }

        .story-order-tip {
          position: absolute;
          right: calc(100% + 8px);
          top: 50%;
          transform: translateY(-50%);
          white-space: nowrap;
          background: #333;
          color: white;
          font-size: 12px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 6px;
          pointer-events: none;
          animation: order-tip-in 0.15s ease-out;
        }

        @keyframes order-tip-in {
          from { opacity: 0; transform: translateY(-50%) translateX(4px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
        }

        .loading-more-indicator {
          text-align: center;
          padding: 16px;
          color: #666;
          font-size: 14px;
        }

        .empty-feed {
          text-align: center;
          padding: 48px 24px;
          background: white;
          border-radius: 12px;
        }

        .empty-feed p {
          color: #666;
          margin: 0 0 16px;
        }

        .find-people-link {
          display: inline-block;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
        }

        .empty-story {
          text-align: center;
          padding: 48px 24px;
          background: white;
          border-radius: 12px;
        }

        .empty-story p {
          color: #666;
          margin: 0;
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

        .story-header-link {
          text-decoration: none;
          display: block;
          margin-bottom: 12px;
        }

        .story-header-link:hover .story-author {
          color: #667eea;
        }

        .story-people-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #eee;
        }

        .story-person-col {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          min-width: 120px;
        }

        .story-person-col:hover .person-name-lg {
          color: #667eea;
        }

        .person-avatar-lg {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .person-avatar-placeholder-lg {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #e0e0e0;
          flex-shrink: 0;
        }

        .person-name-lg {
          font-weight: 600;
          color: #333;
          font-size: 15px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .story-middle-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }

        .small-arrow {
          color: #999;
          font-size: 16px;
        }

        .small-date {
          font-size: 11px;
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

        .loading-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
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

        @media (max-width: 640px) {
          .main-content {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}

export default MainFeedPage;