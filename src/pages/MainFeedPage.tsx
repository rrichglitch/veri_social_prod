import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../App';
import { getProfileByEmail, getMyStoryPosts, refreshFeed, getPaginatedFeedStories, getPaginatedOrgFeedStories, updateFeedScrollPosition, type FeedStory } from '../utils/spacetime';
import { useOrg } from '../contexts/OrgContext';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import SearchBar from '../components/SearchBar';


function MainFeedPage() {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState('');
  const { email } = useApp();
  const { activeOrg } = useOrg();

  const [isLoading, setIsLoading] = useState(true);
  const [myStories, setMyStories] = useState<any[]>([]);
  const [followedStories, setFollowedStories] = useState<FeedStory[]>([]);
  const [orderOldToNew, setOrderOldToNew] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
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
        const { stories, hasMore: more } = getPaginatedOrgFeedStories(activeOrg.identity, orderOldToNew, 0);
        allStoriesRef.current = stories;
        setFollowedStories(stories);
        setHasMore(more);
        setCurrentPage(0);
        setIsLoading(false);
        return;
      }
      const profile = await getProfileByEmail(email);
      if (profile) {
        const identityHex = profile.identity.toHexString();
        currentIdentityHexRef.current = identityHex;

        const myFeed = await getMyStoryPosts(identityHex);
        setMyStories(myFeed);

        if (refresh) {
          await refreshFeed();
        }
        
        const { stories, hasMore: more } = getPaginatedFeedStories(orderOldToNew, 0);
        allStoriesRef.current = stories;
        setFollowedStories(stories);
        setHasMore(more);
        setCurrentPage(0);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    }
    setIsLoading(false);
  }, [email, orderOldToNew, activeOrg]);

  useEffect(() => {
    if (email) {
      loadData(true);
    }
  }, [email, loadData]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    const { stories, hasMore: more } = activeOrg
      ? getPaginatedOrgFeedStories(activeOrg.identity, orderOldToNew, nextPage)
      : getPaginatedFeedStories(orderOldToNew, nextPage);
    
    allStoriesRef.current = [...allStoriesRef.current, ...stories];
    setFollowedStories(allStoriesRef.current);
    setHasMore(more);
    setCurrentPage(nextPage);
    setIsLoadingMore(false);
  }, [currentPage, hasMore, isLoadingMore, orderOldToNew, activeOrg]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleToggleOrder = async () => {
    const newOrder = !orderOldToNew;
    setOrderOldToNew(newOrder);
    allStoriesRef.current = [];
    const { stories, hasMore: more } = activeOrg
      ? getPaginatedOrgFeedStories(activeOrg.identity, newOrder, 0)
      : getPaginatedFeedStories(newOrder, 0);
    allStoriesRef.current = stories;
    setFollowedStories(stories);
    setHasMore(more);
    setCurrentPage(0);
  };

  const handleScroll = useCallback(async () => {
    const identity = currentIdentityHexRef.current;
    if (!identity) return;

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

    let timestampToSave: Date | null = null;

    if (orderOldToNew) {
      if (isAtBottom && followedStories.length > 0) {
        const oldestStory = followedStories[followedStories.length - 1];
        timestampToSave = new Date(oldestStory.createdAt);
      }
    } else {
      if (isAtTop && followedStories.length > 0) {
        const newestStory = followedStories[0];
        timestampToSave = new Date(newestStory.createdAt);
      }
    }

    if (timestampToSave) {
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
  }, [orderOldToNew, followedStories, hasMore, isLoadingMore, loadMore]);

  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const hasContent = myStories.length > 0 || followedStories.length > 0;

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
        {!hasContent ? (
          <div className="empty-feed">
            <p>No posts yet. Follow some people to see their stories!</p>
            <Link to="/search" className="find-people-link">
              Find People
            </Link>
          </div>
        ) : (
          <div className="feed">
            <div className="feed-controls">
              <button 
                className={`order-toggle ${orderOldToNew ? 'active' : ''}`}
                onClick={handleToggleOrder}
              >
                {orderOldToNew ? '↓ Oldest First' : '↑ Newest First'}
              </button>
            </div>

            {myStories.length > 0 && (
              <div className="feed-section">
                <h2 className="feed-section-title">Your Story</h2>
                <div className="stories-list">
                  {myStories.map((story) => (
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
              </div>
            )}

            {followedStories.length > 0 && (
              <div className="feed-section">
                <h2 className="feed-section-title">Following</h2>
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
                      {story.mediaData && story.mediaData.length > 0 && (
                        <img src={story.mediaData} alt="Story media" className="story-media" />
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
            )}
          </div>
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
          max-width: 500px;
        }

        .main-feed-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .feed-controls {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }

        .order-toggle {
          padding: 8px 16px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          color: #666;
          transition: all 0.2s;
        }

        .order-toggle:hover {
          background: #f5f5f5;
        }

        .order-toggle.active {
          background: #667eea;
          color: white;
          border-color: #667eea;
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

        .feed-section {
          margin-bottom: 32px;
        }

        .feed-section-title {
          font-size: 16px;
          color: #666;
          margin: 0 0 16px;
          font-weight: 600;
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
